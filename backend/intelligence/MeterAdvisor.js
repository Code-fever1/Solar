"use strict";

/**
 * MeterAdvisor v3 — user-intent-aware meter switch advice.
 *
 * Design principles (per user request):
 *   - Do NOT suggest switching to "keep both meters at the same rate."
 *     The user may intentionally run a single meter. Equalize/richer-first
 *     logic is removed entirely.
 *   - Only speak when there's a REAL reason to switch:
 *     1. Active meter is low (≤20 units) and the other has more → switch.
 *     2. Active meter is critically low (≤10 units) → switch now (alert).
 *     3. At current burn rate, the active meter will exhaust TONIGHT → warn.
 *     4. One meter is clearly more efficient (calibration factor) → suggest
 *        once, then hide.
 *     5. Meter 1 has a government subsidy → suggest using it first, once,
 *        then hide.
 *   - When the active meter is healthy and has plenty of headroom, stay quiet.
 *   - Combined shortfall (both meters won't last to cycle end) still warns.
 */

const LOW_UNITS = 10;        // critical — switch now
const WARN_UNITS = 20;       // start warning
const HEADROOM = 3;          // other meter must beat active by this
const TONIGHT_HOURS = 12;    // "tonight" = next 12 hours
const MIN_BURN_PER_HOUR = 0.02;
const MIN_BURN_PER_DAY = 0.3;
const EFFICIENCY_THRESHOLD = 0.03; // 3% calibration difference to suggest efficiency
const SUBSIDY_METER = "meter1";   // meter1 has government subsidy

const DEFAULT_RESERVE = { meter1: 2, meter2: 0 };

function meterName(id) {
  return id === "meter1" ? "Meter 1" : "Meter 2";
}

function round1(n) {
  return Math.round(Number(n || 0) * 10) / 10;
}

function remainingUnits(meter, slabTarget) {
  const baseline = Number(meter?.cycleBaselineReading) || 0;
  const reading = Number(meter?.anchorReading ?? baseline) || 0;
  return Math.max(0, round1(slabTarget - (reading - baseline)));
}

/** Human duration: < 48h → hours, else days. */
function humanTime(hours) {
  if (!Number.isFinite(hours) || hours < 0) return null;
  if (hours < 48) return { label: "hours", value: Math.max(1, Math.round(hours)) };
  return { label: "days", value: Math.max(1, Math.round(hours / 24)) };
}

/**
 * @param {object} params
 * @param {object} params.meters
 * @param {string} params.activeMeter
 * @param {number} [params.slabTarget]
 * @param {number} [params.averageDaily]   calibrated meter units/day (learned)
 * @param {number} [params.burnUnitsPerHour] live calibrated meter units/hour
 * @param {number} [params.cycleEndAt]     ms of next billing boundary
 * @param {number} [params.now]
 * @param {object} [params.reserve]        {meter1, meter2} protected units
 * @param {number} [params.confidence]     0..1
 * @param {object} [params.remainingOverride]
 */
function computeMeterRecommendation({
  meters = {},
  activeMeter = "meter1",
  slabTarget = 200,
  averageDaily = 0,
  burnUnitsPerHour = 0,
  cycleEndAt = 0,
  now = Date.now(),
  reserve = DEFAULT_RESERVE,
  confidence = 0.5,
  remainingOverride = null,
}) {
  const remaining = remainingOverride && Number.isFinite(remainingOverride.meter1) && Number.isFinite(remainingOverride.meter2)
    ? { meter1: Math.max(0, round1(remainingOverride.meter1)), meter2: Math.max(0, round1(remainingOverride.meter2)) }
    : {
      meter1: remainingUnits(meters.meter1, slabTarget),
      meter2: remainingUnits(meters.meter2, slabTarget),
    };

  const usable = {
    meter1: Math.max(0, round1(remaining.meter1 - (reserve.meter1 || 0))),
    meter2: Math.max(0, round1(remaining.meter2 - (reserve.meter2 || 0))),
  };

  const otherMeter = activeMeter === "meter1" ? "meter2" : "meter1";
  const usableActive = usable[activeMeter];
  const usableOther = usable[otherMeter];
  const burnPerDay = Math.max(MIN_BURN_PER_DAY, Number(averageDaily) || 0);
  const burnPerHour = Math.max(MIN_BURN_PER_HOUR, Number(burnUnitsPerHour) || 0);
  const daysToCycleEnd = cycleEndAt > 0 ? Math.max(0, (cycleEndAt - now) / 86_400_000) : null;

  // Time remaining
  const hoursLeftActive = burnPerHour > 0 ? usableActive / burnPerHour : null;
  const daysLeftActive = burnPerDay > 0 ? usableActive / burnPerDay : null;
  const hoursLeftOther = burnPerHour > 0 ? usableOther / burnPerHour : null;

  // Combined budget
  const combinedUsable = round1(usableActive + usableOther);
  const combinedDays = burnPerDay > 0 ? combinedUsable / burnPerDay : null;
  const exhaustDate = combinedDays != null && burnPerDay > 0 ? now + combinedDays * 86_400_000 : null;
  const shortfallUnitsPerDay = daysToCycleEnd != null && combinedDays != null
    ? Math.max(0, round1(burnPerDay - combinedUsable / Math.max(0.01, daysToCycleEnd)))
    : 0;
  const willSurvive = daysLeftActive != null && daysToCycleEnd != null && daysLeftActive >= daysToCycleEnd;

  // Calibration efficiency: lower calibration factor = more efficient (less waste)
  const calib1 = Number(meters.meter1?.calibrationFactor) || 1;
  const calib2 = Number(meters.meter2?.calibrationFactor) || 1;
  const efficiencyDiff = Math.abs(calib1 - calib2);
  const moreEfficient = calib1 < calib2 ? "meter1" : "meter2";

  // Subsidy: meter1 has government subsidy. Only suggest if user is NOT on meter1
  // and meter1 has meaningful remaining units.
  const subsidyAvailable = activeMeter !== SUBSIDY_METER && usable[SUBSIDY_METER] > WARN_UNITS;

  let recommendation = activeMeter;
  let shouldSwitch = false;
  let action = "keep_" + activeMeter;
  let urgency = "none";
  let reason = "ACTIVE_HAS_HEADROOM";
  let text = null;
  let switchPlan = null;

  // ── Decision tree (priority order) ──

  if (daysToCycleEnd != null && daysToCycleEnd <= 0) {
    reason = "CYCLE_ROLLOVER";
    text = null;
  } else if (usableActive <= 0.5) {
    // Active meter is AT or below its protected floor — must switch.
    if (usableOther > 1) {
      recommendation = otherMeter;
      shouldSwitch = true;
      action = "switch_now_" + otherMeter;
      urgency = "alert";
      reason = "ACTIVE_METER_AT_FLOOR";
      const t = humanTime(hoursLeftOther);
      text = `${meterName(activeMeter)} is at its floor. Switch to ${meterName(otherMeter)} now (${usableOther} usable${t ? `, ~${t.value} ${t.label}` : ""}).`;
      switchPlan = { mode: "switch_now", rationale: reason };
    } else {
      urgency = "alert";
      reason = "BOTH_METERS_AT_FLOOR";
      recommendation = usable.meter1 >= usable.meter2 ? "meter1" : "meter2";
      text = `Both meters are at their floor (${usable.meter1} / ${usable.meter2} usable). ${meterName(recommendation)} has slightly more — switch to it.`;
      switchPlan = { mode: "both_short", rationale: reason };
    }
  } else if (usableActive <= LOW_UNITS && usableOther > usableActive + HEADROOM) {
    // Critical: active meter ≤10 units, other has significantly more.
    recommendation = otherMeter;
    shouldSwitch = true;
    action = "switch_now_" + otherMeter;
    urgency = "alert";
    reason = "ACTIVE_METER_CRITICAL";
    const t = humanTime(hoursLeftActive);
    text = `${meterName(activeMeter)} is down to ${usableActive} units${t ? ` (${t.value} ${t.label} at current draw)` : ""}. Switch to ${meterName(otherMeter)} (${usableOther} usable) now.`;
    switchPlan = { mode: "switch_now", rationale: reason };
  } else if (usableActive <= WARN_UNITS && usableOther > usableActive + HEADROOM) {
    // Warning: active meter ≤20 units, other has more.
    recommendation = otherMeter;
    shouldSwitch = true;
    action = "consider_switch_" + otherMeter;
    urgency = "warning";
    reason = "ACTIVE_METER_RUNNING_LOW";
    const t = humanTime(hoursLeftActive);
    text = `${meterName(activeMeter)} has ${usableActive} units left${t ? ` (~${t.value} ${t.label})` : ""}. Consider switching to ${meterName(otherMeter)} (${usableOther} usable).`;
    switchPlan = { mode: "switch_now", rationale: reason };
  } else if (hoursLeftActive != null && hoursLeftActive <= TONIGHT_HOURS && usableOther > usableActive + HEADROOM) {
    // Tonight exhaustion: at current burn rate, the active meter will run out
    // within 12 hours (tonight). Warn to switch before it dies overnight.
    recommendation = otherMeter;
    shouldSwitch = true;
    action = "consider_switch_" + otherMeter;
    urgency = "warning";
    reason = "ACTIVE_METER_EXHAUSTS_TONIGHT";
    const t = humanTime(hoursLeftActive);
    text = `${meterName(activeMeter)} will exhaust in ~${t.value} ${t.label} at current draw. Switch to ${meterName(otherMeter)} (${usableOther} usable) to avoid running out tonight.`;
    switchPlan = { mode: "switch_now", rationale: reason };
  } else if (shortfallUnitsPerDay > 0 && !willSurvive) {
    // Combined budget won't last to cycle end — both meters are short.
    urgency = "warning";
    reason = "COMBINED_SHORTFALL";
    const e = exhaustDate ? new Date(exhaustDate).toLocaleDateString("en-PK", { day: "numeric", month: "short" }) : "?";
    const daysCovered = combinedDays != null ? Math.max(1, Math.round(combinedDays)) : null;
    text = `Combined ${combinedUsable} usable units at ~${round1(burnPerDay)}/day last ${daysCovered ? "~" + daysCovered + " days" : "less than the cycle"}; cycle has ${daysToCycleEnd != null ? Math.round(daysToCycleEnd) : "?"} days left. Reduce ~${shortfallUnitsPerDay} units/day or both meters hit the slab around ${e}.`;
    switchPlan = { mode: "both_short", exhaustDate, shortfallUnitsPerDay, rationale: reason };
  } else if (subsidyAvailable && usableActive > WARN_UNITS) {
    // Subsidy suggestion: meter1 has government subsidy. Suggest once, then
    // stay quiet (the frontend hysteresis will suppress repeats). Only when
    // the active meter is healthy (not already in a low-units scenario).
    urgency = "info";
    reason = "SUBSIDY_AVAILABLE";
    recommendation = SUBSIDY_METER;
    action = "consider_switch_" + SUBSIDY_METER;
    text = `${meterName(SUBSIDY_METER)} carries a government subsidy. Using it first saves cost — consider switching when convenient.`;
    switchPlan = { mode: "switch_when_convenient", rationale: reason };
  } else if (efficiencyDiff >= EFFICIENCY_THRESHOLD && moreEfficient !== activeMeter && usable[moreEfficient] > WARN_UNITS && usableActive > WARN_UNITS) {
    // Efficiency suggestion: one meter is measurably more efficient (lower
    // calibration factor = less wasted units). Suggest once, then hide.
    urgency = "info";
    reason = "EFFICIENCY_SUGGESTION";
    recommendation = moreEfficient;
    action = "consider_switch_" + moreEfficient;
    const pct = Math.round(efficiencyDiff * 100);
    text = `${meterName(moreEfficient)} is ~${pct}% more efficient (lower meter ratio). Using it reduces wasted units over time.`;
    switchPlan = { mode: "switch_when_convenient", rationale: reason };
  } else if (willSurvive) {
    // Active meter covers the cycle — stay quiet. User is intentionally
    // running this meter; no need to suggest switching.
    reason = "ACTIVE_COVERS_CYCLE";
    text = null;
    switchPlan = { mode: "keep", rationale: reason };
  } else {
    // Default: active meter has headroom, stay quiet.
    reason = "ACTIVE_HAS_HEADROOM";
    text = null;
    switchPlan = { mode: "keep", rationale: reason };
  }

  const advantage = round1(Math.abs(remaining.meter1 - remaining.meter2));

  return {
    recommendation,
    activeMeter,
    otherMeter,
    remaining,
    usable,
    remainingActive: remaining[activeMeter],
    remainingOther: remaining[otherMeter],
    usableActive,
    usableOther,
    hoursLeftActive: hoursLeftActive != null ? Math.round(hoursLeftActive * 10) / 10 : null,
    daysLeftActive: daysLeftActive != null ? Math.round(daysLeftActive * 10) / 10 : null,
    hoursLeftOther: hoursLeftOther != null ? Math.round(hoursLeftOther * 10) / 10 : null,
    daysLeftOther: null,
    shouldSwitch,
    shouldRecommend: shouldSwitch,
    action,
    urgency,
    reason,
    text,
    switchPlan,
    willSurviveCycle: !!willSurvive,
    daysToCycleEnd: daysToCycleEnd != null ? Math.round(daysToCycleEnd * 10) / 10 : null,
    combinedUsable,
    exhaustDate,
    shortfallUnitsPerDay,
    slabTarget,
    meter1Score: Math.round(Math.min(100, (remaining.meter1 / Math.max(1, slabTarget)) * 100)),
    meter2Score: Math.round(Math.min(100, (remaining.meter2 / Math.max(1, slabTarget)) * 100)),
    advantage,
    advantageFavors: remaining.meter1 >= remaining.meter2 ? "meter1" : "meter2",
    bucketId: null,
    confidence: Math.max(0.05, Math.min(0.95, confidence)),
    reasonCodes: [reason],
  };
}

module.exports = { computeMeterRecommendation, remainingUnits, LOW_UNITS, WARN_UNITS, DEFAULT_RESERVE };
