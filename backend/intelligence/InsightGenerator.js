"use strict";

/**
 * InsightGenerator — combines all analyzers into a single current insight.
 *
 * Picks the highest-priority current insight and generates:
 *   - status: UI state type
 *   - title: short headline
 *   - message: human-readable explanation
 *   - recommendation: meter recommendation (if applicable)
 *   - confidence: 0-1
 *   - reasonCodes: array of machine-readable reason codes
 *   - severity: none/info/low/medium/high
 *
 * Priority order (highest first):
 *   1. WAPDA_CUTOFF — critical, grid is down
 *   2. WAPDA_RESTORED — grid just came back
 *   3. SOLAR_ANOMALY (high) — major unexplained solar drop
 *   4. HIGH_CONSUMPTION (high) — very high load
 *   5. METER_RECOMMENDATION — actionable meter switch
 *   6. SOLAR_ANOMALY (medium/low) — sustained but not critical
 *   7. HIGH_CONSUMPTION (medium) — sustained high load
 *   8. WAPDA_STANDBY — informational
 *   9. WAPDA_IMPORTING — informational
 *   10. NORMAL — everything looks good
 *   11. INSUFFICIENT_DATA — learning
 */

/**
 * Generate the top-level insight from all analyzer outputs.
 *
 * @param {object} params
 * @param {object} params.gridState - from GridStateAnalyzer
 * @param {object} params.solarAnomaly - from SolarAnomalyDetector
 * @param {object} params.consumption - from ConsumptionAnalyzer
 * @param {object} params.meterRec - from MeterAdvisor
 * @param {string} params.confidenceLevel - from pattern profile
 * @param {number} params.confidence - overall confidence 0-1
 * @returns {object} insight
 */
function generateInsight({
  gridState,
  solarAnomaly,
  consumption,
  meterRec,
  confidenceLevel,
  confidence,
}) {
  // ── Build candidate insights ──
  const candidates = [];

  // WAPDA cutoff
  if (gridState.state === "CUTOFF") {
    candidates.push({
      priority: 100,
      status: "WAPDA_CUTOFF",
      title: gridState.label,
      message: gridState.message,
      severity: gridState.severity,
      confidence: Math.max(0.8, confidence),
      reasonCodes: ["WAPDA_CUTOFF", "GRID_UNAVAILABLE"],
      notificationPriority: "high",
    });
  }

  // WAPDA restored
  if (gridState.state === "RESTORED") {
    candidates.push({
      priority: 95,
      status: "WAPDA_RESTORED",
      title: gridState.label,
      message: gridState.message,
      severity: gridState.severity,
      confidence: Math.max(0.7, confidence),
      reasonCodes: ["WAPDA_RESTORED", "GRID_RETURNED"],
      notificationPriority: "high",
    });
  }

  // WAPDA unstable
  if (gridState.state === "UNSTABLE" && gridState.severity === "medium") {
    candidates.push({
      priority: 85,
      status: "WAPDA_UNSTABLE",
      title: gridState.label,
      message: gridState.message,
      severity: gridState.severity,
      confidence: Math.max(0.6, confidence),
      reasonCodes: ["WAPDA_UNSTABLE", "GRID_FLUCTUATING"],
      notificationPriority: "medium",
    });
  }

  // Solar anomaly (high)
  if (solarAnomaly.type === "solar_anomaly" && solarAnomaly.severity === "high") {
    candidates.push({
      priority: 90,
      status: "SOLAR_ANOMALY",
      title: "Solar Production Below Normal",
      message: `Solar is producing ${solarAnomaly.actualW}W vs expected ${solarAnomaly.expectedW}W (${solarAnomaly.deviationPct}% deviation).`,
      severity: solarAnomaly.severity,
      confidence: solarAnomaly.confidence,
      reasonCodes: ["SOLAR_BELOW_NORMAL", `DEVIATION_${solarAnomaly.deviationPct}PCT`, solarAnomaly.probableCause?.toUpperCase()],
      notificationPriority: "high",
    });
  }

  // High consumption (high)
  if (consumption.type === "high_consumption" && consumption.severity === "high") {
    candidates.push({
      priority: 80,
      status: "HIGH_CONSUMPTION",
      title: "Home Consumption Unusually High",
      message: consumption.message,
      severity: consumption.severity,
      confidence: consumption.confidence,
      reasonCodes: ["HIGH_CONSUMPTION", `LOAD_${consumption.deviationPct}PCT_ABOVE_NORMAL`],
      notificationPriority: "high",
    });
  }

  // Meter recommendation (only if shouldRecommend)
  if (meterRec.shouldRecommend) {
    const recMeter = meterRec.recommendation === "meter1" ? "Meter 1" : "Meter 2";
    const activeName = meterRec.activeMeter === "meter1" ? "Meter 1" : "Meter 2";
    candidates.push({
      priority: 70,
      status: "METER_RECOMMENDATION",
      title: `Consider ${recMeter}`,
      message: `Your historical data favors ${recMeter} in current conditions. Score: ${meterRec.recommendation === "meter1" ? meterRec.meter1Score : meterRec.meter2Score} vs ${activeName}: ${meterRec.activeMeter === "meter1" ? meterRec.meter1Score : meterRec.meter2Score}.`,
      severity: "medium",
      confidence: meterRec.confidence,
      reasonCodes: meterRec.reasonCodes,
      notificationPriority: "medium",
      meterRecommendation: {
        recommendation: meterRec.recommendation,
        meter1Score: meterRec.meter1Score,
        meter2Score: meterRec.meter2Score,
        advantage: meterRec.advantage,
        action: meterRec.action,
      },
    });
  }

  // Solar anomaly (medium)
  if (solarAnomaly.type === "solar_anomaly" && solarAnomaly.severity === "medium") {
    candidates.push({
      priority: 60,
      status: "SOLAR_ANOMALY",
      title: "Solar Production Below Normal",
      message: `Solar is producing ${solarAnomaly.actualW}W vs expected ${solarAnomaly.expectedW}W.`,
      severity: solarAnomaly.severity,
      confidence: solarAnomaly.confidence,
      reasonCodes: ["SOLAR_BELOW_NORMAL", solarAnomaly.probableCause?.toUpperCase()],
      notificationPriority: "medium",
    });
  }

  // High consumption (medium)
  if (consumption.type === "high_consumption" && consumption.severity === "medium") {
    candidates.push({
      priority: 55,
      status: "HIGH_CONSUMPTION",
      title: "Home Consumption High",
      message: consumption.message,
      severity: consumption.severity,
      confidence: consumption.confidence,
      reasonCodes: ["HIGH_CONSUMPTION", `LOAD_${consumption.deviationPct}PCT_ABOVE_NORMAL`],
      notificationPriority: "medium",
    });
  }

  // Low consumption
  if (consumption.type === "low_consumption") {
    candidates.push({
      priority: 30,
      status: "LOW_CONSUMPTION",
      title: "Home Consumption Low",
      message: consumption.message,
      severity: consumption.severity,
      confidence: consumption.confidence,
      reasonCodes: ["LOW_CONSUMPTION"],
      notificationPriority: "none",
    });
  }

  // WAPDA standby
  if (gridState.state === "STANDBY") {
    candidates.push({
      priority: 25,
      status: "WAPDA_STANDBY",
      title: gridState.label,
      message: gridState.message,
      severity: "info",
      confidence: confidence,
      reasonCodes: ["WAPDA_STANDBY", "SOLAR_COVERING_LOAD"],
      notificationPriority: "none",
    });
  }

  // WAPDA importing (normal)
  if (gridState.state === "IMPORTING") {
    candidates.push({
      priority: 15,
      status: "WAPDA_IMPORTING",
      title: gridState.label,
      message: gridState.message,
      severity: "info",
      confidence: confidence,
      reasonCodes: ["WAPDA_IMPORTING"],
      notificationPriority: "none",
    });
  }

  // If insufficient data, override with learning state
  if (confidenceLevel === "insufficient_data" && candidates.length === 0) {
    candidates.push({
      priority: 5,
      status: "INSUFFICIENT_DATA",
      title: "Learning Your Home's Energy Pattern",
      message: "Collecting data to provide personalized energy insights. Check back in a few days.",
      severity: "info",
      confidence: 0.1,
      reasonCodes: ["INSUFFICIENT_DATA", "LEARNING_IN_PROGRESS"],
      notificationPriority: "none",
    });
  }

  // Default: normal
  if (candidates.length === 0) {
    // Build a "keep meter" insight with context
    const activeName = meterRec.activeMeter === "meter1" ? "Meter 1" : "Meter 2";
    let normalMessage = "Energy looks good.";
    let normalReasons = ["NORMAL_OPERATION"];

    // Add context about why keeping the current meter is good
    if (meterRec.reasonCodes.length > 0) {
      const hasFavorableCal = meterRec.reasonCodes.some((r) => r.includes("FAVORABLE_CALIBRATION"));
      const hasLowerUsage = meterRec.reasonCodes.some((r) => r.includes("LOWER_BUCKET_USAGE"));
      if (hasFavorableCal || hasLowerUsage) {
        normalMessage = `Keep ${activeName}. Current conditions favor your active meter.`;
        normalReasons = ["NORMAL_OPERATION", ...meterRec.reasonCodes.slice(0, 2)];
      }
    }

    candidates.push({
      priority: 10,
      status: "NORMAL",
      title: "Energy Looks Good",
      message: normalMessage,
      severity: "info",
      confidence: confidence,
      reasonCodes: normalReasons,
      notificationPriority: "none",
      meterRecommendation: {
        recommendation: meterRec.recommendation,
        meter1Score: meterRec.meter1Score,
        meter2Score: meterRec.meter2Score,
        advantage: meterRec.advantage,
        action: meterRec.action,
      },
    });
  }

  // Pick highest priority
  candidates.sort((a, b) => b.priority - a.priority);
  const top = candidates[0];

  return {
    status: top.status,
    title: top.title,
    message: top.message,
    severity: top.severity,
    confidence: top.confidence,
    reasonCodes: top.reasonCodes || [],
    notificationPriority: top.notificationPriority || "none",
    meterRecommendation: top.meterRecommendation || {
      recommendation: meterRec.recommendation,
      meter1Score: meterRec.meter1Score,
      meter2Score: meterRec.meter2Score,
      advantage: meterRec.advantage,
      action: meterRec.action,
    },
  };
}

module.exports = { generateInsight };
