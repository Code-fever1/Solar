import type {
    AlertItem,
    HistoryPoint,
    LiveTelemetry,
    ManualLog,
    MeterId,
    MeterState,
    Recommendation,
} from "@/context/energy-types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatNumber(value: number, digits = 1) {
  return value.toFixed(digits);
}

export function formatTimeLabel(time: Date) {
  return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function getStartOfBillingCycle(nowTs: number) {
  const d = new Date(nowTs);
  let year = d.getFullYear();
  let month = d.getMonth();
  
  if (d.getDate() < 28 || (d.getDate() === 28 && d.getHours() < 17)) {
      month -= 1;
      if (month < 0) {
          month = 11;
          year -= 1;
      }
  }
  return new Date(year, month, 28, 17, 0, 0, 0).getTime();
}

export function calibrateMeterReading(
  meter: MeterState,
  manualReading: number,
) {
  const drift = manualReading - meter.reading;
  const averageError = meter.averageError * 0.7 + Math.abs(drift) * 0.3;

  return {
    driftOffset: meter.driftOffset + drift * 0.5,
    averageError,
    reading: manualReading,
  };
}

export function getReadingAt(
  logs: ManualLog[],
  targetTimestamp: number,
): number | null {
  if (!logs || logs.length === 0) return null;
  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);

  if (targetTimestamp <= sorted[0].timestamp) {
    return sorted[0].reading;
  }
  if (targetTimestamp >= sorted[sorted.length - 1].timestamp) {
    return sorted[sorted.length - 1].reading;
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const prev = sorted[i];
    const next = sorted[i + 1];
    if (
      targetTimestamp >= prev.timestamp &&
      targetTimestamp <= next.timestamp
    ) {
      const timeDiff = next.timestamp - prev.timestamp;
      if (timeDiff === 0) return prev.reading;
      const valDiff = next.reading - prev.reading;
      const t = (targetTimestamp - prev.timestamp) / timeDiff;
      return prev.reading + valDiff * t;
    }
  }
  return sorted[sorted.length - 1].reading;
}

export function calculateRates(logs: ManualLog[]) {
  if (!logs || logs.length === 0) {
    return {
      currentReading: 0,
      todayUsage: 0,
      averageDaily: 0,
      projectedMonthly: 0,
      lastLoggedAt: undefined,
    };
  }

  const sorted = [...logs].sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted[sorted.length - 1];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const midnightReading = getReadingAt(sorted, startOfToday.getTime());
  const todayUsage =
    midnightReading !== null
      ? Math.max(0, latest.reading - midnightReading)
      : 0;

  let averageDaily = 0;
  if (sorted.length >= 2) {
    const oldest = sorted[0];
    const totalUsage = latest.reading - oldest.reading;
    const totalTimeHours =
      (latest.timestamp - oldest.timestamp) / (1000 * 60 * 60);
    if (totalTimeHours > 0) {
      const hourlyRate = totalUsage / totalTimeHours;
      averageDaily = hourlyRate * 24;
    }
  }

  const projectedMonthly = averageDaily * 30;

  return {
    currentReading: latest.reading,
    todayUsage,
    averageDaily,
    projectedMonthly,
    lastLoggedAt: latest.timestamp,
  };
}

export function interpolateUsageHistory(
  allLogs: ManualLog[],
  period: "day" | "week" | "month" | "year",
): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  const now = Date.now();

  const meter1Logs = allLogs.filter((l) => l.meterId === "meter1");
  const meter2Logs = allLogs.filter((l) => l.meterId === "meter2");

  const getReadingForMeterAt = (meterLogs: ManualLog[], timestamp: number) => {
    return getReadingAt(meterLogs, timestamp) || 0;
  };

  let intervalMs = 2 * 60 * 60 * 1000;
  let durationHours = 2;
  let count = 12;

  if (period === "week") {
    intervalMs = 24 * 60 * 60 * 1000;
    durationHours = 24;
    count = 7;
  } else if (period === "month") {
    intervalMs = 2 * 24 * 60 * 60 * 1000;
    durationHours = 48;
    count = 15;
  } else if (period === "year") {
    intervalMs = 30 * 24 * 60 * 60 * 1000;
    durationHours = 720;
    count = 12;
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  for (let i = count - 1; i >= 0; i--) {
    const tEnd = now - i * intervalMs;
    const tStart = tEnd - intervalMs;

    const m1Diff = Math.max(
      0,
      getReadingForMeterAt(meter1Logs, tEnd) -
        getReadingForMeterAt(meter1Logs, tStart),
    );
    const m2Diff = Math.max(
      0,
      getReadingForMeterAt(meter2Logs, tEnd) -
        getReadingForMeterAt(meter2Logs, tStart),
    );

    const m1Rate = m1Diff / durationHours;
    const m2Rate = m2Diff / durationHours;

    let timeLabel = "";
    const dateLabel = new Date(tEnd);

    if (period === "day") {
      timeLabel = dateLabel.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } else if (period === "week") {
      timeLabel = dayNames[dateLabel.getDay()];
    } else if (period === "month") {
      timeLabel = `${dateLabel.getDate()}/${dateLabel.getMonth() + 1}`;
    } else {
      timeLabel = monthNames[dateLabel.getMonth()];
    }

    points.push({
      time: timeLabel,
      meter1: Number(m1Rate.toFixed(2)),
      meter2: Number(m2Rate.toFixed(2)),
      voltage: 220 + Math.round((Math.random() - 0.5) * 8),
    });
  }

  return points;
}

export function summarizeHistory(history: HistoryPoint[]) {
  const points = history.slice(-Math.min(history.length, 96));
  const m1 = points.reduce((total, point) => total + point.meter1, 0);
  const m2 = points.reduce((total, point) => total + point.meter2, 0);

  return {
    bestDay: m1 > m2 ? "Meter 2 Low Import" : "Meter 1 Low Import",
    worstDay: m1 + m2 > 6.0 ? "High draw profile" : "Standard draw profile",
    totalSavings: 0,
    solar: 0,
    grid: m1 + m2,
    load: m1 + m2,
  };
}

export function buildRecommendations(
  live: LiveTelemetry,
  activeMeter: MeterId,
): Recommendation[] {
  const items: Recommendation[] = [];

  if (live.gridKw > 2.2) {
    items.push({
      id: "high-import",
      title: "Current WAPDA draw is high",
      description: `Active source is ${activeMeter === "meter1" ? "Meter 1 (Analog)" : "Meter 2 (Digital)"}. Verify if major loads can be scheduled.`,
      action: "Check heavy appliances",
      priority: "high",
      trend: "down",
    });
  }

  if (live.voltage < 202 || live.voltage > 238) {
    items.push({
      id: "voltage-drift",
      title: "Voltage drift detected",
      description:
        "Verifying with active active meter input feeds. Protection relays status normal.",
      action: "Inspect stabilizer",
      priority: "medium",
      trend: "down",
    });
  }

  if (!items.length) {
    items.push({
      id: "steady-state",
      title: "Supply lines stable",
      description: "Voltage ranges are within active safe tolerances.",
      action: "Monitor changeover",
      priority: "low",
      trend: "flat",
    });
  }

  return items;
}

export function buildAlerts(live: LiveTelemetry): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (live.voltage > 242) {
    alerts.push({
      id: "over-voltage",
      title: "Supply Voltage High",
      description: `Incoming utility supply touched ${formatNumber(live.voltage, 0)}V.`,
      severity: "critical",
      source: "TOMZN",
      createdAt: new Date(),
    });
  }

  if (live.voltage < 198) {
    alerts.push({
      id: "under-voltage",
      title: "Supply Voltage Low",
      description: `Incoming utility supply dipped to ${formatNumber(live.voltage, 0)}V.`,
      severity: "warning",
      source: "TOMZN",
      createdAt: new Date(),
    });
  }

  return alerts;
}

export function slugifyMeter(meterId: MeterId) {
  return meterId === "meter1" ? "Meter 1" : "Meter 2";
}
