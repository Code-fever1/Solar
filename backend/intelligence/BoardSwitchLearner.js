"use strict";

/**
 * DB paddle inference + correction learning.
 *
 * Live telemetry cannot read the physical breakers. We infer:
 *   PV        — PV voltage/current/power present on either string
 *   Grey      — on-grid / night / bypass → down (house on WAPDA);
 *               hybrid (real loadW) → up (house on inverter AC)
 *   WAPDA In  — inverter mode L/P uses grid input; B usually still up;
 *               S means the bottom power button is off (dongle still talks)
 *   TOMZN     — Tuya relay switchOn + voltage
 *
 * Each time the user confirms a different layout, we count that situation
 * so the next guess in the same mode/flow/time-of-day follows them.
 */

const PV_V_ON = 40;
const PV_W_ON = 8;
const PV_A_ON = 0.15;
const LOAD_HYBRID_W = 25;
const WAPDA_V = 180;

function emptyStats() {
  return {
    n: 0,
    pvOn: 0, pvOff: 0,
    greyUp: 0, greyCenter: 0, greyDown: 0,
    wapdaOn: 0, wapdaOff: 0,
    tomznOn: 0, tomznOff: 0,
    misses: 0,
  };
}

function normalizeLearn(raw) {
  return {
    buckets: raw?.buckets && typeof raw.buckets === "object" ? raw.buckets : {},
    samples: Number(raw?.samples) || 0,
    lastAt: Number(raw?.lastAt) || 0,
  };
}

function dayPart(hour) {
  const h = Number(hour);
  if (h >= 18 || h < 6) return "night";
  if (h < 9) return "morning";
  if (h < 16) return "day";
  return "evening";
}

function modeKey(inverter) {
  const raw = String(inverter?.inverterMode || "unknown").toUpperCase();
  if (raw === "L" || raw === "B" || raw === "S" || raw === "F" || raw === "P") return raw;
  if (raw === "OFFLINE") return "S";
  return "U";
}

function flowKey(gridFlow) {
  const m = String(gridFlow?.mode || "").toLowerCase();
  if (m === "hybrid" || m === "on-grid" || m === "bypass" || m === "night") return m;
  return "unk";
}

function bucketKey(inverter, gridFlow, hour) {
  return `${modeKey(inverter)}|${flowKey(gridFlow)}|${dayPart(hour)}`;
}

function pvInputOn(inverter) {
  const v1 = Number(inverter?.pv1V) || 0;
  const v2 = Number(inverter?.pv2V) || 0;
  const w1 = Number(inverter?.pv1W) || 0;
  const w2 = Number(inverter?.pv2W) || 0;
  const a1 = Number(inverter?.pv1A) || 0;
  const a2 = Number(inverter?.pv2A) || 0;
  const solar = Number(inverter?.solarW) || 0;
  return v1 >= PV_V_ON || v2 >= PV_V_ON || w1 >= PV_W_ON || w2 >= PV_W_ON
    || a1 >= PV_A_ON || a2 >= PV_A_ON || solar >= 15;
}

/** Bottom power button. Dongle can stay online in standby (S). */
function inverterPowerOn(inverter) {
  const mode = modeKey(inverter);
  if (inverter?.isOnline === false && mode === "U") return false;
  return mode === "L" || mode === "B" || mode === "P" || mode === "F";
}

function inferRules(inverter, tomzn, gridFlow) {
  const mode = modeKey(inverter);
  const flow = flowKey(gridFlow);
  const loadW = Number(inverter?.loadW) || 0;
  const gridV = Number(inverter?.gridV) || 0;
  const tomznV = Number(tomzn?.voltageV) || 0;
  const tomznW = Number(tomzn?.powerW) || 0;

  const pv = pvInputOn(inverter);

  let grey = "down";
  if (flow === "hybrid" || (inverterPowerOn(inverter) && loadW >= LOAD_HYBRID_W)) grey = "up";
  else if (flow === "on-grid" || flow === "night" || flow === "bypass") grey = "down";

  let wapdaIn = false;
  if (mode === "L" || mode === "P") wapdaIn = true;
  else if (mode === "B") wapdaIn = true;
  else if (mode === "S") wapdaIn = false;
  else if (inverter?.gridConnected && gridV >= WAPDA_V) wapdaIn = true;

  const tomznSwitch = tomzn?.switchOn !== false
    && (tomzn?.switchOn === true || tomznV >= 50 || tomznW > 0 || tomzn?.isOnline !== false);

  return { pv, grey, wapdaIn, tomzn: !!tomznSwitch };
}

function boolVote(on, off, fallback) {
  const t = (Number(on) || 0) + (Number(off) || 0);
  if (t < 2) return fallback;
  if (on === off) return fallback;
  return on > off;
}

function greyVote(stats, fallback) {
  const up = Number(stats.greyUp) || 0;
  const down = Number(stats.greyDown) || 0;
  const center = Number(stats.greyCenter) || 0;
  if (up + down + center < 2) return fallback;
  if (down >= up && down >= center) return "down";
  if (up >= down && up >= center) return "up";
  return "center";
}

function statsFor(learn, inverter, gridFlow, hour) {
  const buckets = normalizeLearn(learn).buckets;
  const exact = buckets[bucketKey(inverter, gridFlow, hour)];
  if (exact && exact.n >= 1) return exact;
  const mode = modeKey(inverter);
  const flow = flowKey(gridFlow);
  const loose = buckets[`${mode}|${flow}|*`];
  if (loose && loose.n >= 2) return loose;
  return null;
}

function applyLearn(rule, learn, inverter, gridFlow, hour) {
  const stats = statsFor(learn, inverter, gridFlow, hour);
  if (!stats) return rule;
  return {
    pv: boolVote(stats.pvOn, stats.pvOff, rule.pv),
    grey: greyVote(stats, rule.grey),
    wapdaIn: boolVote(stats.wapdaOn, stats.wapdaOff, rule.wapdaIn),
    tomzn: boolVote(stats.tomznOn, stats.tomznOff, rule.tomzn),
  };
}

function guessBoard(inverter, tomzn, gridFlow, learn, hour) {
  const rule = inferRules(inverter, tomzn, gridFlow);
  return applyLearn(rule, learn, inverter, gridFlow, hour);
}

function sameBoard(a, b) {
  if (!a || !b) return false;
  return a.pv === b.pv && a.grey === b.grey && a.wapdaIn === b.wapdaIn && a.tomzn === b.tomzn;
}

function bump(stats, actual, predicted) {
  const next = { ...stats, n: (stats.n || 0) + 1 };
  if (actual.pv) next.pvOn = (next.pvOn || 0) + 1;
  else next.pvOff = (next.pvOff || 0) + 1;
  if (actual.grey === "up") next.greyUp = (next.greyUp || 0) + 1;
  else if (actual.grey === "center") next.greyCenter = (next.greyCenter || 0) + 1;
  else next.greyDown = (next.greyDown || 0) + 1;
  if (actual.wapdaIn) next.wapdaOn = (next.wapdaOn || 0) + 1;
  else next.wapdaOff = (next.wapdaOff || 0) + 1;
  if (actual.tomzn) next.tomznOn = (next.tomznOn || 0) + 1;
  else next.tomznOff = (next.tomznOff || 0) + 1;
  if (predicted && !sameBoard(predicted, actual)) next.misses = (next.misses || 0) + 1;
  if (next.n > 40) {
    for (const key of Object.keys(next)) {
      if (typeof next[key] === "number") next[key] = Math.round(next[key] * 0.75);
    }
  }
  return next;
}

function recordBoardCorrection(learn, inverter, tomzn, gridFlow, hour, predicted, actual) {
  const state = normalizeLearn(learn);
  const exact = bucketKey(inverter, gridFlow, hour);
  const loose = `${modeKey(inverter)}|${flowKey(gridFlow)}|*`;
  state.buckets[exact] = bump(state.buckets[exact] || emptyStats(), actual, predicted);
  state.buckets[loose] = bump(state.buckets[loose] || emptyStats(), actual, predicted);
  state.samples += 1;
  state.lastAt = Date.now();
  return state;
}

function inverterPowerHint(inverter) {
  const mode = modeKey(inverter);
  if (inverter?.isOnline === false) return "Dongle not reaching the inverter.";
  if (mode === "S") return "Dongle is live. Bottom power looks off (standby).";
  if (mode === "L") return "Inverter on — Line (WAPDA in).";
  if (mode === "B") return "Inverter on — battery (grid lost at inverter).";
  if (mode === "F") return "Inverter on — fault.";
  if (mode === "P") return "Inverter on — power-on.";
  return `Inverter mode ${mode}.`;
}

module.exports = {
  guessBoard,
  inferRules,
  recordBoardCorrection,
  bucketKey,
  inverterPowerOn,
  inverterPowerHint,
  pvInputOn,
  normalizeLearn,
};
