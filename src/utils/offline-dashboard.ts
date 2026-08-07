import type { EnergyFlowPoint, EnergyToday, HomeState, InverterTelemetry, LiveTelemetry, ManualLog, MeterId, MeterState, WeatherState } from "@/context/energy-types";

export type CachedTomznLive = {
  energyKwh: number;
  voltageV: number;
  currentA: number;
  powerW: number;
  powerDisplay: string;
  frequencyHz: number;
  isOnline: boolean;
  switchOn: boolean;
  faultCode: number;
  fetchedAt: string;
  isLive: boolean;
  timestamp?: number;
  activeMeter?: MeterId;
};

export type CachedDashboardSnapshot = {
  generatedAt?: string;
  activeMeter: MeterId;
  changeover: { activeMeter: MeterId; lastSwitchedAt: number };
  tomznLive: CachedTomznLive;
  inverter?: InverterTelemetry;
  weather?: WeatherState;
  energyToday?: EnergyToday;
  flowHistory?: EnergyFlowPoint[];
  live: LiveTelemetry;
  home: HomeState;
  meters: Record<MeterId, MeterState>;
  manualLogs: ManualLog[];
  meta?: { billingEnd?: number; [key: string]: unknown };
  ups?: { active: boolean; label: string } | null;
};

const DAY_MS = 86_400_000;
const PAKISTAN_OFFSET = "+05:00";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function pakistanParts(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(byType.year), month: Number(byType.month), day: Number(byType.day),
    hour: Number(byType.hour), minute: Number(byType.minute),
  };
}

function pakistanDayStart(timestamp: number) {
  const { year, month, day } = pakistanParts(timestamp);
  return Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00${PAKISTAN_OFFSET}`);
}

function weekday(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", weekday: "short" }).format(new Date(timestamp));
}

function trendMultiplier(home: HomeState) {
  const trend = home.usageTrendPercent ?? home.usageChangePercent ?? 0;
  if (trend <= -10) return 0.9;
  if (trend >= 10) return 1.1;
  return 1;
}

function alignedDailyUsage(home: HomeState, now: number, todayUsage: number, expectedDaily: number) {
  const days = [...(home.dailyUsage || [])];
  if (!days.length) return days;

  const todayStart = pakistanDayStart(now);
  let lastStart = pakistanDayStart(days[days.length - 1].timestamp);
  while (lastStart < todayStart) {
    lastStart += DAY_MS;
    days.push({
      timestamp: lastStart,
      label: weekday(lastStart),
      usage: lastStart === todayStart ? todayUsage : expectedDaily,
    });
    while (days.length > 7) days.shift();
  }

  const last = days[days.length - 1];
  if (pakistanDayStart(last.timestamp) === todayStart) {
    last.usage = todayUsage;
    last.label = weekday(todayStart);
  }
  return days.map((day) => ({ ...day, usage: round(day.usage) }));
}

/**
 * Hour-of-day usage weights for Pakistan residential solar homes.
 * Reflects typical load: low at night, rising mid-morning, peak evening.
 * Sum of all 24 weights = 24 (so average weight = 1.0, matching dailyRate/24).
 */
const HOUR_WEIGHTS = [
  0.3, 0.2, 0.2, 0.2, 0.3, 0.6, // 0-5: night (minimal)
  1.2, 1.5, 1.4, 1.3, 1.2, 1.1, // 6-11: morning (rising)
  1.0, 0.9, 0.9, 1.0, 1.1, 1.3, // 12-17: afternoon
  1.8, 2.2, 2.0, 1.5, 1.0, 0.6, // 18-23: evening peak → night decline
];

/**
 * Estimate cumulative usage from savedAt to now using the time-of-day pattern.
 * Instead of a flat dailyRate * elapsedDays, this integrates the hourly weight
 * pattern so the estimate is more accurate at any given moment.
 */
function patternedUsage(dailyRate: number, savedAt: number, now: number): number {
  const start = Math.min(savedAt, now);
  const end = Math.max(savedAt, now);
  let total = 0;
  // Walk hour-by-hour from start to end, accumulating weighted usage.
  let cursor = start;
  while (cursor < end) {
    const hour = pakistanParts(cursor).hour;
    const hourEnd = Math.min(cursor - (cursor % 3_600_000) + 3_600_000, end);
    const fractionOfHour = (hourEnd - cursor) / 3_600_000;
    const hourlyRate = dailyRate * HOUR_WEIGHTS[hour] / 24;
    total += hourlyRate * fractionOfHour;
    cursor = hourEnd;
  }
  return total;
}

/**
 * A deliberately small, deterministic fallback. It never invents a new TOMZN
 * measurement: it advances the last saved reading only by the learned daily
 * pattern (weighted by time of day), marks it offline, and is replaced as
 * soon as the server responds.
 *
 * The estimate refreshes every 5s via polling, so units continuously increase
 * while offline. On reconnection, the server's real data replaces this.
 */
export function estimateOfflineDashboard(
  source: CachedDashboardSnapshot,
  savedAt: number,
  now = Date.now(),
): CachedDashboardSnapshot {
  const elapsedDays = clamp((now - savedAt) / DAY_MS, 0, 7);
  const dailyRate = Math.max(0, source.home.averageDaily || 0) * trendMultiplier(source.home);
  // Use time-of-day patterned usage instead of flat dailyRate * elapsedDays.
  const estimatedTomznUnits = patternedUsage(dailyRate, savedAt, now);
  const sameDay = pakistanDayStart(savedAt) === pakistanDayStart(now);
  const nowParts = pakistanParts(now);
  const dayFraction = clamp((nowParts.hour * 60 + nowParts.minute) / (24 * 60), 0, 1);
  // Today's usage: if same day, add the elapsed estimate to the saved value.
  // If crossed midnight, estimate today's usage up to the current time.
  const todayUsage = sameDay
    ? (source.home.todayUsage || 0) + estimatedTomznUnits
    : patternedUsage(dailyRate, pakistanDayStart(now), now);

  const activeMeter = source.activeMeter;
  const active = source.meters[activeMeter];
  // Use the meter's calibration factor to convert TOMZN units to meter units.
  // Clamp to a tight range to avoid compounding error during long offline periods.
  const activeCalibration = clamp(active.calibrationFactor ?? 1, 0.8, 1.2);
  const estimatedActiveMeterUnits = estimatedTomznUnits * activeCalibration;
  const baselineReading = active.reading - (active.cycleUsage || 0);
  const activeTodayBase = sameDay ? active.todayUsage || 0 : 0;
  const activeTodayUsage = sameDay
    ? activeTodayBase + estimatedActiveMeterUnits
    : todayUsage * activeCalibration;
  const nextActive: MeterState = {
    ...active,
    reading: round(active.reading + estimatedActiveMeterUnits, 3),
    cycleUsage: round((active.cycleUsage || 0) + estimatedActiveMeterUnits, 3),
    remainingUnits: round(Math.max(0, active.remainingUnits - estimatedActiveMeterUnits), 3),
    todayUsage: round(activeTodayUsage, 3),
    currentDaily: round(activeTodayUsage, 3),
    lastLoggedReading: active.lastLoggedReading ?? baselineReading,
    explanation: "Offline estimate, based on the last saved TOMZN reading and your recent usage trend.",
  };

  // Also update the inactive meter's projection (it will consume after changeover).
  const otherMeterId: MeterId = activeMeter === "meter1" ? "meter2" : "meter1";
  const other = source.meters[otherMeterId];
  const nextMeters: Record<MeterId, MeterState> = { ...source.meters, [activeMeter]: nextActive };
  if (other) {
    // The inactive meter doesn't accumulate usage while offline, but its
    // projected days left should be updated based on the current daily rate.
    const otherCalibration = clamp(other.calibrationFactor ?? 1, 0.8, 1.2);
    const otherDailyUsage = dailyRate * otherCalibration;
    const otherRemaining = Math.max(0, other.remainingUnits);
    nextMeters[otherMeterId] = {
      ...other,
      averageDaily: round(otherDailyUsage, 3),
      expectedDrawNow: 0,
    };
  }

  return {
    ...source,
    generatedAt: new Date(now).toISOString(),
    tomznLive: {
      ...source.tomznLive,
      energyKwh: round((source.tomznLive.energyKwh || 0) + estimatedTomznUnits, 3),
      powerW: 0,
      powerDisplay: "Offline estimate",
      isOnline: false,
      isLive: false,
    },
    inverter: source.inverter ? { ...source.inverter, isLive: false } : undefined,
    weather: source.weather ? { ...source.weather, isLive: false } : undefined,
    live: { ...source.live, gridKw: 0, solarKw: 0, homeKw: 0, currentAmp: 0 },
    home: {
      ...source.home,
      todayUsage: round(todayUsage, 3),
      averageDaily: round(dailyRate, 3),
      expectedDrawNow: round(dailyRate * HOUR_WEIGHTS[nowParts.hour] / 24, 3),
      dailyUsage: alignedDailyUsage(source.home, now, todayUsage, dailyRate),
      explanation: "Offline estimate based on the last saved reading and historical trend. It will be replaced when Voltix reconnects.",
    },
    meters: nextMeters,
  };
}

export function applyOfflineChangeover(source: CachedDashboardSnapshot, meterId: MeterId, timestamp = Date.now()): CachedDashboardSnapshot {
  const otherMeter: MeterId = meterId === "meter1" ? "meter2" : "meter1";
  return {
    ...source,
    activeMeter: meterId,
    changeover: { activeMeter: meterId, lastSwitchedAt: timestamp },
    meters: {
      ...source.meters,
      [meterId]: { ...source.meters[meterId], queueStatus: "ACTIVE" },
      [otherMeter]: { ...source.meters[otherMeter], queueStatus: "NEXT" },
    },
    home: { ...source.home, explanation: "Offline changeover saved. Voltix will reconcile the TOMZN ledger when it reconnects." },
  };
}

export function applyOfflineManualReading(
  source: CachedDashboardSnapshot,
  meterId: MeterId,
  reading: number,
  timestamp: number,
  notes?: string,
): CachedDashboardSnapshot {
  const meter = source.meters[meterId];
  const baselineReading = meter.reading - (meter.cycleUsage || 0);
  const oldCycleUsage = meter.cycleUsage || 0;
  const cycleUsage = Math.max(0, reading - baselineReading);

  // Gap between what the system predicted and what the user actually read.
  const predictedReading = meter.reading;
  const gap = round(reading - predictedReading, 3);
  const absGap = Math.abs(gap);

  // The cycle usage delta from the manual correction is attributed to today.
  const cycleUsageDelta = round(cycleUsage - oldCycleUsage, 3);
  const todayUsage = Math.max(0, round((meter.todayUsage || 0) + cycleUsageDelta, 3));

  // Recalculate confidence based on the gap.
  const avgDaily = Math.max(0.1, meter.averageDaily || meter.recentDailyAvg || 1);
  const errorPenalty = Math.min(40, Math.round((absGap / avgDaily) * 30));
  const baseConfidence = avgDaily > 0 ? Math.round(55 + Math.min(35, 8)) : 20;
  const finalConfidence = Math.max(10, Math.min(95, baseConfidence - errorPenalty));

  // Health score: large gaps reduce health.
  const gapRatio = Math.min(1, absGap / avgDaily);
  const healthScore = Math.round(Math.max(0, 100 - gapRatio * 60));
  const healthColor = healthScore > 70 ? "#22C55E" : healthScore > 40 ? "#F8C653" : "#EF4C4C";

  const calibrationConfidence = Math.max(10, Math.min(95, Math.round(95 - gapRatio * 50)));

  // Recalculate projected days left and monthly projection based on new remaining units.
  const remainingUnits = round(Math.max(0, meter.targetUnits - cycleUsage));
  const projectedDaysLeft = avgDaily > 0 ? Math.max(0, Math.floor(remainingUnits / avgDaily)) : 0;

  // Projected monthly: current cycle usage + remaining days in cycle × daily rate
  const now = new Date();
  const billingDay = 28;
  const cycleStartMonth = now.getDate() >= billingDay ? now.getMonth() : now.getMonth() - 1;
  const cycleStartYear = cycleStartMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
  const cycleStartIdx = ((cycleStartMonth % 12) + 12) % 12;
  const cycleStartDate = new Date(cycleStartYear, cycleStartIdx, billingDay);
  const cycleEndDate = new Date(cycleStartYear, cycleStartIdx + 1, billingDay);
  const totalCycleDays = Math.max(1, Math.round((cycleEndDate.getTime() - cycleStartDate.getTime()) / 86_400_000));
  const elapsedDays = Math.max(0, Math.min(totalCycleDays, Math.floor((now.getTime() - cycleStartDate.getTime()) / 86_400_000)));
  const remainingCycleDays = Math.max(0, totalCycleDays - elapsedDays);
  const projectedMonthly = round(cycleUsage + remainingCycleDays * avgDaily, 1);

  // Recalculate home-level aggregates using both meters
  const otherMeterId: MeterId = meterId === "meter1" ? "meter2" : "meter1";
  const otherMeter = source.meters[otherMeterId];
  const combinedRemaining = remainingUnits + (otherMeter?.remainingUnits || 0);
  const combinedAvgDaily = avgDaily + Math.max(0.1, otherMeter?.averageDaily || otherMeter?.recentDailyAvg || 1);
  const combinedDaysLeft = Math.max(0, Math.floor(combinedRemaining / combinedAvgDaily));
  const combinedProjected = round(projectedMonthly + (otherMeter?.projectedMonthly || 0), 1);

  const manualLog: ManualLog = { id: `offline-${meterId}-${timestamp}`, meterId, reading, timestamp, notes };
  return {
    ...source,
    meters: {
      ...source.meters,
      [meterId]: {
        ...meter,
        reading: round(reading),
        cycleUsage: round(cycleUsage),
        remainingUnits,
        todayUsage,
        currentDaily: todayUsage,
        lastLoggedAt: timestamp,
        lastLoggedReading: reading,
        projectedDaysLeft,
        projectedMonthly,
        driftOffset: gap,
        averageError: absGap,
        predictionConfidence: finalConfidence,
        confidencePercent: finalConfidence,
        healthScore,
        healthColor,
        consumptionSpeedScore: healthScore,
        consumptionSpeedColor: healthColor,
        remainingColor: remainingUnits / meter.targetUnits > 0.5 ? "#22C55E" : remainingUnits / meter.targetUnits > 0.25 ? "#F8C653" : "#EF4C4C",
        calibrationConfidence,
        trendStatus: absGap > avgDaily * 0.5 ? "worsening" : absGap < avgDaily * 0.1 ? "improving" : "stable",
        explanation: `Manual reading ${reading.toFixed(1)} kWh logged. Predicted was ${predictedReading.toFixed(1)} — gap of ${gap > 0 ? "+" : ""}${gap.toFixed(1)} units. Confidence adjusted to ${finalConfidence}%.`,
      },
    },
    manualLogs: [manualLog, ...source.manualLogs],
    home: {
      ...source.home,
      projectedMonthly: combinedProjected,
      combinedDaysLeft,
      confidencePercent: finalConfidence,
      todayUsage: round((source.home.todayUsage || 0) + cycleUsageDelta, 3),
      explanation: `Manual reading saved. Gap of ${gap > 0 ? "+" : ""}${gap.toFixed(1)} units — readings, usage, projections and confidence recalculated.`,
    },
  };
}

export function applyOfflineBaseline(source: CachedDashboardSnapshot, meterId: MeterId, reading: number): CachedDashboardSnapshot {
  const meter = source.meters[meterId];
  return {
    ...source,
    meters: {
      ...source.meters,
      [meterId]: {
        ...meter,
        reading: round(reading),
        cycleUsage: 0,
        remainingUnits: meter.targetUnits,
        lastLoggedReading: reading,
      },
    },
    home: { ...source.home, explanation: "Baseline saved offline. Voltix will apply it to the current billing cycle when it reconnects." },
  };
}
