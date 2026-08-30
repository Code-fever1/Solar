"use strict";

/**
 * VoltageAnalyzer — learns normal voltages and flags electrical anomalies.
 *
 * The house has its own healthy voltages by time of day and mode:
 *   solarV  (PV input)  — 170 V midday, ~150 V in the evening as solar fades
 *   gridV   (WAPDA)     — stable ~218 V when the grid is healthy
 *   homeV   (AC output) — inverter output feeding the home
 *   tomznV  (meter)     — the grid meter's voltage reading
 *
 * Detections (all debounced, all compared against THIS house's learned norm):
 *   - brownout:   gridV/tomznV well below the learned grid norm → WAPDA undervoltage
 *   - panel issue: solarV near norm but solarW far below → shading/soiling
 *   - inverter input issue: solarV collapsed AND solarW collapsed → PV input
 *   - inverter output issue: homeV below norm in bypass/hybrid → AC output
 */

const CONFIG = {
  gridVDropPct: 8,        // gridV below learned norm by this % → brownout
  gridVMinSamples: 10,    // need this many learned samples to compare
  solarVDropPct: 15,      // solarV below learned norm by this %
  homeVDropPct: 8,        // homeV below learned norm by this %
  minPersistenceCount: 3, // consecutive checks before reporting
  recoveryCount: 2,
  minSolarWForPanelCheck: 150, // below this, "solar down" is normal (night)
  brownoutFloorV: 198,    // Pakistani 230V supply: only speak below this
};

/**
 * @param {object} params
 * @param {object} params.inverter   - live inverter telemetry
 * @param {object} params.tomznLive  - live TOMZN telemetry
 * @param {object} params.bucket     - learned bucket profile (byDayType resolved)
 * @param {string} params.mode       - current household mode
 * @param {object} params.state      - persistent counters {grid:{count,recovery}, panel:{...}, ac:{...}}
 * @returns {object} voltage analysis
 */
function analyzeVoltage({
  inverter = {},
  tomznLive = {},
  bucket,
  mode,
  currentLoadW = 0,
  state,
}) {
  const counters = state || {};
  const out = { type: null, severity: "none", message: null };

  if (!bucket) return out;

  const solarV = inverter.solarV || 0;
  const gridV = inverter.gridV || 0;
  const homeV = inverter.acOutV || 0;
  const tomznV = tomznLive.voltageV || 0;
  const solarW = inverter.solarW || 0;
  const expectedSolarV = bucket.solarVavg || 0;
  const expectedGridV = bucket.gridVavg || 0;
  const expectedHomeV = bucket.homeVavg || 0;
  const expectedTomznV = bucket.tomznVavg || 0;

  const effectiveGridV = gridV > 0 ? gridV : tomznV;
  const effectiveGridNorm = gridV > 0 ? expectedGridV : expectedTomznV;

  const bump = (key, anomaly) => {
    const c = counters[key] || { count: 0, recovery: 0 };
    if (anomaly) { c.count = (c.count || 0) + 1; c.recovery = 0; }
    else { c.recovery = (c.recovery || 0) + 1; if (c.recovery >= CONFIG.recoveryCount) c.count = 0; }
    counters[key] = c;
    return c.count >= CONFIG.minPersistenceCount;
  };

  const modeKey = String(mode || "").toLowerCase().replace(/-/g, "_");

  // ── Grid brownout (undervoltage from WAPDA) ──
  // A 8% dip on a 230V learned norm is ~212V, which is still a healthy Pakistani
  // supply. Only fire when voltage is actually below brownoutFloorV AND off the
  // learned house baseline.
  if (effectiveGridV > 0 && effectiveGridNorm > 0 && bucket.gridVavg > 0) {
    const dropPct = ((effectiveGridNorm - effectiveGridV) / effectiveGridNorm) * 100;
    const isBrownout = effectiveGridV < CONFIG.brownoutFloorV && dropPct >= CONFIG.gridVDropPct;
    if (isBrownout && bump("grid", true)) {
      out.type = "brownout";
      out.severity = "warning";
      out.message = `Grid voltage is ${Math.round(effectiveGridV)}V vs the house's usual ${Math.round(effectiveGridNorm)}V — WAPDA is running undervoltage. Sensitive equipment may trip; keep heavy loads off until it settles.`;
      out.details = { gridV: Math.round(effectiveGridV), expectedV: Math.round(effectiveGridNorm), dropPct: Math.round(dropPct) };
      return out;
    }
    bump("grid", false);
  } else if (effectiveGridV > 0) {
    bump("grid", false);
  }

  // ── PV input vs panel condition ──
  // Quiet-house days (AC off) drop production with load. Only talk about
  // panels when the house is actually drawing and solar is not covering it.
  const loadW = Math.max(0, Number(currentLoadW) || 0);
  const expectedLoadW = bucket.loadWavg || 0;
  const quietHouse = loadW < 700 || (expectedLoadW > 0 && loadW < expectedLoadW * 0.7);
  const solarCoversLoad = solarW + 200 >= loadW;
  if (expectedSolarV > 0 && solarW > CONFIG.minSolarWForPanelCheck && bucket.solarWavg > 200 && !quietHouse && !solarCoversLoad) {
    const solarVDrop = ((expectedSolarV - solarV) / expectedSolarV) * 100;
    const wattsDevPct = ((bucket.solarWavg - solarW) / Math.max(1, bucket.solarWavg)) * 100;
    if (wattsDevPct >= 45 && solarVDrop < CONFIG.solarVDropPct && bump("panel", true)) {
      out.type = "panel_condition";
      out.severity = "warning";
      out.message = `Solar output is ${Math.round(wattsDevPct)}% below the norm for this time while PV voltage stays normal (${Math.round(solarV)}V vs typical ${Math.round(expectedSolarV)}V) — consistent with panel shading or soiling, not an inverter fault.`;
      out.details = { solarW: Math.round(solarW), expectedW: bucket.solarWavg, solarV: Math.round(solarV), expectedV: Math.round(expectedSolarV) };
      return out;
    }
    bump("panel", false);
    if (wattsDevPct >= 45 && solarVDrop >= CONFIG.solarVDropPct && bump("pvinput", true)) {
      out.type = "pv_input_issue";
      out.severity = "high";
      out.message = `PV voltage has dropped to ${Math.round(solarV)}V (typical ${Math.round(expectedSolarV)}V) while production is ${Math.round(wattsDevPct)}% below norm — the inverter's PV input or the array string needs a check.`;
      out.details = { solarW: Math.round(solarW), solarV: Math.round(solarV), expectedV: Math.round(expectedSolarV) };
      return out;
    }
    bump("pvinput", false);
  } else {
    bump("panel", false);
    bump("pvinput", false);
  }

  // ── Inverter AC output ──
  if (expectedHomeV > 0 && homeV > 0 && (modeKey === "hybrid" || modeKey === "bypass" || modeKey === "on_grid")) {
    const dropPct = ((expectedHomeV - homeV) / expectedHomeV) * 100;
    if (dropPct >= CONFIG.homeVDropPct && bump("ac", true)) {
      out.type = "ac_output_issue";
      out.severity = "warning";
      out.message = `Inverter AC output is ${Math.round(homeV)}V vs the house's usual ${Math.round(expectedHomeV)}V — the inverter's output stage or wiring needs attention.`;
      out.details = { homeV: Math.round(homeV), expectedV: Math.round(expectedHomeV) };
      return out;
    }
    bump("ac", false);
  } else {
    bump("ac", false);
  }

  return out;
}

module.exports = { analyzeVoltage, CONFIG };
