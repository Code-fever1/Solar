"use strict";

/**
 * MeterAdvisor — recommends which meter to use based on current conditions
 * and historical performance.
 *
 * Scoring is based on REAL measured historical behavior, not arbitrary guesses.
 *
 * Score factors (each 0-100, weighted):
 *   1. Historical usage rate in current time bucket (lower = better)
 *   2. Remaining units to 200 threshold (more remaining = better)
 *   3. Projected days to threshold (slower burn = better)
 *   4. Current operating mode match (does this meter perform well in this mode?)
 *   5. Calibration ratio accuracy (closer to 1.0 = more trustworthy)
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
  // Score weights (sum to 1.0)
  weights: {
    bucketUsage: 0.30,      // historical usage in this time bucket
    remainingUnits: 0.25,    // remaining units to 200
    burnRate: 0.20,          // current consumption rate
    modeMatch: 0.15,         // mode-specific performance
    calibration: 0.10,       // calibration accuracy
  },
};

/**
 * Score a single meter.
 *
 * @param {string} meterId - "meter1" or "meter2"
 * @param {object} meterState - from solar_engine_state
 * @param {object} patternProfile - from DailyPatternLearner
 * @param {string} currentBucketId
 * @param {string} currentMode - hybrid/on-grid/night/bypass
 * @param {number} slabTarget - 200
 * @returns {object} { score, factors, reasonCodes }
 */
function scoreMeter(meterId, meterState, patternProfile, currentBucketId, currentMode, slabTarget) {
  const bucket = patternProfile.buckets[currentBucketId];
  const reasonCodes = [];
  const factors = {};

  // ── Factor 1: Historical usage rate in this bucket ──
  // Lower usage = higher score. Compare this meter's avg usage in this bucket.
  const myUsageAvg = meterId === "meter1" ? bucket?.meter1UsageAvg : bucket?.meter2UsageAvg;
  const otherUsageAvg = meterId === "meter1" ? bucket?.meter2UsageAvg : bucket?.meter1UsageAvg;
  const myUsageDays = meterId === "meter1" ? bucket?.meter1UsageDays : bucket?.meter2UsageDays;

  if (myUsageDays > 0 && otherUsageAvg != null && otherUsageAvg > 0) {
    // Compare: if this meter uses less in this bucket, it scores higher
    const ratio = myUsageAvg / otherUsageAvg;
    factors.bucketUsage = Math.round(Math.max(0, Math.min(100, 100 - (ratio - 1) * 50)));
    if (myUsageAvg < otherUsageAvg) {
      reasonCodes.push(`${meterId.toUpperCase()}_LOWER_BUCKET_USAGE`);
    }
  } else {
    // No data for this meter in this bucket → neutral
    factors.bucketUsage = 50;
  }

  // ── Factor 2: Remaining units to threshold ──
  const currentReading = meterState.anchorReading ?? meterState.cycleBaselineReading;
  const baselineReading = meterState.cycleBaselineReading;
  const usedThisCycle = Math.max(0, currentReading - baselineReading);
  const remaining = Math.max(0, slabTarget - usedThisCycle);
  const remainingPct = remaining / slabTarget;
  factors.remainingUnits = Math.round(Math.max(0, Math.min(100, remainingPct * 100)));
  if (remaining < 30) {
    reasonCodes.push(`${meterId.toUpperCase()}_APPROACHING_THRESHOLD`);
  }

  // ── Factor 3: Burn rate (current consumption speed) ──
  // Use the meter's calibration ratio to estimate effective burn rate.
  // A meter with ratio < 1.0 (reads lower) burns "slower" in billing terms.
  const ratio = meterState.tomznToMeterRatio || 1.0;
  // Score: ratio closer to 0.9 (reads 10% lower) = higher score
  // ratio 1.0 = 70, ratio 0.9 = 100, ratio 1.1 = 40
  factors.burnRate = Math.round(Math.max(0, Math.min(100, 100 - Math.abs(ratio - 0.9) * 300)));
  if (ratio < 0.95) {
    reasonCodes.push(`${meterId.toUpperCase()}_FAVORABLE_CALIBRATION`);
  }

  // ── Factor 4: Mode match ──
  // Does this meter perform well in the current operating mode?
  // Use the mode frequency × this meter's usage in that bucket.
  let modeFreq = 0;
  if (currentMode === "hybrid") modeFreq = bucket?.hybridFreq || 0;
  else if (currentMode === "on-grid") modeFreq = bucket?.onGridFreq || 0;
  else if (currentMode === "night" || currentMode === "bypass") modeFreq = bucket?.nightFreq || 0;

  // If the current mode is common in this bucket AND this meter has low usage,
  // it's a good match.
  if (modeFreq > 0.3 && myUsageAvg != null && otherUsageAvg != null) {
    if (myUsageAvg < otherUsageAvg) {
      factors.modeMatch = Math.round(70 + modeFreq * 30);
      reasonCodes.push(`${meterId.toUpperCase()}_GOOD_MODE_MATCH`);
    } else {
      factors.modeMatch = Math.round(40 + modeFreq * 20);
    }
  } else {
    factors.modeMatch = 50; // neutral
  }

  // ── Factor 5: Calibration accuracy ──
  // More calibration observations = more trustworthy meter
  const obsCount = meterState.ratioObservationCount || 0;
  factors.calibration = Math.round(Math.max(20, Math.min(100, 20 + obsCount * 10)));

  // ── Weighted total ──
  const w = CONFIG.weights;
  const score = Math.round(
    factors.bucketUsage * w.bucketUsage +
    factors.remainingUnits * w.remainingUnits +
    factors.burnRate * w.burnRate +
    factors.modeMatch * w.modeMatch +
    factors.calibration * w.calibration
  );

  return { score, factors, reasonCodes };
}

/**
 * Compute meter recommendation with hysteresis.
 *
 * @param {object} params
 * @param {object} params.meters - { meter1: {...}, meter2: {...} } from state
 * @param {string} params.activeMeter - "meter1" or "meter2"
 * @param {object} params.patternProfile - from DailyPatternLearner
 * @param {string} params.currentMode - hybrid/on-grid/night/bypass
 * @param {number} params.slabTarget - 200
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
}) {
  const pkHour = Math.floor((Date.now() / 3_600_000 + 5) % 24);
  const currentBucketId = bucketForHour(pkHour);

  const m1 = scoreMeter("meter1", meters.meter1, patternProfile, currentBucketId, currentMode, slabTarget);
  const m2 = scoreMeter("meter2", meters.meter2, patternProfile, currentBucketId, currentMode, slabTarget);

  const otherMeter = activeMeter === "meter1" ? "meter2" : "meter1";
  const activeScore = activeMeter === "meter1" ? m1.score : m2.score;
  const otherScore = activeMeter === "meter1" ? m2.score : m1.score;
  const advantage = otherScore - activeScore;

  // Determine if we should recommend switching
  const confidence = patternProfile.confidence?.level || "insufficient_data";
  const minConf = CONFIG.minConfidence;

  // Check hysteresis: has the advantage persisted long enough?
  if (advantage >= CONFIG.minScoreAdvantage) {
    if (hysteresisState.advantageStart === 0) {
      hysteresisState.advantageStart = now;
      hysteresisState.advantageMeter = otherMeter;
    }
    // Only count persistence if it's for the same meter
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

  // Determine recommendation
  let recommendation = activeMeter; // default: keep current
  let action = "keep_" + activeMeter.replace("meter", "meter_");
  let shouldRecommend = false;

  if (
    advantage >= CONFIG.minScoreAdvantage &&
    persistenceMs >= CONFIG.minPersistenceMs &&
    confidence !== "insufficient_data" &&
    !cooldownActive
  ) {
    recommendation = otherMeter;
    action = "switch_to_" + otherMeter.replace("meter", "meter_");
    shouldRecommend = true;
    hysteresisState.lastRecommendationAt = now;
  }

  // Combine reason codes from the recommended meter
  const recommendedResult = recommendation === "meter1" ? m1 : m2;
  const reasonCodes = [...recommendedResult.reasonCodes];

  // Add contextual reason codes
  if (currentMode === "hybrid" && advantage > 10) {
    reasonCodes.push("HYBRID_MODE_ACTIVE");
  }
  if (currentMode === "on-grid" && advantage > 10) {
    reasonCodes.push("ON_GRID_MODE");
  }
  if (currentBucketId === "evening" || currentBucketId === "late_evening") {
    reasonCodes.push("EVENING_TRANSITION");
  }

  return {
    recommendation,
    activeMeter,
    meter1Score: m1.score,
    meter2Score: m2.score,
    advantage: Math.abs(advantage),
    advantageFavors: advantage > 0 ? otherMeter : activeMeter,
    action,
    shouldRecommend,
    confidence: confidence === "insufficient_data" ? 0.1 : Math.min(0.95, 0.5 + advantage / 100),
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
