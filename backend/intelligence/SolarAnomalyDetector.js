"use strict";

/**
 * SolarAnomalyDetector — detects sudden solar production drops vs expected.
 *
 * Uses the learned historical profile for the same time of day to determine
 * if current solar production is abnormally low.
 *
 * Persistence/debounce: requires the anomaly to persist for N consecutive
 * checks before reporting. This filters out transient cloud shadows.
 */

const { bucketForHour } = require("./DailyPatternLearner");

const CONFIG = {
  // Deviation threshold: |actual - expected| / expected > this → anomaly
  deviationThresholdPct: 40,   // 40% below expected
  // Minimum expected solar to trigger (don't trigger at night or low production)
  minExpectedW: 500,
  // Persistence: anomaly must be sustained for this many checks
  minPersistenceCount: 3,     // ~3 checks × ~10s interval = ~30s
  // Recovery: anomaly clears after this many consecutive normal checks
  recoveryCount: 2,
  // Cloud cover adjustment: if cloudCover > 80%, raise threshold (it's weather, not anomaly)
  cloudCoverThreshold: 80,
  cloudCoverAdjustedThreshold: 60, // allow larger deviation if cloudy
};

/**
 * Detect solar anomaly.
 *
 * @param {object} params
 * @param {number} params.actualSolarW - current solar production
 * @param {object} params.patternProfile - from DailyPatternLearner
 * @param {object} params.weather - { cloudCover, isDay, code }
 * @param {object} params.anomalyState - persistent state { count, lastAnomalyAt, recoveryCount }
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
    // Night or no data → no anomaly
    anomalyState.count = 0;
    anomalyState.recoveryCount = 0;
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

  // Adjust threshold based on cloud cover
  const cloudCover = weather.cloudCover || 0;
  const effectiveThreshold = cloudCover > CONFIG.cloudCoverThreshold
    ? CONFIG.cloudCoverAdjustedThreshold
    : CONFIG.deviationThresholdPct;

  const isAnomalous = deviationPct < -effectiveThreshold;

  if (isAnomalous) {
    anomalyState.count = (anomalyState.count || 0) + 1;
    anomalyState.recoveryCount = 0;
  } else {
    anomalyState.recoveryCount = (anomalyState.recoveryCount || 0) + 1;
    if (anomalyState.recoveryCount >= CONFIG.recoveryCount) {
      anomalyState.count = 0;
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
  if (cloudCover > CONFIG.cloudCoverThreshold) {
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
  };
}

module.exports = { detectSolarAnomaly, CONFIG };
