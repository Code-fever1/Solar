"use strict";

/**
 * ConsumptionAnalyzer — detects unusual home consumption.
 *
 * Learns normal home load by time of day from historical data and flags
 * when current consumption is significantly above or below normal.
 *
 * Uses persistence/debounce to avoid alerting on transient load changes.
 */

const { bucketForHour } = require("./DailyPatternLearner");

const CONFIG = {
  // Deviation thresholds (ratio of actual/expected)
  highThreshold: 1.6,      // 60% above normal → high
  veryHighThreshold: 2.2,  // 120% above normal → very high
  lowThreshold: 0.4,       // 60% below normal → low
  // Persistence: must be sustained for N checks
  minPersistenceCount: 4,  // ~4 checks × ~10s = ~40s
  // Minimum expected load to trigger (don't trigger at night with 0W)
  minExpectedW: 200,
  // Recovery count before clearing
  recoveryCount: 2,
};

/**
 * Detect unusual consumption.
 *
 * @param {object} params
 * @param {number} params.currentLoadW - current home load
 * @param {object} params.patternProfile - from DailyPatternLearner
 * @param {object} params.consumptionState - persistent state
 * @param {number} params.confidence - pre-computed confidence
 * @param {number} params.now
 * @returns {object} consumption analysis
 */
function analyzeConsumption({
  currentLoadW,
  patternProfile,
  consumptionState,
  confidence,
  now = Date.now(),
}) {
  const pkHour = Math.floor((Date.now() / 3_600_000 + 5) % 24);
  const bucketId = bucketForHour(pkHour);
  const bucket = patternProfile.buckets?.[bucketId];

  if (!bucket || bucket.loadWavg < CONFIG.minExpectedW) {
    // Expected load too low to meaningfully detect anomalies
    consumptionState.count = 0;
    consumptionState.recoveryCount = 0;
    return { type: null, severity: "none", message: null };
  }

  const expectedW = bucket.loadWavg;
  const ratio = currentLoadW / expectedW;
  const deviationPct = Math.round((ratio - 1) * 100);

  let isAnomalous = false;
  let anomalyType = null;
  let severity = "none";

  if (ratio >= CONFIG.veryHighThreshold) {
    isAnomalous = true;
    anomalyType = "very_high";
    severity = "high";
  } else if (ratio >= CONFIG.highThreshold) {
    isAnomalous = true;
    anomalyType = "high";
    severity = "medium";
  } else if (ratio <= CONFIG.lowThreshold && expectedW > 300) {
    isAnomalous = true;
    anomalyType = "low";
    severity = "low";
  }

  if (isAnomalous) {
    consumptionState.count = (consumptionState.count || 0) + 1;
    consumptionState.recoveryCount = 0;
  } else {
    consumptionState.recoveryCount = (consumptionState.recoveryCount || 0) + 1;
    if (consumptionState.recoveryCount >= CONFIG.recoveryCount) {
      consumptionState.count = 0;
    }
  }

  const persistent = (consumptionState.count || 0) >= CONFIG.minPersistenceCount;

  if (!persistent) {
    return {
      type: null,
      severity: "none",
      message: null,
      expectedW,
      actualW: currentLoadW,
      deviationPct,
    };
  }

  let message = null;
  if (anomalyType === "very_high") {
    message = `Home consumption is ${deviationPct}% above normal for this time of day.`;
  } else if (anomalyType === "high") {
    message = `Home consumption is unusually high (${deviationPct}% above normal).`;
  } else if (anomalyType === "low") {
    message = `Home consumption is unusually low (${Math.abs(deviationPct)}% below normal).`;
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
  };
}

module.exports = { analyzeConsumption, CONFIG };
