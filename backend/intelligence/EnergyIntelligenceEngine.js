"use strict";

/**
 * EnergyIntelligenceEngine v2 — adaptive household advisor.
 *
 * Orchestrates the v2 modules:
 *   DailyPatternLearner  → weekday/weekend, per-mode, voltage, export, hourly
 *   MeterAdvisor         → reserve-protected, time-remaining, slab timing
 *   ExportAnalyzer       → learned export windows + load-shift advice
 *   VoltageAnalyzer      → brownout, panel vs inverter input, AC output
 *   SolarAnomalyDetector → day-type solar baseline
 *   ConsumptionAnalyzer  → mode/day-type load baseline
 *   GridStateAnalyzer    → cutoff / unstable / brownout / restored
 *   InsightGenerator     → professional, prioritised advice
 *
 * compute() runs on every live payload build; heavy learning is cached 5 min.
 */

const { learnDailyPatterns, bucketForHour, pakistanDayType, normalizeHouseholdMode } = require("./DailyPatternLearner");
const { computeMeterRecommendation, DEFAULT_RESERVE } = require("./MeterAdvisor");
const { detectSolarAnomaly } = require("./SolarAnomalyDetector");
const { classifyGridState } = require("./GridStateAnalyzer");
const { analyzeConsumption } = require("./ConsumptionAnalyzer");
const { analyzeExport } = require("./ExportAnalyzer");
const { analyzeVoltage } = require("./VoltageAnalyzer");
const {
  computeOverallConfidence,
  computeMeterConfidence,
  computeSolarConfidence,
  computeConsumptionConfidence,
} = require("./ConfidenceEngine");
const { generateInsight } = require("./InsightGenerator");

const PATTERN_CACHE_TTL_MS = 5 * 60_000;
const NOTIFICATION_COOLDOWN_MS = 30 * 60_000;

function insufficientIntelligence(now, reason = "PATTERN_LEARNING_PENDING") {
  return {
    headline: "On track",
    overallStatus: "info",
    suggestions: [],
    confidence: 0.1,
    confidenceLevel: "insufficient_data",
    meterRecommendation: null,
    status: "INSUFFICIENT_DATA",
    title: "On track",
    message: "Waiting on household data.",
    severity: "info",
    reasonCodes: [reason],
    notification: null,
    timestamp: now,
  };
}

function createEnergyIntelligenceEngine(collections) {
  const patternCache = { profile: null, generatedAt: 0, learning: null };
  const meterHysteresis = { lastAdvice: null, lastChangedAt: 0 };
  const solarAnomalyState = { count: 0, recoveryCount: 0, lastAnomalyAt: 0, voltageHistory: [], fluctuationCount: 0 };
  const consumptionState = { count: 0, recoveryCount: 0 };
  const voltageState = { grid: { count: 0, recovery: 0 }, panel: { count: 0, recovery: 0 }, pvinput: { count: 0, recovery: 0 }, ac: { count: 0, recovery: 0 } };
  const gridStateTracker = {
    lastConnected: undefined,
    cutoffStart: 0,
    wasCutoff: false,
    restoredAt: 0,
    brownoutStart: 0,
    transitions: [],
  };
  const notificationCooldowns = {};
  let lastStatus = null;

  async function getPatternProfile(now) {
    const cacheFresh = patternCache.profile && (now - patternCache.generatedAt) < PATTERN_CACHE_TTL_MS;
    if (!cacheFresh && !patternCache.learning) {
      // Never await learning on the live SSE path — 14-day Mongo loads can
      // stall /live for seconds and starve the 846 MB VM. Refresh in background
      // and keep serving the last good profile (or null on first boot).
      patternCache.learning = learnDailyPatterns(collections, now)
        .then((profile) => {
          patternCache.profile = profile;
          patternCache.generatedAt = Date.now();
        })
        .catch((err) => {
          console.error("[Intelligence] pattern learn failed:", err.message);
        })
        .finally(() => {
          patternCache.learning = null;
        });
    }
    return patternCache.profile;
  }

  /** Current live burn in METER units/hour (calibrated), blended with the learned hourly curve. */
  function burnUnitsPerHour(liveData, profile, dayType, activeMeter) {
    const state = liveData.state || {};
    const meter = state.meters?.[activeMeter] || {};
    const calibration = Number(meter.tomznToMeterRatio) > 0 ? meter.tomznToMeterRatio
      : Number(meter.calibrationFactor) > 0 ? meter.calibrationFactor
      : 1;
    const now = Date.now();
    const pkHour = Math.floor((now / 3_600_000 + 5) % 24);

    // Instantaneous draw (W → kWh/h → meter units/h)
    const drawW = Number(liveData.gridFlow?.homeW) || Number(liveData.inverter?.loadW) || Number(liveData.tomznLive?.powerW) || 0;
    const livePerHour = (drawW / 1000) * calibration;

    // Learned hourly curve for this day type (units/hour)
    const curveKwh = profile.hourly?.[dayType]?.usageKwh?.[pkHour] || 0;
    const learnedPerHour = curveKwh * calibration;

    // Blend: lean live, but floor by the learned curve when live is near 0
    // (a brief 0W poll must not claim "infinite hours left").
    if (livePerHour >= 0.03) return livePerHour;
    if (learnedPerHour > 0) return learnedPerHour;
    return 0.02;
  }

  async function compute(liveData) {
    const now = Date.now();
    let patternProfile;
    try {
      patternProfile = await getPatternProfile(now);
    } catch (_e) {
      return insufficientIntelligence(now, "PATTERN_LEARNING_FAILED");
    }
    if (!patternProfile) {
      return insufficientIntelligence(now, "PATTERN_LEARNING_PENDING");
    }

    const dayType = pakistanDayType(now);
    const confidenceLevel = patternProfile.confidence.level;
    const pkHour = Math.floor((now / 3_600_000 + 5) % 24);
    const currentBucketId = bucketForHour(pkHour);
    const currentMode = normalizeHouseholdMode(liveData.gridFlow?.mode || liveData.inverter?.inverterMode || "night");
    const billingDay = liveData.state?.billingDay || 28;
    const cycleEndAt = Number(liveData.household?.cycleEndAt) || nextCycleEnd(now, billingDay);
    const remainingCycleDays = Math.max(0, (cycleEndAt - now) / 86_400_000);
    const activeMeter = liveData.state?.activeMeter || "meter1";

    const overallConfidence = computeOverallConfidence(patternProfile, currentBucketId);
    const solarConfidence = computeSolarConfidence(patternProfile, currentBucketId, dayType);
    const consumptionConfidence = computeConsumptionConfidence(patternProfile, currentBucketId, dayType);

    const household = {
      averageDaily: Number(liveData.household?.averageDaily) || 0,
      lastMonthTotal: Number(liveData.household?.lastMonthTotal) || 0,
      projectedMonthly: Number(liveData.household?.projectedMonthly) || 0,
      todayUsage: Number(liveData.household?.todayUsage) || 0,
      todayExportKwh: Number(liveData.household?.todayExportKwh) || 0,
      remainingCycleDays: Number(liveData.household?.remainingCycleDays) || remainingCycleDays,
      cycleEndAt,
      mode: currentMode,
      direction: liveData.gridFlow?.direction || "idle",
      homeW: Number(liveData.gridFlow?.homeW) || 0,
      solarW: Number(liveData.gridFlow?.solarW) || Number(liveData.inverter?.solarW) || 0,
    };

    const remainingOverride = liveData.household?.remaining && Number.isFinite(liveData.household.remaining.meter1) && Number.isFinite(liveData.household.remaining.meter2)
      ? liveData.household.remaining
      : null;

    const meterConfidence = computeMeterConfidence(patternProfile, currentBucketId, currentMode, dayType, remainingOverride ? "override" : "computed");
    const burnPerHour = burnUnitsPerHour(liveData, patternProfile, dayType, activeMeter);

    const meterRec = computeMeterRecommendation({
      meters: liveData.state?.meters || { meter1: {}, meter2: {} },
      activeMeter,
      slabTarget: liveData.state?.slabTargetUnits || 200,
      averageDaily: household.averageDaily,
      burnUnitsPerHour: burnPerHour,
      cycleEndAt,
      now,
      reserve: DEFAULT_RESERVE,
      confidence: meterConfidence,
      remainingOverride,
    });

    // Hysteresis: never hide a real alert/warning. Only dampen info-level
    // flip-flops (keep <-> planned switch) so the card doesn't chatter.
    const adviceKey = `${meterRec.urgency}|${meterRec.recommendation}|${meterRec.reason}`;
    const isHard = meterRec.urgency === "alert" || meterRec.urgency === "warning";
    // Info-level subsidy/efficiency suggestions show once, then hide for 2 hours
    // so they don't nag the user who's intentionally running a single meter.
    const isOneShotInfo = !isHard && (meterRec.reason === "SUBSIDY_AVAILABLE" || meterRec.reason === "EFFICIENCY_SUGGESTION");
    if (isOneShotInfo && meterHysteresis.lastAdvice === adviceKey && (now - meterHysteresis.lastChangedAt) > 30_000) {
      // Already shown for 30s — suppress for 2 hours.
      meterRec.urgency = "none";
      meterRec.shouldSwitch = false;
      meterRec.text = null;
      meterRec.switchPlan = meterRec.switchPlan ? { ...meterRec.switchPlan, mode: "keep" } : null;
    } else if (!isHard && meterHysteresis.lastAdvice && meterHysteresis.lastAdvice !== adviceKey && (now - meterHysteresis.lastChangedAt) < 15 * 60_000) {
      meterRec.urgency = "none";
      meterRec.shouldSwitch = false;
      meterRec.text = null;
      meterRec.switchPlan = meterRec.switchPlan ? { ...meterRec.switchPlan, mode: "keep" } : null;
    } else if (meterHysteresis.lastAdvice !== adviceKey) {
      meterHysteresis.lastAdvice = adviceKey;
      meterHysteresis.lastChangedAt = now;
    }

    const liveLoadW = Number(liveData.gridFlow?.homeW) || Number(liveData.inverter?.loadW) || 0;
    const solarAnomaly = detectSolarAnomaly({
      actualSolarW: liveData.inverter?.solarW || 0,
      currentLoadW: liveLoadW,
      patternProfile,
      dayType,
      weather: liveData.weather || {},
      anomalyState: solarAnomalyState,
      confidence: solarConfidence,
      now,
    });

    const gridResult = classifyGridState({
      gridConnected: liveData.inverter?.gridConnected !== false,
      tomznPowerW: liveData.tomznLive?.powerW || 0,
      inverterMode: liveData.inverter?.inverterMode || "unknown",
      inverterOnline: liveData.inverter?.isOnline !== false,
      tomznOnline: liveData.tomznLive?.isOnline !== false,
      tomznVoltageV: liveData.tomznLive?.voltageV || 0,
      tomznFaultCode: liveData.tomznLive?.faultCode || 0,
      gridDirection: liveData.gridFlow?.direction,
      gridState: gridStateTracker,
      now,
    });

    const consumptionResult = analyzeConsumption({
      currentLoadW: liveLoadW,
      patternProfile,
      dayType,
      mode: currentMode,
      consumptionState,
      confidence: consumptionConfidence,
      now,
    });

    const voltageResult = analyzeVoltage({
      inverter: liveData.inverter || {},
      tomznLive: liveData.tomznLive || {},
      bucket: patternProfile.buckets?.[currentBucketId]?.byDayType?.[dayType] || patternProfile.buckets?.[currentBucketId],
      mode: currentMode,
      currentLoadW: liveLoadW,
      state: voltageState,
    });

    const exportResult = analyzeExport({
      exportProfile: patternProfile.export,
      dayType,
      bucketId: currentBucketId,
      gridFlow: liveData.gridFlow || {},
      todayExportKwh: household.todayExportKwh,
      weather: liveData.weather || {},
    });

    const insight = generateInsight({
      gridState: gridResult,
      solarAnomaly,
      consumption: consumptionResult,
      meterRec,
      voltage: voltageResult,
      exportAnalysis: exportResult,
      confidenceLevel,
      confidence: overallConfidence,
      household,
      dayType,
    });

    let shouldNotify = false;
    if (insight.notificationPriority !== "none" && insight.status !== lastStatus) {
      const lastNotified = notificationCooldowns[insight.status] || 0;
      if (now - lastNotified > NOTIFICATION_COOLDOWN_MS) {
        shouldNotify = true;
        notificationCooldowns[insight.status] = now;
      }
    }
    lastStatus = insight.status;

    return {
      headline: insight.headline,
      overallStatus: insight.overallStatus,
      suggestions: insight.suggestions,
      confidence: Math.round(insight.confidence * 100) / 100,
      confidenceLevel,
      meterRecommendation: insight.meterRecommendation,
      details: insight.details,
      status: insight.status,
      title: insight.title,
      message: insight.message,
      severity: insight.severity,
      reasonCodes: insight.reasonCodes,
      notification: shouldNotify ? {
        priority: insight.notificationPriority,
        status: insight.status,
        title: insight.title,
        message: insight.message,
      } : null,
      timestamp: now,
    };
  }

  return { compute };
}

function nextCycleEnd(now, billingDay) {
  const PK = "+05:00";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(now));
  const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  let year = Number(byType.year);
  let month = Number(byType.month);
  const thisTick = Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(billingDay).padStart(2, "0")}T12:00:00${PK}`);
  if (now < thisTick) return thisTick;
  month += 1;
  if (month === 13) { month = 1; year += 1; }
  return Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(billingDay).padStart(2, "0")}T12:00:00${PK}`);
}

module.exports = { createEnergyIntelligenceEngine };
