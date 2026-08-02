import type { HomeState, LiveTelemetry, ManualLog, MeterId, MeterState } from "@/context/energy-types";

export type CachedTomznLive = {
  energyKwh: number;
  voltageV: number;
  currentA: number;
  powerW: number;
  powerDisplay: string;
  frequencyHz: number;
  isOnline: boolean;
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
  live: LiveTelemetry;
  home: HomeState;
  meters: Record<MeterId, MeterState>;
  manualLogs: ManualLog[];
  meta?: { billingEnd?: number; [key: string]: unknown };
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
 * A deliberately small, deterministic fallback. It never invents a new TOMZN
 * measurement: it advances the last saved reading only by the learned daily
 * pattern, marks it offline, and is replaced as soon as the server responds.
 */
export function estimateOfflineDashboard(
  source: CachedDashboardSnapshot,
  savedAt: number,
  now = Date.now(),
): CachedDashboardSnapshot {
  const elapsedDays = clamp((now - savedAt) / DAY_MS, 0, 7);
  const dailyRate = Math.max(0, source.home.averageDaily || 0) * trendMultiplier(source.home);
  const estimatedTomznUnits = dailyRate * elapsedDays;
  const sameDay = pakistanDayStart(savedAt) === pakistanDayStart(now);
  const nowParts = pakistanParts(now);
  const dayFraction = clamp((nowParts.hour * 60 + nowParts.minute) / (24 * 60), 0, 1);
  const todayUsage = sameDay
    ? (source.home.todayUsage || 0) + estimatedTomznUnits
    : dailyRate * dayFraction;
  const activeMeter = source.activeMeter;
  const active = source.meters[activeMeter];
  const meterRatio = clamp(active.calibrationFactor ?? 1, 0.5, 1.5);
  const estimatedMeterUnits = estimatedTomznUnits * meterRatio;
  const baselineReading = active.reading - (active.cycleUsage || 0);
  const activeTodayBase = sameDay ? active.todayUsage || 0 : 0;
  const nextActive: MeterState = {
    ...active,
    reading: round(active.reading + estimatedMeterUnits),
    cycleUsage: round((active.cycleUsage || 0) + estimatedMeterUnits),
    remainingUnits: round(Math.max(0, active.remainingUnits - estimatedMeterUnits)),
    todayUsage: round(activeTodayBase + (sameDay ? estimatedMeterUnits : todayUsage * meterRatio)),
    currentDaily: round(activeTodayBase + (sameDay ? estimatedMeterUnits : todayUsage * meterRatio)),
    lastLoggedReading: active.lastLoggedReading ?? baselineReading,
    explanation: "Offline estimate, based on the last saved TOMZN reading and your recent usage trend.",
  };

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
    live: { ...source.live, gridKw: 0, currentAmp: 0 },
    home: {
      ...source.home,
      todayUsage: round(todayUsage),
      averageDaily: round(dailyRate),
      expectedDrawNow: round(dailyRate / 24, 2),
      dailyUsage: alignedDailyUsage(source.home, now, todayUsage, dailyRate),
      explanation: "Offline estimate based on the last saved reading and historical trend. It will be replaced when Voltix reconnects.",
    },
    meters: { ...source.meters, [activeMeter]: nextActive },
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
  const cycleUsage = Math.max(0, reading - baselineReading);
  const manualLog: ManualLog = { id: `offline-${meterId}-${timestamp}`, meterId, reading, timestamp, notes };
  return {
    ...source,
    meters: {
      ...source.meters,
      [meterId]: {
        ...meter,
        reading: round(reading),
        cycleUsage: round(cycleUsage),
        remainingUnits: round(Math.max(0, meter.targetUnits - cycleUsage)),
        lastLoggedAt: timestamp,
        lastLoggedReading: reading,
        explanation: "Manual reading saved offline. The server will use it to reconcile and learn this meter's ratio after sync.",
      },
    },
    manualLogs: [manualLog, ...source.manualLogs],
    home: { ...source.home, explanation: "Manual reading saved offline. It will sync and improve this meter's forecast on reconnect." },
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
