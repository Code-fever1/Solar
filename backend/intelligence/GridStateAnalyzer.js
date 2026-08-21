"use strict";

/**
 * GridStateAnalyzer — classifies WAPDA grid state.
 *
 * States:
 *   NORMAL     — grid connected, normal import
 *   STANDBY    — grid connected, ~0 import (solar covering load)
 *   IMPORTING  — grid connected, significant import
 *   CUTOFF     — grid unavailable (inverter on battery or bypass)
 *   RESTORED   — grid just returned after cutoff
 *   UNSTABLE   — grid flickering (rapid connect/disconnect)
 *   INVERTER_OFF — inverter is offline but WAPDA grid is available (bypass mode)
 *
 * Key insight: "inverter offline" ≠ "WAPDA offline". The inverter can be
 * offline (fault, maintenance, power cycle) while WAPDA grid is perfectly
 * fine — the home runs on grid power via bypass/changeover. The TOMZN meter
 * sees all grid exchange regardless of inverter state, so it is the source
 * of truth for WAPDA availability when the inverter is offline.
 *
 * Uses inverter data when available, falls back to TOMZN data when inverter
 * is offline. Debounces transient fluctuations.
 */

const CONFIG = {
  standbyThresholdW: 50,       // tomzn power below this → standby
  importingThresholdW: 200,    // tomzen power above this → importing
  cutoffPersistenceMs: 10_000, // grid must be down 10s before CUTOFF
  restoredWindowMs: 60_000,    // show RESTORED for 60s after recovery
  unstableThreshold: 3,        // 3+ transitions in 5 min → UNSTABLE
  unstableWindowMs: 5 * 60_000,
  // TOMZN fault codes that indicate WAPDA cutoff
  tomznCutoffFaults: new Set([2048, 8192]),
  // TOMZN voltage threshold: below this, grid is considered unavailable
  tomznMinVoltageV: 200,
};

/**
 * Classify WAPDA grid state.
 *
 * @param {object} params
 * @param {boolean} params.gridConnected - from inverter (only valid if inverterOnline)
 * @param {number} params.tomznPowerW - current WAPDA import power (TOMZN meter)
 * @param {string} params.inverterMode - L/B/S/F/P/offline
 * @param {boolean} params.inverterOnline - is the inverter device reporting?
 * @param {boolean} params.tomznOnline - is the TOMZN meter online?
 * @param {number} params.tomznVoltageV - TOMZN grid voltage (source of truth when inverter is off)
 * @param {number} params.tomznFaultCode - TOMZN fault code (2048/8192 = cutoff)
 * @param {object} params.gridState - persistent state
 * @param {number} params.now
 * @returns {object} { state, label, severity, message }
 */
function classifyGridState({
  gridConnected,
  tomznPowerW,
  inverterMode,
  inverterOnline,
  tomznOnline,
  tomznVoltageV,
  tomznFaultCode,
  gridState,
  now = Date.now(),
}) {
  const power = Math.max(0, tomznPowerW || 0);
  const tomznV = tomznVoltageV || 0;
  const tomznFault = tomznFaultCode || 0;
  const tomznCutoffFault = CONFIG.tomznCutoffFaults.has(tomznFault);

  // ── Determine if WAPDA grid is actually available ──
  // When the inverter is ONLINE, use its gridConnected + mode signals.
  // When the inverter is OFFLINE, rely on TOMZN (the grid meter sees all
  // grid exchange regardless of inverter state).
  let wapdaAvailable;
  let isInverterBatteryMode = false;

  if (inverterOnline) {
    // Inverter is reporting — use its grid signals
    isInverterBatteryMode = inverterMode === "B";
    wapdaAvailable = gridConnected && !isInverterBatteryMode;
  } else {
    // Inverter is offline — TOMZN is the source of truth for WAPDA
    // TOMZN online + voltage > threshold + no cutoff fault = WAPDA available
    if (tomznOnline === false || tomznCutoffFault) {
      wapdaAvailable = false;
    } else if (tomznV >= CONFIG.tomznMinVoltageV) {
      wapdaAvailable = true;
    } else if (power > 0) {
      // Voltage unknown but power is flowing — WAPDA is available
      wapdaAvailable = true;
    } else {
      // No voltage, no power, no fault code — likely WAPDA is down
      wapdaAvailable = false;
    }
  }

  // Track transitions for unstable detection
  const wasConnected = gridState.lastConnected;
  gridState.lastConnected = wapdaAvailable;

  if (wasConnected !== undefined && wasConnected !== wapdaAvailable) {
    gridState.transitions = gridState.transitions || [];
    gridState.transitions.push(now);
    gridState.transitions = gridState.transitions.filter((t) => now - t < CONFIG.unstableWindowMs);
  }

  const isUnstable = (gridState.transitions || []).length >= CONFIG.unstableThreshold;

  // ── Cutoff detection ──
  if (!wapdaAvailable) {
    if (gridState.cutoffStart === 0) {
      gridState.cutoffStart = now;
    }
    const cutoffDuration = now - gridState.cutoffStart;

    if (cutoffDuration >= CONFIG.cutoffPersistenceMs) {
      gridState.wasCutoff = true;
      gridState.restoredAt = 0;
      return {
        state: "CUTOFF",
        label: "WAPDA Cutoff Detected",
        severity: "high",
        message: isInverterBatteryMode
          ? "WAPDA grid is unavailable. Inverter is powering the home from battery/solar."
          : "WAPDA grid is unavailable. No power source is active.",
        duration: cutoffDuration,
      };
    }
    // Not yet persistent enough — still classifying
    return {
      state: "UNSTABLE",
      label: "Grid Fluctuation",
      severity: "low",
      message: null,
    };
  }

  // ── WAPDA is available ──
  gridState.cutoffStart = 0;

  // Check if just restored after a cutoff
  if (gridState.wasCutoff && (gridState.restoredAt === 0 || now - gridState.restoredAt < CONFIG.restoredWindowMs)) {
    if (gridState.restoredAt === 0) {
      gridState.restoredAt = now;
    }
    const restoredDuration = now - gridState.restoredAt;
    if (restoredDuration < CONFIG.restoredWindowMs) {
      return {
        state: "RESTORED",
        label: "WAPDA Restored",
        severity: "medium",
        message: "WAPDA grid has been restored after a cutoff.",
        restoredFor: restoredDuration,
      };
    }
    gridState.wasCutoff = false;
  }

  if (isUnstable) {
    return {
      state: "UNSTABLE",
      label: "Grid Unstable",
      severity: "medium",
      message: "WAPDA grid is experiencing rapid fluctuations.",
      transitionCount: (gridState.transitions || []).length,
    };
  }

  // ── Classify the connected state ──
  // When inverter is offline but WAPDA is available, the home is in bypass mode
  if (!inverterOnline) {
    if (power >= CONFIG.importingThresholdW) {
      return {
        state: "INVERTER_OFF",
        label: "Inverter Offline · WAPDA Bypass",
        severity: "medium",
        message: `Inverter is offline. Home running on WAPDA (${Math.round(power)}W) via bypass.`,
        power,
      };
    }
    return {
      state: "INVERTER_OFF",
      label: "Inverter Offline · WAPDA Available",
      severity: "medium",
      message: "Inverter is offline. WAPDA grid is available via bypass.",
      power,
    };
  }

  // Inverter is online + WAPDA is available — classify by power level
  if (power < CONFIG.standbyThresholdW) {
    return {
      state: "STANDBY",
      label: "WAPDA on Standby",
      severity: "info",
      message: "Solar is covering most of your load. WAPDA is on standby.",
      power,
    };
  }

  if (power >= CONFIG.importingThresholdW) {
    return {
      state: "IMPORTING",
      label: "WAPDA Importing",
      severity: "info",
      message: `Importing ${Math.round(power)}W from WAPDA.`,
      power,
    };
  }

  return {
    state: "NORMAL",
    label: "Grid Normal",
    severity: "info",
    message: null,
    power,
  };
}

module.exports = { classifyGridState, CONFIG };
