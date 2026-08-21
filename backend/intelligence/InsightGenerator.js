"use strict";

/**
 * InsightGenerator — combines all analyzers into a SINGLE composite insight.
 *
 * Instead of priority-based candidate selection (which caused the card to
 * flicker between statuses as grid state fluctuated), this produces a
 * stable composite insight with:
 *   - headline: short status ("System Healthy", "Consider Meter 1", etc.)
 *   - suggestions: array of 0-N contextual suggestions
 *   - meterAdvice: always present, shows the better meter
 *   - overallStatus: "healthy" | "info" | "warning" | "alert"
 *
 * The card always renders the same layout — no jumping between card types.
 */

const BUCKET_LABELS = {
  night: "nighttime",
  morning: "morning",
  late_morning: "late morning",
  midday: "midday",
  afternoon: "afternoon",
  evening: "evening",
  late_evening: "late evening",
};

const MODE_LABELS = {
  hybrid: "hybrid",
  "on-grid": "on-grid",
  night: "night",
  bypass: "bypass",
};

/**
 * Generate a composite insight from all analyzer outputs.
 *
 * @param {object} params
 * @param {object} params.gridState - from GridStateAnalyzer
 * @param {object} params.solarAnomaly - from SolarAnomalyDetector
 * @param {object} params.consumption - from ConsumptionAnalyzer
 * @param {object} params.meterRec - from MeterAdvisor
 * @param {string} params.confidenceLevel - from pattern profile
 * @param {number} params.confidence - overall confidence 0-1
 * @returns {object} composite insight
 */
function generateInsight({
  gridState,
  solarAnomaly,
  consumption,
  meterRec,
  confidenceLevel,
  confidence,
}) {
  const suggestions = [];
  let overallStatus = "healthy";
  let headline = "System Healthy";
  const bucketLabel = meterRec.bucketId ? BUCKET_LABELS[meterRec.bucketId] || meterRec.bucketId : "";
  const modeLabel = meterRec.bucketId ? MODE_LABELS["hybrid"] || "hybrid" : "hybrid";

  // ═══════════════════════════════════════════════════════════════
  // 1. GRID STATE — WAPDA cutoff/restored/unstable are alerts
  // ═══════════════════════════════════════════════════════════════
  if (gridState.state === "CUTOFF") {
    overallStatus = "alert";
    headline = "WAPDA Unavailable";
    suggestions.push({
      type: "grid",
      priority: 100,
      text: gridState.message || "WAPDA is down. Running on solar & battery.",
      severity: "high",
    });
  } else if (gridState.state === "RESTORED") {
    overallStatus = "info";
    headline = "WAPDA Restored";
    suggestions.push({
      type: "grid",
      priority: 95,
      text: gridState.message || "WAPDA has returned. Grid power available.",
      severity: "medium",
    });
  } else if (gridState.state === "UNSTABLE" && gridState.severity === "medium") {
    overallStatus = "warning";
    headline = "WAPDA Unstable";
    suggestions.push({
      type: "grid",
      priority: 85,
      text: gridState.message || "WAPDA is fluctuating. Avoid switching meters.",
      severity: "medium",
    });
  } else if (gridState.state === "INVERTER_OFF") {
    // Inverter is offline but WAPDA grid is available via bypass.
    // This is a warning (inverter issue) but NOT a WAPDA cutoff.
    overallStatus = "warning";
    headline = "Inverter Offline";
    suggestions.push({
      type: "grid",
      priority: 75,
      text: gridState.message || "Inverter is offline. Home running on WAPDA via bypass.",
      severity: "medium",
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. SOLAR ANOMALY — only if truly abnormal (not evening decline)
  // ═══════════════════════════════════════════════════════════════
  if (solarAnomaly.type === "solar_anomaly") {
    const sa = solarAnomaly;
    const causeMap = {
      cloud_weather: "Cloud cover reducing production",
      pv_abnormality: "PV panels may need inspection",
      inverter_condition: "Inverter may not be operating optimally",
      unexplained_production_drop: "Production below the learned pattern",
    };
    const cause = causeMap[sa.probableCause] || "Production below normal";

    if (sa.severity === "high") {
      if (overallStatus === "healthy") overallStatus = "warning";
      if (overallStatus === "info") overallStatus = "warning";
      headline = "Solar Production Low";
      suggestions.push({
        type: "solar",
        priority: 80,
        text: `${cause} (${sa.actualW}W vs expected ${sa.expectedW}W).`,
        severity: sa.severity,
      });
    } else if (sa.severity === "medium") {
      if (overallStatus === "healthy") overallStatus = "info";
      headline = headline === "System Healthy" ? "Solar Below Normal" : headline;
      suggestions.push({
        type: "solar",
        priority: 60,
        text: `${cause} (${sa.actualW}W vs expected ${sa.expectedW}W).`,
        severity: sa.severity,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. CONSUMPTION — only if truly abnormal
  // ═══════════════════════════════════════════════════════════════
  if (consumption.type === "high_consumption") {
    if (consumption.severity === "high") {
      if (overallStatus === "healthy") overallStatus = "warning";
      headline = headline === "System Healthy" ? "High Consumption" : headline;
      suggestions.push({
        type: "consumption",
        priority: 70,
        text: consumption.message || `Home load is unusually high.`,
        severity: consumption.severity,
      });
    } else if (consumption.severity === "medium") {
      if (overallStatus === "healthy") overallStatus = "info";
      suggestions.push({
        type: "consumption",
        priority: 50,
        text: consumption.message || `Home load is above normal.`,
        severity: consumption.severity,
      });
    }
  }
  // Low consumption: only suggest if very low (not evening normal decrease)
  if (consumption.type === "low_consumption" && consumption.severity !== "none") {
    if (overallStatus === "healthy") overallStatus = "info";
    suggestions.push({
      type: "consumption",
      priority: 20,
      text: consumption.message || `Home consumption is low.`,
      severity: "low",
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 4. METER ADVICE — only when recommending a SWITCH
  // If already on the better meter, don't show a suggestion at all.
  // The corner badge already shows which meter is active.
  // Scores are only shown when a switch is being recommended.
  // ═══════════════════════════════════════════════════════════════
  const betterName = meterRec.recommendation === "meter1" ? "Meter 1" : "Meter 2";
  const activeName = meterRec.activeMeter === "meter1" ? "Meter 1" : "Meter 2";
  const isOnBetter = meterRec.recommendation === meterRec.activeMeter;
  const scoreGap = Math.abs(meterRec.meter1Score - meterRec.meter2Score);

  if (!isOnBetter) {
    // The other meter is better — show a switch recommendation
    let meterText = "";
    let meterPriority = 30;

    if (confidenceLevel === "insufficient_data") {
      meterText = `${betterName} may consume less under current conditions, but still learning your patterns.`;
      meterPriority = 10;
    } else if (meterRec.shouldSwitch) {
      // Hysteresis says: switch now
      meterText = `Consider switching to ${betterName} (${meterRec.meter1Score} vs ${meterRec.meter2Score}). It historically consumes less under current conditions.`;
      meterPriority = 75;
      if (overallStatus === "healthy") overallStatus = "info";
      headline = `Consider ${betterName}`;
    } else if (scoreGap < 15) {
      // Other meter is slightly better but not enough to switch
      meterText = `${betterName} shows slightly lower consumption (${meterRec.meter1Score} vs ${meterRec.meter2Score}) but not enough to justify switching.`;
      meterPriority = 15;
    } else {
      // Other meter is better but hysteresis hasn't triggered yet
      meterText = `${betterName} historically consumes less (${meterRec.meter1Score} vs ${meterRec.meter2Score}) under current conditions. Consider switching.`;
      meterPriority = 40;
      if (overallStatus === "healthy") overallStatus = "info";
    }

    suggestions.push({
      type: "meter",
      priority: meterPriority,
      text: meterText,
      severity: meterRec.shouldSwitch ? "medium" : "info",
    });
  }
  // If isOnBetter → no meter suggestion at all. The corner badge shows M1/M2.

  // ═══════════════════════════════════════════════════════════════
  // 5. INSUFFICIENT DATA
  // ═══════════════════════════════════════════════════════════════
  if (confidenceLevel === "insufficient_data" && suggestions.length <= 1) {
    overallStatus = "info";
    headline = "Learning Your Pattern";
    suggestions.unshift({
      type: "system",
      priority: 5,
      text: "Collecting data to learn your home's energy patterns. Check back in a few days.",
      severity: "info",
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // 6. SORT SUGGESTIONS BY PRIORITY (highest first)
  // ═══════════════════════════════════════════════════════════════
  suggestions.sort((a, b) => b.priority - a.priority);

  // ═══════════════════════════════════════════════════════════════
  // 7. BUILD FINAL OUTPUT
  // ═══════════════════════════════════════════════════════════════
  return {
    headline,
    overallStatus,
    suggestions,
    confidence,
    confidenceLevel,
    meterRecommendation: {
      recommendation: meterRec.recommendation,
      activeMeter: meterRec.activeMeter,
      meter1Score: meterRec.meter1Score,
      meter2Score: meterRec.meter2Score,
      advantage: meterRec.advantage,
      advantageFavors: meterRec.advantageFavors,
      action: meterRec.action,
      shouldSwitch: meterRec.shouldSwitch,
    },
    details: {
      gridState: gridState.state,
      gridLabel: gridState.label,
      solarAnomaly: solarAnomaly.type ? {
        expectedW: solarAnomaly.expectedW,
        actualW: solarAnomaly.actualW,
        deviationPct: solarAnomaly.deviationPct,
        probableCause: solarAnomaly.probableCause,
        isEvening: solarAnomaly.isEvening,
      } : null,
      consumption: consumption.type ? {
        expectedW: consumption.expectedW,
        actualW: consumption.actualW,
        deviationPct: consumption.deviationPct,
      } : null,
      meterScores: {
        meter1: meterRec.meter1Score,
        meter2: meterRec.meter2Score,
        advantage: meterRec.advantage,
        advantageFavors: meterRec.advantageFavors,
      },
      confidenceLevel,
      bucketId: meterRec.bucketId,
      mode: "hybrid",
    },
    // Backward compat fields
    status: overallStatus === "healthy" ? "NORMAL" :
            overallStatus === "alert" ? "WAPDA_CUTOFF" :
            overallStatus === "warning" ? (gridState.state === "INVERTER_OFF" ? "INVERTER_OFF" : solarAnomaly.type ? "SOLAR_ANOMALY" : "HIGH_CONSUMPTION") :
            "NORMAL",
    title: headline,
    message: suggestions.length > 0 ? suggestions[0].text : "All systems normal.",
    severity: overallStatus === "alert" ? "high" : overallStatus === "warning" ? "medium" : "info",
    reasonCodes: suggestions.map((s) => s.type.toUpperCase()),
    notificationPriority: overallStatus === "alert" ? "high" : overallStatus === "warning" ? "medium" : "none",
  };
}

module.exports = { generateInsight };
