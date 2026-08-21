"use strict";

/**
 * MeterAdvisor — recommends which meter to use based on current conditions
 * and historical PERFORMANCE only.
 *
 * PERFORMANCE = "which meter historically consumes fewer billable units
 * under conditions like RIGHT NOW?"
 *
 * Quota status (remaining units to 200 threshold) is NOT part of this score.
 * Quota warnings are handled separately by the meter cards on the frontend.
 * Do NOT mix quota into performance scoring.
 *
 * Score factors (each 0-100, weighted):
 *   1. Historical usage rate in current time bucket (lower = better)   40%
 *   2. Calibration ratio (meter reads lower = burns slower in billing) 25%
 *   3. Mode-specific performance (does this meter do well in this mode?) 20%
 *   4. Calibration confidence (more observations = more trustworthy)    15%
 *
 * Hysteresis:
 *   - Requires minimum score advantage (default 15 points)
 *   - Requires minimum persistence duration (default 5 minutes)
 *   - Requires minimum confidence (default 0.5)
 *   - Cooldown after recommendation (default 30 minutes)
 */

const { bucketForHour } = require("./DailyPatternLearner");

// ── Configuration ──
const CONFIG = {
  minScoreAdvantage: 15,       // points
  minPersistenceMs: 5 * 60_000, // 5 minutes
  minConfidence: 0.5,
  cooldownMs: 30 * 60_000,      // 30 minutes between recommendations
  // Score weights (sum to 1.0) — PERFORMANCE ONLY, no quota
  weights: {
    bucketUsage: 0.40,      // historical usage in this time bucket
    burnRate: 0.25,          // calibration ratio (reads lower = better)
    modeMatch: 0.20,         // mode-specific performance
    calibration: 0.15,       // calibration confidence (data volume)
  },
};

/**
 * Score a single meter's PERFORMANCE under current conditions.
 *
 * @param {string} meterId - "meter1" or "meter2"
 * @param {object} meterState - from solar_engine_state
 * @param {object} patternProfile - from DailyPatternLearner
 * @param {string} currentBucketId
 * @param {string} currentMode - hybrid/on-grid/night/bypass
 * @returns {object} { score, factors, reasonCodes }
 */
function scoreMeter(meterId, meterState, patternProfile, currentBucketId, currentMode) {
  const bucket = patternProfile.buckets[currentBucketId];
  const reasonCodes = [];
  const factors = {};

  // ── Factor 1: Historical usage rate in this bucket (40%) ──
  // Lower usage = higher score. Compare this meter's avg usage in this bucket.
  const myUsageAvg = meterId === "meter1" ? bucket?.meter1UsageAvg : bucket?.meter2UsageAvg;
  const otherUsageAvg = meterId === "meter1" ? bucket?.meter2UsageAvg : bucket?.meter1UsageAvg;
  const myUsageDays = meterId === "meter1" ? bucket?.meter1UsageDays : bucket?.meter2UsageDays;
  const otherUsageDays = meterId === "meter1" ? bucket?.meter2UsageDays : bucket?.meter1UsageDays;

  if (myUsageDays > 0 && otherUsageDays > 0 && otherUsageAvg > 0) {
    // Both meters have data → compare directly
    const ratio = myUsageAvg / otherUsageAvg;
    factors.bucketUsage = Math.round(Math.max(0, Math.min(100, 100 - (ratio - 1) * 50)));
    if (myUsageAvg < otherUsageAvg) {
      reasonCodes.push(`${meterId.toUpperCase()}_LOWER_BUCKET_USAGE`);
    }
  } else if (myUsageDays > 0 && otherUsageDays === 0) {
    // This meter has data, other has none → this meter is a known quantity.
    factors.bucketUsage = 65;
    reasonCodes.push(`${meterId.toUpperCase()}_HAS_HISTORICAL_DATA`);
  } else if (myUsageDays === 0 && otherUsageDays > 0) {
    // This meter has no data, other does → penalty (unknown performance)
    factors.bucketUsage = 35;
  } else {
    // Neither meter has data in this bucket → neutral
    factors.bucketUsage = 50;
  }

  // ── Factor 2: Calibration ratio / burn rate (25%) ──
  // A meter with ratio < 1.0 (reads lower) burns "slower" in billing terms.
  const ratio = meterState.tomznToMeterRatio || 1.0;
  // Score: ratio closer to 0.9 (reads 10% lower) = higher score
  // ratio 0.9 = 100, ratio 1.0 = 70, ratio 1.1 = 40
  factors.burnRate = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(ratio - 0.9) * 300)));
  if (ratio < 0.95) {
    reasonCodes.push(`${meterId.toUpperCase()}_FAVORABLE_CALIBRATION`);
  }

  // ── Factor 3: Mode match (20%) ──
  // Does this meter perform well in the current operating mode?
  let modeFreq = 0;
  if (currentMode === "hybrid") modeFreq = bucket?.hybridFreq || 0;
  else if (currentMode === "on-grid") modeFreq = bucket?.onGridFreq || 0;
  else if (currentMode === "night" || currentMode === "bypass") modeFreq = bucket?.nightFreq || 0;

  if (modeFreq > 0.3 && myUsageDays > 0 && otherUsageDays > 0 && otherUsageAvg > 0) {
    if (myUsageAvg < otherUsageAvg) {
      factors.modeMatch = Math.round(70 + modeFreq * 30);
      reasonCodes.push(`${meterId.toUpperCase()}_GOOD_MODE_MATCH`);
    } else {
      factors.modeMatch = Math.round(40 + modeFreq * 20);
    }
  } else if (modeFreq > 0.3 && myUsageDays > 0 && otherUsageDays === 0) {
    factors.modeMatch = 60;
  } else {
    factors.modeMatch = 50; // neutral
  }

  // ── Factor 4: Calibration confidence (15%) ──
  // More calibration observations = more trustworthy meter ratio
  const obsCount = meterState.ratioObservationCount || 0;
  factors.calibration = Math.round(Math.max(20, Math.min(100, 20 + obsCount * 10)));

  // ── Weighted total ──
  const w = CONFIG.weights;
  const score = Math.round(
    factors.bucketUsage * w.bucketUsage +
    factors.burnRate * w.burnRate +
    factors.modeMatch * w.modeMatch +
    factors.calibration * w.calibration
  );

  return { score, factors, reasonCodes };
}

/**
 * Compute meter PERFORMANCE recommendation with hysteresis.
 *
 * @param {object} params
 * @param {object} params.meters - { meter1: {...}, meter2: {...} } from state
 * @param {string} params.activeMeter - "meter1" or "meter2"
 * @param {object} params.patternProfile - from DailyPatternLearner
 * @param {string} params.currentMode - hybrid/on-grid/night/bypass
 * @param {number} params.slabTarget - 200 (unused in scoring, kept for compat)
 * @param {object} params.hysteresisState - persistent state for hysteresis
 * @param {number} params.now
 * @returns {object} recommendation
 */
function computeMeterRecommendation({
  meters,
  activeMeter,
  patternProfile,
  currentMode,
  slabTarget,
  hysteresisState,
  now = Date.now(),
  currentBucketId: bucketOverride, // optional — for testing specific buckets
}) {
  const pkHour = Math.floor((Date.now() / 3_600_000 + 5) % 24);
  const currentBucketId = bucketOverride || bucketForHour(pkHour);

  const m1 = scoreMeter("meter1", meters.meter1, patternProfile, currentBucketId, currentMode);
  const m2 = scoreMeter("meter2", meters.meter2, patternProfile, currentBucketId, currentMode);

  const otherMeter = activeMeter === "meter1" ? "meter2" : "meter1";
  const activeScore = activeMeter === "meter1" ? m1.score : m2.score;
  const otherScore = activeMeter === "meter1" ? m2.score : m1.score;
  const advantage = otherScore - activeScore;

  // Determine if we should recommend switching
  const confidence = patternProfile.confidence?.level || "insufficient_data";

  // Check hysteresis: has the advantage persisted long enough?
  if (advantage >= CONFIG.minScoreAdvantage) {
    if (hysteresisState.advantageStart === 0) {
      hysteresisState.advantageStart = now;
      hysteresisState.advantageMeter = otherMeter;
    }
    if (hysteresisState.advantageMeter !== otherMeter) {
      hysteresisState.advantageStart = now;
      hysteresisState.advantageMeter = otherMeter;
    }
  } else {
    hysteresisState.advantageStart = 0;
    hysteresisState.advantageMeter = null;
  }

  const persistenceMs = hysteresisState.advantageStart > 0 ? now - hysteresisState.advantageStart : 0;
  const cooldownActive = hysteresisState.lastRecommendationAt > 0 &&
    (now - hysteresisState.lastRecommendationAt) < CONFIG.cooldownMs;

  // ── recommendation = the higher-scoring meter ──
  const betterMeter = m1.score >= m2.score ? "meter1" : "meter2";
  const betterScore = m1.score >= m2.score ? m1.score : m2.score;
  const worseScore = m1.score >= m2.score ? m2.score : m1.score;
  const scoreGap = betterScore - worseScore;

  const recommendation = betterMeter;
  const isOnBetterMeter = recommendation === activeMeter;
  const action = isOnBetterMeter
    ? "keep_" + activeMeter.replace("meter", "meter_")
    : "consider_switch_to_" + betterMeter.replace("meter", "meter_");

  // shouldSwitch: only true if hysteresis conditions are met
  const otherIsBetter = recommendation !== activeMeter;
  const shouldSwitch = otherIsBetter &&
    scoreGap >= CONFIG.minScoreAdvantage &&
    persistenceMs >= CONFIG.minPersistenceMs &&
    confidence !== "insufficient_data" &&
    !cooldownActive;

  if (shouldSwitch) {
    hysteresisState.lastRecommendationAt = now;
  }

  // Combine reason codes from the recommended (better) meter
  const recommendedResult = recommendation === "meter1" ? m1 : m2;
  const reasonCodes = [...recommendedResult.reasonCodes];

  if (currentMode === "hybrid" && scoreGap > 10) {
    reasonCodes.push("HYBRID_MODE_ACTIVE");
  }
  if (currentMode === "on-grid" && scoreGap > 10) {
    reasonCodes.push("ON_GRID_MODE");
  }
  if (currentBucketId === "evening" || currentBucketId === "late_evening") {
    reasonCodes.push("EVENING_TRANSITION");
  }

  if (otherIsBetter && !shouldSwitch) {
    if (scoreGap < CONFIG.minScoreAdvantage) {
      reasonCodes.push("ADVANTAGE_BELOW_THRESHOLD");
    } else if (persistenceMs < CONFIG.minPersistenceMs) {
      reasonCodes.push("ADVANTAGE_NOT_PERSISTED");
    } else if (cooldownActive) {
      reasonCodes.push("RECOMMENDATION_COOLDOWN");
    }
  }

  return {
    recommendation,
    activeMeter,
    meter1Score: m1.score,
    meter2Score: m2.score,
    advantage: scoreGap,
    advantageFavors: betterMeter,
    action,
    shouldSwitch,
    shouldRecommend: shouldSwitch,
    confidence: confidence === "insufficient_data" ? 0.1 : Math.min(0.95, 0.5 + scoreGap / 100),
    reasonCodes,
    persistenceMs,
    cooldownActive,
    bucketId: currentBucketId,
    factors: {
      meter1: m1.factors,
      meter2: m2.factors,
    },
  };
}

module.exports = { computeMeterRecommendation, CONFIG };
