import type {
    HistoryPoint,
    ManualLog,
} from "@/context/energy-types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
