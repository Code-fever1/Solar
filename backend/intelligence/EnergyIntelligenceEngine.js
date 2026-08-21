"use strict";

/**
 * EnergyIntelligenceEngine — top-level orchestrator.
 *
 * Combines:
 *   DailyPatternLearner + MeterAdvisor + SolarAnomalyDetector +
 *   GridStateAnalyzer + ConsumptionAnalyzer + ConfidenceEngine +
 *   InsightGenerator
 *
 * into a single intelligence state that is included in the SSE live payload.
 *
 * Caching strategy:
 *   - Historical pattern learning is expensive (DB queries) → cached for 5 min
 *   - Real-time scoring (meter, solar, grid, consumption) runs on every call (~3s)
 *   - Notification cooldown prevents repeating the same notification
 */

const { learnDailyPatterns, bucketForHour } = require("./DailyPatternLearner");
const { computeMeterRecommendation } = require("./MeterAdvisor");
const { detectSolarAnomaly } = require("./SolarAnomalyDetector");
const { classifyGridState } = require("./GridStateAnalyzer");
const { analyzeConsumption } = require("./ConsumptionAnalyzer");
const {
  computeOverallConfidence,
  computeMeterConfidence,
  computeSolarConfidence,
  computeConsumptionConfidence,
} = require("./ConfidenceEngine");
const { generateInsight } = require("./InsightGenerator");

const PATTERN_CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const NOTIFICATION_COOLDOWN_MS = 30 * 60_000; // 30 minutes

/**
 * Create a new EnergyIntelligenceEngine instance.
 *
 * @param {object} collections - MongoDB collections:
 *   { inverterSnapshots, tomznSnapshots, allocations }
 * @returns {object} engine with .compute() method
 */
function createEnergyIntelligenceEngine(collections) {
  // ── Persistent state (survives across compute() calls) ──
  const patternCache = { profile: null, generatedAt: 0 };

  // Hysteresis state for meter advisor
  const meterHysteresis = {
    advantageStart: 0,
    advantageMeter: null,
    lastRecommendationAt: 0,
  };

  // Anomaly detection persistent state
  const solarAnomalyState = { count: 0, recoveryCount: 0, lastAnomalyAt: 0 };
  const consumptionState = { count: 0, recoveryCount: 0 };

  // Grid state persistent state
  const gridStateTracker = {
    lastConnected: undefined,
    cutoffStart: 0,
    wasCutoff: false,
    restoredAt: 0,
    transitions: [],
  };

  // Notification cooldown tracker: { [status]: lastNotifiedAt }
  const notificationCooldowns = {};

  // Last computed state (for delta detection)
  let lastStatus = null;

  /**
   * Get the cached pattern profile, or re-learn if stale.
   */
  async function getPatternProfile(now) {
    if (patternCache.profile && (now - patternCache.generatedAt) < PATTERN_CACHE_TTL_MS) {
      return patternCache.profile;
    }
    const profile = await learnDailyPatterns(collections, now);
    patternCache.profile = profile;
    patternCache.generatedAt = now;
    return profile;
  }

  /**
   * Compute the current intelligence state.
   *
   * @param {object} liveData - current live telemetry
   * @param {object} liveData.inverter - inverter snapshot
   * @param {object} liveData.tomznLive - TOMZN live data
   * @param {object} liveData.gridFlow - { mode, direction, homeW, ... }
   * @param {object} liveData.weather - { isDay, cloudCover, ... }
   * @param {object} liveData.state - solar_engine_state (meters, activeMeter, slabTarget)
   * @returns {object} intelligence state for SSE payload
   */
  async function compute(liveData) {
    const now = Date.now();

    // Get pattern profile (cached)
    let patternProfile;
    try {
      patternProfile = await getPatternProfile(now);
    } catch (e) {
      // If pattern learning fails, return a minimal state
      return {
        status: "INSUFFICIENT_DATA",
        title: "Learning Your Home's Energy Pattern",
        message: "Collecting data to provide insights.",
        confidence: 0.1,
        severity: "info",
        reasonCodes: ["PATTERN_LEARNING_FAILED"],
        meterRecommendation: null,
        anomalies: [],
        timestamp: now,
      };
    }

    const confidenceLevel = patternProfile.confidence.level;
    const pkHour = Math.floor((now / 3_600_000 + 5) % 24);
    const currentBucketId = bucketForHour(pkHour);
    const currentMode = liveData.gridFlow?.mode || "night";

    // ── Compute confidence scores ──
    const overallConfidence = computeOverallConfidence(patternProfile, currentBucketId);
    const meterConfidence = computeMeterConfidence(patternProfile, currentBucketId, currentMode);
    const solarConfidence = computeSolarConfidence(patternProfile, currentBucketId);
    const consumptionConfidence = computeConsumptionConfidence(patternProfile, currentBucketId);

    // ── Run all analyzers ──
    const meterRec = computeMeterRecommendation({
      meters: liveData.state?.meters || { meter1: {}, meter2: {} },
      activeMeter: liveData.state?.activeMeter || "meter1",
      patternProfile,
      currentMode,
      slabTarget: liveData.state?.slabTargetUnits || 200,
      hysteresisState: meterHysteresis,
      now,
    });

    const solarAnomaly = detectSolarAnomaly({
      actualSolarW: liveData.inverter?.solarW || 0,
      patternProfile,
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
      gridState: gridStateTracker,
      now,
    });

    const consumptionResult = analyzeConsumption({
      currentLoadW: liveData.gridFlow?.homeW || liveData.inverter?.loadW || 0,
      patternProfile,
      consumptionState,
      confidence: consumptionConfidence,
      now,
    });

    // ── Generate top-level insight ──
    const insight = generateInsight({
      gridState: gridResult,
      solarAnomaly,
      consumption: consumptionResult,
      meterRec,
      confidenceLevel,
      confidence: overallConfidence,
    });

    // ── Notification cooldown ──
    let shouldNotify = false;
    if (insight.notificationPriority !== "none" && insight.status !== lastStatus) {
      const lastNotified = notificationCooldowns[insight.status] || 0;
      if (now - lastNotified > NOTIFICATION_COOLDOWN_MS) {
        shouldNotify = true;
        notificationCooldowns[insight.status] = now;
      }
    }
    lastStatus = insight.status;

    // ── Build final state ──
    // Use the composite insight from InsightGenerator directly.
    // It already contains all the fields we need.
    return {
      headline: insight.headline,
      overallStatus: insight.overallStatus,
      suggestions: insight.suggestions,
      confidence: Math.round(insight.confidence * 100) / 100,
      confidenceLevel,
      meterRecommendation: insight.meterRecommendation,
      details: insight.details,
      // Backward compat
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

module.exports = { createEnergyIntelligenceEngine };
