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
 *
 * Uses existing inverter gridConnected + tomznPowerW + inverterMode data.
 * Debounces transient fluctuations.
 */

const CONFIG = {
  standbyThresholdW: 50,       // tomzn power below this → standby
  importingThresholdW: 200,    // tomzen power above this → importing
  cutoffPersistenceMs: 10_000, // grid must be down 10s before CUTOFF
  restoredWindowMs: 60_000,    // show RESTORED for 60s after recovery
  unstableThreshold: 3,        // 3+ transitions in 5 min → UNSTABLE
  unstableWindowMs: 5 * 60_000,
};

/**
 * Classify WAPDA grid state.
 *
 * @param {object} params
 * @param {boolean} params.gridConnected - from inverter
 * @param {number} params.tomznPowerW - current WAPDA import power
 * @param {string} params.inverterMode - L/B/S/F/P
 * @param {boolean} params.inverterOnline
 * @param {object} params.gridState - persistent state
 * @param {number} params.now
 * @returns {object} { state, label, severity, message }
 */
function classifyGridState({
  gridConnected,
  tomznPowerW,
  inverterMode,
  inverterOnline,
  gridState,
  now = Date.now(),
}) {
  // Track transitions for unstable detection
  const wasConnected = gridState.lastConnected;
  gridState.lastConnected = gridConnected;

  if (wasConnected !== undefined && wasConnected !== gridConnected) {
    gridState.transitions = gridState.transitions || [];
    gridState.transitions.push(now);
    // Prune old transitions
    gridState.transitions = gridState.transitions.filter((t) => now - t < CONFIG.unstableWindowMs);
  }

  // Check for unstable: too many transitions
  const isUnstable = (gridState.transitions || []).length >= CONFIG.unstableThreshold;

  // Detect cutoff
  const gridDown = !gridConnected || inverterMode === "B" || !inverterOnline;

  if (gridDown) {
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
        message: "WAPDA grid is unavailable. Inverter is powering the home from battery/solar.",
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

  // Grid is connected
  gridState.cutoffStart = 0;

  // Check if just restored
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

  // Classify connected state
  const power = Math.max(0, tomznPowerW || 0);

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
