"use strict";

/**
 * ConfidenceEngine — computes confidence scores for intelligence outputs.
 *
 * Confidence is based on:
 *   1. Volume of historical data (days, samples)
 *   2. Consistency of patterns (low variance = high confidence)
 *   3. Coverage of current time bucket
 *   4. Coverage of current operating mode
 *
 * Returns a float 0.0–1.0.
 */

/**
 * Compute confidence for the overall intelligence state.
 * @param {object} patternProfile - from DailyPatternLearner
 * @param {string} currentBucketId - current time bucket
 * @returns {number} 0.0–1.0
 */
function computeOverallConfidence(patternProfile, currentBucketId) {
  const conf = patternProfile.confidence;
  if (conf.level === "insufficient_data") return 0.15;
  if (conf.level === "learning") return 0.4;

  // Base confidence from data volume
  let base = 0.5;
  if (conf.level === "moderate_confidence") base = 0.7;
  if (conf.level === "high_confidence") base = 0.85;

  // Adjust based on current bucket sample count
  const bucket = patternProfile.buckets[currentBucketId];
  if (bucket) {
    if (bucket.sampleCount < 50) base *= 0.6;
    else if (bucket.sampleCount < 200) base *= 0.8;
    // Solar confidence: need enough solar samples in this bucket
    if (bucket.solarSampleCount < 30) base *= 0.85;
  }

  return Math.max(0.1, Math.min(0.98, base));
}

/**
 * Compute confidence for a meter recommendation.
 * @param {object} patternProfile
 * @param {string} currentBucketId
 * @param {string} currentMode - hybrid/on-grid/night/bypass
 * @returns {number} 0.0–1.0
 */
function computeMeterConfidence(patternProfile, currentBucketId, currentMode) {
  const conf = patternProfile.confidence;
  if (conf.level === "insufficient_data") return 0.1;
  if (conf.level === "learning") return 0.3;

  const bucket = patternProfile.buckets[currentBucketId];
  if (!bucket) return 0.2;

  let base = 0.5;
  if (conf.level === "moderate_confidence") base = 0.65;
  if (conf.level === "high_confidence") base = 0.8;

  // Meter usage days in this bucket — need enough to trust the comparison
  const meterDays = Math.max(bucket.meter1UsageDays, bucket.meter2UsageDays);
  if (meterDays < 2) base *= 0.4;
  else if (meterDays < 5) base *= 0.7;

  // Mode frequency — if the current mode is rare in this bucket, lower confidence
  let modeFreq = 0;
  if (currentMode === "hybrid") modeFreq = bucket.hybridFreq;
  else if (currentMode === "on-grid") modeFreq = bucket.onGridFreq;
  else if (currentMode === "night" || currentMode === "bypass") modeFreq = bucket.nightFreq;

  if (modeFreq < 0.1) base *= 0.5;
  else if (modeFreq < 0.3) base *= 0.75;

  return Math.max(0.05, Math.min(0.95, base));
}

/**
 * Compute confidence for solar anomaly detection.
 * @param {object} patternProfile
 * @param {string} currentBucketId
 * @returns {number} 0.0–1.0
 */
function computeSolarConfidence(patternProfile, currentBucketId) {
  const conf = patternProfile.confidence;
  if (conf.level === "insufficient_data") return 0.1;
  if (conf.level === "learning") return 0.3;

  const bucket = patternProfile.buckets[currentBucketId];
  if (!bucket) return 0.2;

  let base = 0.6;
  if (conf.level === "moderate_confidence") base = 0.75;
  if (conf.level === "high_confidence") base = 0.88;

  // Need enough solar samples in this bucket
  if (bucket.solarSampleCount < 30) base *= 0.5;
  else if (bucket.solarSampleCount < 100) base *= 0.75;

  // Low variance = higher confidence in the expected value
  if (bucket.solarWavg > 0) {
    const cv = bucket.solarWstdDev / bucket.solarWavg; // coefficient of variation
    if (cv < 0.2) base *= 1.0;  // very consistent
    else if (cv < 0.4) base *= 0.9;
    else if (cv < 0.6) base *= 0.75;
    else base *= 0.6; // high variance → less confident in "expected"
  }

  return Math.max(0.1, Math.min(0.95, base));
}

/**
 * Compute confidence for consumption anomaly detection.
 * @param {object} patternProfile
 * @param {string} currentBucketId
 * @returns {number} 0.0–1.0
 */
function computeConsumptionConfidence(patternProfile, currentBucketId) {
  const conf = patternProfile.confidence;
  if (conf.level === "insufficient_data") return 0.1;
  if (conf.level === "learning") return 0.3;

  const bucket = patternProfile.buckets[currentBucketId];
  if (!bucket) return 0.2;

  let base = 0.6;
  if (conf.level === "moderate_confidence") base = 0.72;
  if (conf.level === "high_confidence") base = 0.85;

  if (bucket.loadSampleCount < 50) base *= 0.5;
  else if (bucket.loadSampleCount < 200) base *= 0.75;

  return Math.max(0.1, Math.min(0.92, base));
}

module.exports = {
  computeOverallConfidence,
  computeMeterConfidence,
  computeSolarConfidence,
  computeConsumptionConfidence,
};
