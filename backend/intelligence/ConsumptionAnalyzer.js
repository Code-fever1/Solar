"use strict";

/**
 * ConsumptionAnalyzer v2 — mode- and day-type-aware load anomaly detection.
 *
 * v1 compared current load to one blended bucket baseline. v2 picks the
 * RIGHT baseline for this moment:
 *   1. day-type bucket baseline (weekday vs weekend)
 *   2. if the current household mode has its own learned load (bypass/hybrid),
 *      the mode baseline is blended in — a grid-only bypass hour is not
 *      "high consumption" just because solar hours were lighter.
 *
 * v1's evening low-consumption branch was dead code (ratio <= 0.25 could
 * never be > 0.3) — removed.
 */

const { bucketForHour, normalizeHouseholdMode } = require("./DailyPatternLearner");

const CONFIG = {
  highThreshold: 2.0,      // 100% above normal → high
  veryHighThreshold: 2.6,  // 160% above normal → very high
  lowThreshold: 0.3,       // below 30% of normal → unusually low
  minPersistenceCount: 8,  // ~8 checks (~25s at live cadence)
  minExpectedW: 400,       // don't trigger against a near-zero baseline
  recoveryCount: 2,
  modeBlend: 0.35,         // weight of the mode baseline in the expectation
};

/**
 * @param {object} params
 * @param {number} params.currentLoadW
 * @param {object} params.patternProfile - v2 profile
 * @param {string} params.dayType        - "weekday" | "weekend"
 * @param {string} params.mode           - "on_grid"|"hybrid"|"bypass"|"night"
 * @param {object} params.consumptionState
 * @param {number} params.confidence
 * @param {number} params.now
 */
function analyzeConsumption({
  currentLoadW,
  patternProfile,
  dayType = "weekday",
  mode = "on_grid",
  consumptionState,
  confidence,
  now = Date.now(),
}) {
  const pkHour = Math.floor((now / 3_600_000 + 5) % 24);
  const bucketId = bucketForHour(pkHour);
  const bucket = patternProfile.buckets?.[bucketId];
  mode = normalizeHouseholdMode(mode);
  if (!bucket) {
    consumptionState.count = 0;
    consumptionState.recoveryCount = 0;
    return { type: null, severity: "none", message: null };
  }

  // Baseline: day-type first, aggregate fallback, mode blend on top.
  const dayStats = bucket.byDayType?.[dayType] || bucket;
  let expectedW = dayStats.loadWavg || bucket.loadWavg;
  const modeStats = patternProfile.modes?.[mode];
  if (modeStats?.loadWavg > 0 && modeStats.loadSampleCount >= 10) {
    // In bypass, the house draws everything from grid — the blended mode
    // baseline prevents "high consumption" false alarms on solar-free hours.
    expectedW = Math.round(expectedW * (1 - CONFIG.modeBlend) + modeStats.loadWavg * CONFIG.modeBlend);
  }

  if (expectedW < CONFIG.minExpectedW) {
    consumptionState.count = 0;
    consumptionState.recoveryCount = 0;
    return { type: null, severity: "none", message: null, expectedW, actualW: currentLoadW, deviationPct: 0, baselineSource: "too_low" };
  }

  const ratio = currentLoadW / expectedW;
  const deviationPct = Math.round((ratio - 1) * 100);

  let isAnomalous = false;
  let anomalyType = null;
  let severity = "none";

  if (ratio >= CONFIG.veryHighThreshold) {
    isAnomalous = true; anomalyType = "very_high"; severity = "high";
  } else if (ratio >= CONFIG.highThreshold) {
    isAnomalous = true; anomalyType = "high"; severity = "medium";
  } else if (ratio <= CONFIG.lowThreshold && expectedW > 800 && mode !== "night" && mode !== "bypass") {
    // A quiet house at night is not an anomaly. Only flag daytime collapse.
    isAnomalous = true; anomalyType = "low"; severity = "low";
  }

  if (isAnomalous) {
    consumptionState.count = (consumptionState.count || 0) + 1;
    consumptionState.recoveryCount = 0;
  } else {
    consumptionState.recoveryCount = (consumptionState.recoveryCount || 0) + 1;
    if (consumptionState.recoveryCount >= CONFIG.recoveryCount) consumptionState.count = 0;
  }

  const persistent = (consumptionState.count || 0) >= CONFIG.minPersistenceCount;
  if (!persistent) {
    return { type: null, severity: "none", message: null, expectedW, actualW: currentLoadW, deviationPct, baselineSource: expectedW === bucket.loadWavg ? "bucket" : "daytype_mode" };
  }

  let message = null;
  const dayLabel = dayType === "weekend" ? "weekends" : "weekdays";
  if (anomalyType === "very_high" || anomalyType === "high") {
    message = `Home draw is ${deviationPct}% above the norm for this time on ${dayLabel} (expected ~${expectedW}W, now ${Math.round(currentLoadW)}W). An appliance may have been left on.`;
  } else if (anomalyType === "low") {
    message = `Home draw is unusually low (${Math.abs(deviationPct)}% below norm) — expected ~${expectedW}W at this time on ${dayLabel}.`;
  }

  return {
    type: anomalyType === "low" ? "low_consumption" : "high_consumption",
    severity,
    expectedW,
    actualW: currentLoadW,
    deviationPct,
    confidence: Math.round(confidence * 100) / 100,
    persistent: true,
    message,
    bucketId,
    dayType,
    mode,
    baselineSource: "daytype_mode",
  };
}

module.exports = { analyzeConsumption, CONFIG };
