"use strict";

/**
 * InsightGenerator v2 — professional household advice.
 *
 * Voice rules:
 *   1. Every line carries a number, the context it is compared to, an action,
 *      and the consequence. No bare "consumption 3326", no "WAPDA is low".
 *   2. Only speak when there is a decision or a real problem.
 *   3. Remaining quota and slab timing beat slogans.
 *   4. Advice is conditional on the household's own learned patterns:
 *      weekday vs weekend, mode, export windows.
 */

function meterName(id) {
  return id === "meter1" ? "Meter 1" : "Meter 2";
}

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

function generateInsight({
  gridState,
  solarAnomaly,
  consumption,
  meterRec,
  voltage,
  exportAnalysis,
  confidenceLevel,
  confidence,
  household,
  dayType,
}) {
  const suggestions = [];
  let overallStatus = "healthy";
  let headline = "On track";
  const home = household || {};
  const avgDaily = Math.max(0, Number(home.averageDaily) || 0);
  const daysLeftCycle = Number(home.remainingCycleDays);
  const lastMonth = Number(home.lastMonthTotal) || 0;
  const projected = Number(home.projectedMonthly) || 0;
  const todayUsage = Number(home.todayUsage) || 0;
  const mode = home.mode || "";
  const direction = home.direction || "";
  const homeW = Math.round(Number(home.homeW) || 0);
  const solarW = Math.round(Number(home.solarW) || 0);
  const dayLabel = dayType === "weekend" ? "weekend" : "weekday";

  // ── 1. Grid / inverter emergencies ────────────────────────────────────
  if (gridState.state === "CUTOFF") {
    overallStatus = "alert";
    headline = "WAPDA is down";
    suggestions.push({
      type: "grid",
      priority: 100,
      text: gridState.message || "The grid is down; the house is on solar and battery. Keep heavy loads off until WAPDA returns.",
      severity: "high",
    });
  } else if (gridState.state === "BROWN_OUT") {
    overallStatus = "warning";
    headline = "Grid undervoltage";
    suggestions.push({
      type: "grid",
      priority: 82,
      text: gridState.message || "Grid voltage is below the healthy range. Sensitive equipment may trip until WAPDA recovers.",
      severity: "medium",
    });
  } else if (gridState.state === "INVERTER_OFF") {
    overallStatus = "warning";
    headline = "Inverter offline";
    suggestions.push({
      type: "grid",
      priority: 80,
      text: gridState.message || "The inverter is offline and the home is on WAPDA bypass. Check it before peak solar hours.",
      severity: "medium",
    });
  } else if (gridState.state === "UNSTABLE" && gridState.severity === "medium") {
    overallStatus = "warning";
    headline = "WAPDA is flickering";
    suggestions.push({
      type: "grid",
      priority: 75,
      text: "The grid is dropping in and out. Hold meter changes and heavy loads until it stabilises.",
      severity: "medium",
    });
  } else if (gridState.state === "RESTORED") {
    if (overallStatus === "healthy") {
      overallStatus = "info";
      headline = "WAPDA restored";
    }
    suggestions.push({
      type: "grid",
      priority: 55,
      text: "Grid power returned after a cutoff. Normal operation resumes.",
      severity: "low",
    });
  }

  // ── 2. Meter advisory — the real household decision ───────────────────
  if (meterRec?.text) {
    const sev = meterRec.urgency === "alert" ? "high"
      : meterRec.urgency === "warning" ? "medium"
      : "low";
    const pri = meterRec.urgency === "alert" ? 95
      : meterRec.urgency === "warning" ? 70
      : 40;
    if (meterRec.urgency === "alert" && overallStatus !== "alert") overallStatus = "alert";
    else if (meterRec.urgency === "warning" && overallStatus === "healthy") overallStatus = "warning";
    else if (meterRec.urgency === "info" && overallStatus === "healthy") overallStatus = "info";

    const plan = meterRec.switchPlan?.mode;
    if (plan === "switch_now" && (headline === "On track" || headline === "WAPDA restored")) {
      headline = `Switch to ${meterName(meterRec.recommendation)}`;
    } else if (plan === "both_short" && headline === "On track") {
      headline = "Both meters will run out";
    } else if (plan === "switch_in_days" && meterRec.shouldSwitch && headline === "On track") {
      headline = "Plan the meter switch";
    } else if (plan === "hold_to_cycle_end" && headline === "On track") {
      headline = "Stay on this meter";
    }
    suggestions.push({
      type: "meter",
      priority: pri,
      text: meterRec.text,
      severity: sev,
    });
  }

  // ── 3. Voltage anomalies (panels / inverter / AC) ─────────────────────
  if (voltage?.type) {
    const vsev = voltage.severity === "high" ? "high" : voltage.severity === "warning" ? "medium" : "low";
    const vpri = voltage.severity === "high" ? 72 : voltage.severity === "warning" ? 66 : 40;
    if (voltage.severity === "high" && overallStatus === "healthy") overallStatus = "warning";
    if (headline === "On track" && voltage.type === "pv_input_issue") headline = "PV input needs a check";
    if (headline === "On track" && voltage.type === "ac_output_issue") headline = "Inverter output is low";
    if (headline === "On track" && voltage.type === "panel_condition") headline = "Solar below norm";
    suggestions.push({ type: "system", priority: vpri, text: voltage.message, severity: vsev });
  }

  // ── 4. Solar production anomaly (not weather, not evening) ────────────
  if (solarAnomaly.type === "solar_anomaly" && solarAnomaly.severity === "high"
      && solarAnomaly.probableCause !== "cloud_weather" && !solarAnomaly.isEvening) {
    if (overallStatus === "healthy") overallStatus = "warning";
    if (headline === "On track") headline = "Solar not covering load";
    suggestions.push({
      type: "solar",
      priority: 62,
      text: `House is drawing ${Math.round(homeW)}W and solar is only ${solarAnomaly.actualW}W (typical ~${solarAnomaly.expectedW}W this hour). Production is not covering today's load.`,
      severity: "high",
    });
  }

  // ── 5. High load (sustained, mode-aware baseline) ─────────────────────
  if (consumption.type === "high_consumption" && consumption.severity === "high") {
    if (overallStatus === "healthy") overallStatus = "warning";
    if (headline === "On track") headline = "House load is high";
    suggestions.push({
      type: "consumption",
      priority: 58,
      text: consumption.message || `Home draw is ${Math.abs(consumption.deviationPct)}% above the norm for this time on ${dayLabel}s.`,
      severity: "medium",
    });
  }

  // ── 6. Export opportunity / missed solar window ───────────────────────
  if (exportAnalysis?.type === "export_opportunity") {
    if (overallStatus === "healthy") overallStatus = "info";
    if (headline === "On track") headline = "Export window active";
    suggestions.push({ type: "solar", priority: 45, text: exportAnalysis.message, severity: "low" });
  } else if (exportAnalysis?.type === "missed_export_window") {
    if (overallStatus === "healthy") overallStatus = "info";
    if (headline === "On track") headline = "Solar gap buying grid";
    suggestions.push({ type: "solar", priority: 38, text: exportAnalysis.message, severity: "low" });
  } else if (exportAnalysis?.type === "unusual_export") {
    suggestions.push({ type: "solar", priority: 26, text: exportAnalysis.message, severity: "low" });
  }

  // ── 7. Pace vs last month — only material deltas ──────────────────────
  if (lastMonth > 50 && projected > 0) {
    const delta = projected - lastMonth;
    const pct = (delta / lastMonth) * 100;
    if (pct >= 18 && delta >= 25) {
      if (overallStatus === "healthy") overallStatus = "info";
      suggestions.push({
        type: "consumption",
        priority: 35,
        text: `This cycle is tracking ${Math.round(projected)} units vs ${Math.round(lastMonth)} last cycle (${pct > 0 ? "+" : ""}${Math.round(pct)}%). At this pace the month costs more than the last one.`,
        severity: "low",
      });
    }
  }

  // ── 8. Today spike vs household pace ──────────────────────────────────
  if (avgDaily > 4 && todayUsage > avgDaily * 1.6) {
    suggestions.push({
      type: "consumption",
      priority: 32,
      text: `Today is already ${round1(todayUsage)} units vs a ${round1(avgDaily)}/day pace.`,
      severity: "low",
    });
  }

  suggestions.sort((a, b) => b.priority - a.priority);
  const top = suggestions.slice(0, 3);

  if (top.length === 0) {
    overallStatus = "healthy";
    headline = "On track";
  }

  return {
    headline,
    overallStatus,
    suggestions: top,
    confidence,
    confidenceLevel,
    meterRecommendation: meterRec ? {
      recommendation: meterRec.recommendation,
      activeMeter: meterRec.activeMeter,
      meter1Score: meterRec.meter1Score,
      meter2Score: meterRec.meter2Score,
      advantage: meterRec.advantage,
      advantageFavors: meterRec.advantageFavors,
      action: meterRec.action,
      shouldSwitch: !!meterRec.shouldSwitch,
      remaining: meterRec.remaining,
      usable: meterRec.usable,
      usableActive: meterRec.usableActive,
      usableOther: meterRec.usableOther,
      hoursLeftActive: meterRec.hoursLeftActive,
      daysLeftActive: meterRec.daysLeftActive,
      urgency: meterRec.urgency,
      reason: meterRec.reason,
      text: meterRec.text,
      switchPlan: meterRec.switchPlan,
    } : null,
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
      voltage: voltage?.type ? voltage.details || { type: voltage.type } : null,
      export: exportAnalysis?.type ? {
        type: exportAnalysis.type,
        todayExportKwh: exportAnalysis.todayExportKwh,
        typicalExportDayKwh: exportAnalysis.typicalExportDayKwh,
        inTypicalWindow: exportAnalysis.inTypicalWindow,
      } : null,
      meterScores: {
        meter1: meterRec?.meter1Score ?? 0,
        meter2: meterRec?.meter2Score ?? 0,
        advantage: meterRec?.advantage ?? 0,
        advantageFavors: meterRec?.advantageFavors ?? "",
      },
      remaining: meterRec?.remaining || null,
      usable: meterRec?.usable || null,
      confidenceLevel,
      bucketId: meterRec?.bucketId || null,
      mode: mode || "unknown",
      dayType,
    },
    status: overallStatus === "healthy" ? "NORMAL"
      : overallStatus === "alert" ? (gridState.state === "CUTOFF" ? "WAPDA_CUTOFF" : "METER_LOW")
      : overallStatus === "warning" ? (gridState.state === "INVERTER_OFF" ? "INVERTER_OFF" : "WARNING")
      : "NORMAL",
    title: headline,
    message: top.length > 0 ? top[0].text : "The house is running within the current cycle and no action is needed.",
    severity: overallStatus === "alert" ? "high" : overallStatus === "warning" ? "medium" : "info",
    reasonCodes: top.map((s) => s.type.toUpperCase()),
    notificationPriority: overallStatus === "alert" ? "high" : overallStatus === "warning" ? "medium" : "none",
  };
}

module.exports = { generateInsight };
