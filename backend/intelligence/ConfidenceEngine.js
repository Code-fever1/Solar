"use strict";

/**
 * ConfidenceEngine — computes confidence scores for intelligence outputs.
 *
 * v2 adds day-type awareness (a weekend comparison against weekday baselines
 * is low-confidence) and a real meter confidence used by MeterAdvisor
 * (previously hardcoded 0.9).
 */

function confidenceLevelRank(level) {
  return level === "insufficient_data" ? 0
    : level === "learning" ? 1
    : level === "moderate_confidence" ? 2
    : 3;
}

function computeOverallConfidence(patternProfile, currentBucketId) {
  const conf = patternProfile.confidence;
  if (conf.level === "insufficient_data") return 0.15;
  if (conf.level === "learning") return 0.4;

  let base = 0.5;
  if (conf.level === "moderate_confidence") base = 0.7;
  if (conf.level === "high_confidence") base = 0.85;

  const bucket = patternProfile.buckets[currentBucketId];
  if (bucket) {
    if (bucket.sampleCount < 50) base *= 0.6;
    else if (bucket.sampleCount < 200) base *= 0.8;
    if (bucket.solarSampleCount < 30) base *= 0.85;
  }
  return Math.max(0.1, Math.min(0.98, base));
}

function computeMeterConfidence(patternProfile, currentBucketId, currentMode, dayType, remainingSource) {
  const conf = patternProfile.confidence;
  if (conf.level === "insufficient_data") return 0.15;
  if (conf.level === "learning") return 0.35;

  const byDayType = conf.byDayType?.[dayType];
  let base = 0.55;
  if (conf.level === "moderate_confidence") base = 0.7;
  if (conf.level === "high_confidence") base = 0.82;

  // Day-type coverage: comparing a weekend against weekday data is shaky.
  if (byDayType && !byDayType.confident) base *= 0.65;

  const bucket = patternProfile.buckets[currentBucketId];
  if (bucket) {
    const meterDays = Math.max(bucket.meter1UsageDays, bucket.meter2UsageDays);
    if (meterDays < 2) base *= 0.4;
    else if (meterDays < 5) base *= 0.7;
  }

  // The remaining-units source: dashboard-computed (fresh) beats anchor math.
  if (remainingSource === "override") base *= 1.0;
  else if (remainingSource === "computed") base *= 0.9;
  else base *= 0.8;

  return Math.max(0.1, Math.min(0.95, base));
}

function computeSolarConfidence(patternProfile, currentBucketId, dayType) {
  const conf = patternProfile.confidence;
  if (conf.level === "insufficient_data") return 0.1;
  if (conf.level === "learning") return 0.3;

  const bucket = patternProfile.buckets[currentBucketId];
  if (!bucket) return 0.2;

  let base = 0.6;
  if (conf.level === "moderate_confidence") base = 0.75;
  if (conf.level === "high_confidence") base = 0.88;

  const dayStats = bucket.byDayType?.[dayType];
  const samples = (dayStats && dayStats.confident ? dayStats.solarSampleCount : null) ?? bucket.solarSampleCount;
  if (samples < 30) base *= 0.5;
  else if (samples < 100) base *= 0.75;

  const avg = dayStats?.solarWavg || bucket.solarWavg;
  const dev = dayStats?.solarWstdDev || bucket.solarWstdDev;
  if (avg > 0) {
    const cv = dev / avg;
    if (cv < 0.2) base *= 1.0;
    else if (cv < 0.4) base *= 0.9;
    else if (cv < 0.6) base *= 0.75;
    else base *= 0.6;
  }
  return Math.max(0.1, Math.min(0.95, base));
}

function computeConsumptionConfidence(patternProfile, currentBucketId, dayType) {
  const conf = patternProfile.confidence;
  if (conf.level === "insufficient_data") return 0.1;
  if (conf.level === "learning") return 0.3;

  const bucket = patternProfile.buckets[currentBucketId];
  if (!bucket) return 0.2;

  let base = 0.6;
  if (conf.level === "moderate_confidence") base = 0.72;
  if (conf.level === "high_confidence") base = 0.85;

  const dayStats = bucket.byDayType?.[dayType];
  const samples = (dayStats && dayStats.confident ? dayStats.loadSampleCount : null) ?? bucket.loadSampleCount;
  if (samples < 50) base *= 0.5;
  else if (samples < 200) base *= 0.75;

  return Math.max(0.1, Math.min(0.92, base));
}

module.exports = {
  computeOverallConfidence,
  computeMeterConfidence,
  computeSolarConfidence,
  computeConsumptionConfidence,
  confidenceLevelRank,
};
