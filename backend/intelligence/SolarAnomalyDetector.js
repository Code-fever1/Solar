"use strict";

/**
 * SolarAnomalyDetector v2 — day-type-aware solar production anomaly.
 *
 * v1 compared solar against one blended baseline. v2 uses the weekday or
 * weekend baseline for the current bucket (a Saturday morning is judged
 * against Saturday mornings, not weekdays).
 *
 * Panel-vs-inverter discrimination moved to VoltageAnalyzer (voltage
 * coherence). This module stays focused: is solar W abnormally low for this
 * moment, sustained, and not explained by clouds or evening?
 */

const { bucketForHour } = require("./DailyPatternLearner");

const CONFIG = {
  deviationThresholdPct: 50,
  minExpectedW: 700,
  minPersistenceCount: 4,
  recoveryCount: 2,
  cloudCoverThreshold: 80,
  cloudCoverAdjustedThreshold: 60,
  eveningBuckets: ["evening", "late_evening"],
  eveningDeviationThresholdPct: 70,
  voltageFluctuationWindow: 10,
  voltageFluctuationCountThreshold: 4,
  // Quiet-house days (AC off) are not a solar fault. Only speak when the
  // house is actually drawing and solar is failing to cover that draw.
  minLoadForAlertW: 700,
  quietLoadRatio: 0.7,      // load below 70% of typical → quiet day, stay silent
  coverMarginW: 200,        // solar within 200W of load = covering the house
};

/**
 * @param {object} params
 * @param {number} params.actualSolarW
 * @param {object} params.patternProfile
 * @param {string} params.dayType
 * @param {object} params.weather
 * @param {object} params.anomalyState
 * @param {number} params.confidence
 * @param {number} params.now
 */
function detectSolarAnomaly({
  actualSolarW,
  currentLoadW = 0,
  patternProfile,
  dayType = "weekday",
  weather,
  anomalyState,
  confidence,
  now = Date.now(),
}) {
  const pkHour = Math.floor((now / 3_600_000 + 5) % 24);
  const bucketId = bucketForHour(pkHour);
  const bucket = patternProfile.buckets?.[bucketId];
  const dayStats = bucket?.byDayType?.[dayType] || bucket;

  if (!bucket || !weather?.isDay) {
    anomalyState.count = 0;
    anomalyState.recoveryCount = 0;
    anomalyState.voltageHistory = [];
    return { type: null, severity: "none", message: null };
  }

  const expectedW = dayStats.solarWavg || bucket.solarWavg;
  const expectedLoadW = dayStats.loadWavg || bucket.loadWavg || 0;
  const loadW = Math.max(0, Number(currentLoadW) || 0);
  if (expectedW < CONFIG.minExpectedW) {
    anomalyState.count = 0;
    anomalyState.recoveryCount = 0;
    return { type: null, severity: "none", message: null };
  }

  // Quiet house: AC off, few loads. Solar on this inverter follows load unless
  // it is exporting, so a production drop with a load drop is normal.
  const quietHouse = loadW < CONFIG.minLoadForAlertW
    || (expectedLoadW > 0 && loadW < expectedLoadW * CONFIG.quietLoadRatio);
  const solarCoversLoad = actualSolarW + CONFIG.coverMarginW >= loadW;
  if (quietHouse || solarCoversLoad) {
    anomalyState.count = 0;
    anomalyState.recoveryCount = 0;
    return { type: null, severity: "none", message: null, expectedW, actualW: actualSolarW, loadW, note: quietHouse ? "quiet_house" : "solar_covers_load" };
  }

  const deviationPct = Math.round(((actualSolarW - expectedW) / expectedW) * 100);
  const isEvening = CONFIG.eveningBuckets.includes(bucketId);
  const effectiveThreshold = isEvening ? CONFIG.eveningDeviationThresholdPct : CONFIG.deviationThresholdPct;
  const cloudCover = weather.cloudCover || 0;
  const cloudAdjustedThreshold = cloudCover > CONFIG.cloudCoverThreshold
    ? Math.max(effectiveThreshold, CONFIG.cloudCoverAdjustedThreshold)
    : effectiveThreshold;

  const isAnomalous = deviationPct < -cloudAdjustedThreshold;

  // Cloud detection via production fluctuation (solarV swings preferred).
  anomalyState.voltageHistory = anomalyState.voltageHistory || [];
  const history = anomalyState.voltageHistory;
  const lastReading = history.length > 0 ? history[history.length - 1] : null;
  if (lastReading != null && actualSolarW > 50) {
    const swing = Math.abs(actualSolarW - lastReading);
    if (swing > actualSolarW * 0.3) anomalyState.fluctuationCount = (anomalyState.fluctuationCount || 0) + 1;
  }
  history.push(actualSolarW);
  if (history.length > CONFIG.voltageFluctuationWindow) history.shift();
  const isCloudy = (anomalyState.fluctuationCount || 0) >= CONFIG.voltageFluctuationCountThreshold;

  if (isAnomalous && isCloudy) {
    anomalyState.recoveryCount = (anomalyState.recoveryCount || 0) + 1;
    if (anomalyState.recoveryCount >= CONFIG.recoveryCount) anomalyState.count = 0;
    return { type: null, severity: "none", message: null, expectedW, actualW: actualSolarW, deviationPct, note: "cloud_cover_detected" };
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

  const persistent = (anomalyState.count || 0) >= CONFIG.minPersistenceCount;
  if (!persistent) {
    return { type: null, severity: "none", message: null, expectedW, actualW: actualSolarW, deviationPct };
  }

  let probableCause = "unknown";
  if (isCloudy || cloudCover > CONFIG.cloudCoverThreshold) probableCause = "cloud_weather";
  else if (actualSolarW < expectedW * 0.3) probableCause = "pv_abnormality";
  else if (actualSolarW < expectedW * 0.5) probableCause = "inverter_condition";
  else probableCause = "unexplained_production_drop";

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
    dayType,
  };
}

module.exports = { detectSolarAnomaly, CONFIG };
