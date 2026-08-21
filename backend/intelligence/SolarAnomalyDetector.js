"use strict";

/**
 * SolarAnomalyDetector — detects abnormal solar production drops.
 *
 * Contextual awareness:
 *   1. Time-of-day: Evening solar decline is NORMAL. Don't alert just because
 *      solar dropped 50% if it's 6 PM and the historical pattern shows solar
 *      declining at this time.
 *   2. Trend: Repeated voltage fluctuations (V going up and down) indicate
 *      cloud cover, not an inverter fault. Steady low production = fault.
 *   3. Weather: If cloud cover is high, allow larger deviation before alerting.
 *
 * Uses the learned historical profile for the same time bucket to determine
 * if current solar production is abnormally low FOR THIS TIME OF DAY.
 */

const { bucketForHour } = require("./DailyPatternLearner");

const CONFIG = {
  // Deviation threshold: |actual - expected| / expected > this → anomaly
  deviationThresholdPct: 40,
  // Minimum expected solar to trigger (don't trigger at night or low production)
  minExpectedW: 500,
  // Persistence: anomaly must be sustained for N consecutive checks
  minPersistenceCount: 3,
  // Recovery: anomaly clears after this many consecutive normal checks
  recoveryCount: 2,
  // Cloud cover adjustment
  cloudCoverThreshold: 80,
  cloudCoverAdjustedThreshold: 60,
  // Evening buckets where solar decline is expected
  eveningBuckets: ["evening", "late_evening"],
  // In evening, allow much larger deviation before alerting (solar naturally drops)
  eveningDeviationThresholdPct: 70,
  // Voltage fluctuation tracking for cloud detection
  voltageFluctuationWindow: 10,        // track last 10 readings
  voltageFluctuationThreshold: 15,     // V swings > 15V repeatedly = clouds
  voltageFluctuationCountThreshold: 4, // 4+ swings in window = clouds
};

/**
 * Detect solar anomaly with contextual awareness.
 *
 * @param {object} params
 * @param {number} params.actualSolarW - current solar production
 * @param {object} params.patternProfile - from DailyPatternLearner
 * @param {object} params.weather - { cloudCover, isDay, code }
 * @param {object} params.anomalyState - persistent state
 * @param {number} params.confidence - pre-computed confidence for solar
 * @param {number} params.now
 * @returns {object} anomaly result
 */
function detectSolarAnomaly({
  actualSolarW,
  patternProfile,
  weather,
  anomalyState,
  confidence,
  now = Date.now(),
}) {
  const pkHour = Math.floor((Date.now() / 3_600_000 + 5) % 24);
  const bucketId = bucketForHour(pkHour);
  const bucket = patternProfile.buckets?.[bucketId];

  if (!bucket || !weather?.isDay) {
    anomalyState.count = 0;
    anomalyState.recoveryCount = 0;
    anomalyState.voltageHistory = [];
    return { type: null, severity: "none", message: null };
  }

  const expectedW = bucket.solarWavg;
  if (expectedW < CONFIG.minExpectedW) {
    // Expected production is too low to meaningfully detect anomalies
    anomalyState.count = 0;
    anomalyState.recoveryCount = 0;
    return { type: null, severity: "none", message: null };
  }

  const deviationPct = Math.round(((actualSolarW - expectedW) / expectedW) * 100);

  // ── Evening awareness: solar naturally declines in evening buckets ──
  // Don't alert just because solar dropped if we're in evening and the
  // decline is within the expected evening pattern.
  const isEvening = CONFIG.eveningBuckets.includes(bucketId);
  const effectiveThreshold = isEvening
    ? CONFIG.eveningDeviationThresholdPct
    : CONFIG.deviationThresholdPct;

  // Adjust threshold based on cloud cover
  const cloudCover = weather.cloudCover || 0;
  const cloudAdjustedThreshold = cloudCover > CONFIG.cloudCoverThreshold
    ? Math.max(effectiveThreshold, CONFIG.cloudCoverAdjustedThreshold)
    : effectiveThreshold;

  const isAnomalous = deviationPct < -cloudAdjustedThreshold;

  // ── Voltage fluctuation tracking for cloud detection ──
  // If voltage has been swinging up and down, it's likely clouds, not a fault.
  anomalyState.voltageHistory = anomalyState.voltageHistory || [];
  const voltageHistory = anomalyState.voltageHistory;

  // Track voltage swings (we'll use solarW as a proxy if voltage isn't available)
  // The caller can pass voltage via anomalyState if available
  const lastReading = voltageHistory.length > 0 ? voltageHistory[voltageHistory.length - 1] : null;
  if (lastReading != null) {
    const swing = Math.abs(actualSolarW - lastReading);
    if (swing > actualSolarW * 0.3) {
      // Significant swing in solar output
      anomalyState.fluctuationCount = (anomalyState.fluctuationCount || 0) + 1;
    }
  }
  voltageHistory.push(actualSolarW);
  if (voltageHistory.length > CONFIG.voltageFluctuationWindow) {
    voltageHistory.shift();
  }

  // If we've seen many fluctuations, it's clouds — not an anomaly
  const isCloudy = (anomalyState.fluctuationCount || 0) >= CONFIG.voltageFluctuationCountThreshold;

  if (isAnomalous && isCloudy) {
    // Solar is low but fluctuating → clouds, not a fault
    // Don't count this as an anomaly
    anomalyState.recoveryCount = (anomalyState.recoveryCount || 0) + 1;
    if (anomalyState.recoveryCount >= CONFIG.recoveryCount) {
      anomalyState.count = 0;
    }
    return {
      type: null,
      severity: "none",
      message: null,
      expectedW,
      actualW: actualSolarW,
      deviationPct,
      note: "cloud_cover_detected",
    };
  }

  if (isAnomalous) {
    anomalyState.count = (anomalyState.count || 0) + 1;
    anomalyState.recoveryCount = 0;
  } else {
    anomalyState.recoveryCount = (anomalyState.recoveryCount || 0) + 1;
    if (anomalyState.recoveryCount >= CONFIG.recoveryCount) {
      anomalyState.count = 0;
      anomalyState.fluctuationCount = 0;
    }
  }

  // Only report if persistent
  const persistent = (anomalyState.count || 0) >= CONFIG.minPersistenceCount;

  if (!persistent) {
    return {
      type: null,
      severity: "none",
      message: null,
      expectedW,
      actualW: actualSolarW,
      deviationPct,
    };
  }

  // Determine probable cause
  let probableCause = "unknown";
  if (isCloudy || cloudCover > CONFIG.cloudCoverThreshold) {
    probableCause = "cloud_weather";
  } else if (actualSolarW < expectedW * 0.3) {
    probableCause = "pv_abnormality";
  } else if (actualSolarW < expectedW * 0.5) {
    probableCause = "inverter_condition";
  } else {
    probableCause = "unexplained_production_drop";
  }

  // Severity
  let severity = "low";
  const absDeviation = Math.abs(deviationPct);
  if (absDeviation > 70) severity = "high";
  else if (absDeviation > 50) severity = "medium";

  return {
    type: "solar_anomaly",
    severity,
    expectedW,
    actualW: actualSolarW,
    deviationPct,
    confidence: Math.round(confidence * 100) / 100,
    persistent: true,
    probableCause,
    bucketId,
    cloudCover,
    isEvening,
  };
}

module.exports = { detectSolarAnomaly, CONFIG };
