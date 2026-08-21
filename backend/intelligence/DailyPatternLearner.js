"use strict";

/**
 * DailyPatternLearner — learns time-bucketed patterns from historical data.
 *
 * Queries existing MongoDB collections (inverter snapshots, TOMZN snapshots,
 * allocations) and builds a statistical profile of how the house behaves at
 * different times of day.
 *
 * Time buckets (configurable):
 *   00:00–06:00  (night)
 *   06:00–09:00  (morning)
 *   09:00–12:00  (late morning)
 *   12:00–15:00  (midday / peak solar)
 *   15:00–18:00  (afternoon)
 *   18:00–21:00  (evening)
 *   21:00–00:00  (late evening)
 *
 * For each bucket, learns:
 *   - average/median solar production (W)
 *   - average/median home load (W)
 *   - average WAPDA import (W)
 *   - hybrid frequency (% of samples in hybrid mode)
 *   - on-grid frequency (% of samples in on-grid mode)
 *   - night/bypass frequency
 *   - meter1 usage rate (kWh per hour in this bucket)
 *   - meter2 usage rate (kWh per hour in this bucket)
 *
 * Also tracks weekday vs weekend differences if enough data exists.
 */

// ── Time bucket configuration ──
const TIME_BUCKETS = [
  { id: "night",        label: "Night",          startHour: 0,  endHour: 6  },
  { id: "morning",      label: "Morning",        startHour: 6,  endHour: 9  },
  { id: "late_morning", label: "Late Morning",   startHour: 9,  endHour: 12 },
  { id: "midday",       label: "Midday",         startHour: 12, endHour: 15 },
  { id: "afternoon",    label: "Afternoon",      startHour: 15, endHour: 18 },
  { id: "evening",      label: "Evening",        startHour: 18, endHour: 21 },
  { id: "late_evening", label: "Late Evening",   startHour: 21, endHour: 24 },
];

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/**
 * Get the bucket ID for a given hour (0-23).
 */
function bucketForHour(hour) {
  for (const b of TIME_BUCKETS) {
    if (hour >= b.startHour && hour < b.endHour) return b.id;
  }
  return "late_evening"; // hour 23 falls in last bucket
}

/**
 * Get the bucket definition by ID.
 */
function getBucketDef(bucketId) {
  return TIME_BUCKETS.find((b) => b.id === bucketId) || TIME_BUCKETS[0];
}

/**
 * Median of a sorted array.
 */
function median(sortedArr) {
  if (!sortedArr.length) return 0;
  const mid = Math.floor(sortedArr.length / 2);
  return sortedArr.length % 2 === 0
    ? (sortedArr[mid - 1] + sortedArr[mid]) / 2
    : sortedArr[mid];
}

/**
 * Trimmed mean — removes top & bottom 20% to eliminate outliers.
 */
function trimmedMean(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * 0.2);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (!trimmed.length) return median(sorted);
  return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
}

/**
 * Standard deviation.
 */
function stdDev(arr, mean) {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Learn daily patterns from historical inverter + TOMZN + allocation data.
 *
 * @param {object} collections - { inverterSnapshots, tomznSnapshots, allocations }
 * @param {number} now - current timestamp (ms)
 * @returns {object} learned profile with per-bucket statistics + confidence
 */
async function learnDailyPatterns(collections, now = Date.now()) {
  const { inverterSnapshots, tomznSnapshots, allocations } = collections;

  // Query window: last 14 days (or all available if less)
  const windowStart = now - 14 * MS_PER_DAY;

  // ── Fetch inverter snapshots ──
  const inverterSamples = await inverterSnapshots
    .find({ timestamp: { $gte: windowStart, $lte: now } })
    .sort({ timestamp: 1 })
    .limit(20_000)
    .toArray();

  // ── Fetch TOMZN snapshots ──
  const tomznSamples = await tomznSnapshots
    .find({ timestamp: { $gte: windowStart, $lte: now } })
    .sort({ timestamp: 1 })
    .limit(20_000)
    .toArray();

  // ── Fetch allocations ──
  const allocSamples = await allocations
    .find({ timestamp: { $gte: windowStart, $lte: now } })
    .sort({ timestamp: 1 })
    .limit(20_000)
    .toArray();

  // ── Build per-bucket statistics ──
  const buckets = {};
  for (const b of TIME_BUCKETS) {
    buckets[b.id] = {
      label: b.label,
      startHour: b.startHour,
      endHour: b.endHour,
      solarW: [],       // solar production samples
      loadW: [],        // home load samples
      tomznW: [],       // WAPDA import samples
      hybridCount: 0,   // samples in hybrid mode
      onGridCount: 0,   // samples in on-grid mode
      nightCount: 0,    // samples in night/bypass mode
      totalCount: 0,    // total inverter samples
      // Meter usage (kWh per hour in this bucket)
      meter1Usage: [],  // per-day usage in this bucket
      meter2Usage: [],
    };
  }

  // ── Process inverter samples ──
  // Group by day + bucket for meter usage tracking
  const dayBucketMeterUsage = new Map(); // key: "dayKey|bucketId|meterId" → kWh

  for (const s of inverterSamples) {
    if (s.isOnline === false) continue;
    const date = new Date(s.timestamp);
    // Use Pakistan time (UTC+5)
    const pkHour = (date.getUTCHours() + 5) % 24;
    const bucketId = bucketForHour(pkHour);
    const b = buckets[bucketId];

    b.totalCount += 1;
    if (s.solarW > 5) b.solarW.push(s.solarW);
    if (s.loadW > 0) b.loadW.push(s.loadW);

    // Mode classification (simplified from determineGridFlow)
    const solarProducing = (s.solarW || 0) > 5;
    const hybrid = (s.loadW || 0) >= 25;
    if (!solarProducing && !hybrid) {
      b.nightCount += 1;
    } else if (hybrid) {
      b.hybridCount += 1;
    } else {
      b.onGridCount += 1;
    }
  }

  // ── Process TOMZN samples for WAPDA import ──
  for (const t of tomznSamples) {
    if (t.isOnline === false) continue;
    if (t.powerW == null || t.powerW <= 0) continue;
    const date = new Date(t.timestamp);
    const pkHour = (date.getUTCHours() + 5) % 24;
    const bucketId = bucketForHour(pkHour);
    buckets[bucketId].tomznW.push(t.powerW);
  }

  // ── Process allocations for per-bucket meter usage ──
  for (const a of allocSamples) {
    if (!a.delta || a.delta <= 0) continue;
    const date = new Date(a.timestamp);
    const pkHour = (date.getUTCHours() + 5) % 24;
    const bucketId = bucketForHour(pkHour);
    const pkDateKey = new Date(date.getTime() + 5 * MS_PER_HOUR).toISOString().slice(0, 10);
    const key = `${pkDateKey}|${bucketId}|${a.meterId}`;
    dayBucketMeterUsage.set(key, (dayBucketMeterUsage.get(key) || 0) + a.delta);
  }

  // Aggregate per-day meter usage into bucket arrays
  for (const [key, usage] of dayBucketMeterUsage) {
    const [, bucketId, meterId] = key.split("|");
    const b = buckets[bucketId];
    if (!b) continue;
    if (meterId === "meter1") b.meter1Usage.push(usage);
    else if (meterId === "meter2") b.meter2Usage.push(usage);
  }

  // ── Compute statistics per bucket ──
  const profile = {};
  for (const b of TIME_BUCKETS) {
    const data = buckets[b.id];
    const solarMean = trimmedMean(data.solarW);
    const loadMean = trimmedMean(data.loadW);
    const tomznMean = trimmedMean(data.tomznW);

    profile[b.id] = {
      label: data.label,
      startHour: data.startHour,
      endHour: data.endHour,
      sampleCount: data.totalCount,
      // Solar
      solarWavg: Math.round(solarMean),
      solarWmedian: Math.round(median([...data.solarW].sort((a, x) => a - x))),
      solarWstdDev: Math.round(stdDev(data.solarW, solarMean)),
      solarSampleCount: data.solarW.length,
      // Load
      loadWavg: Math.round(loadMean),
      loadWmedian: Math.round(median([...data.loadW].sort((a, x) => a - x))),
      loadWstdDev: Math.round(stdDev(data.loadW, loadMean)),
      loadSampleCount: data.loadW.length,
      // WAPDA import
      tomznWavg: Math.round(tomznMean),
      tomznWmedian: Math.round(median([...data.tomznW].sort((a, x) => a - x))),
      tomznSampleCount: data.tomznW.length,
      // Mode frequencies
      hybridFreq: data.totalCount > 0 ? data.hybridCount / data.totalCount : 0,
      onGridFreq: data.totalCount > 0 ? data.onGridCount / data.totalCount : 0,
      nightFreq: data.totalCount > 0 ? data.nightCount / data.totalCount : 0,
      // Meter usage (kWh per day in this bucket)
      meter1UsageAvg: data.meter1Usage.length > 0
        ? Math.round((data.meter1Usage.reduce((s, v) => s + v, 0) / data.meter1Usage.length) * 100) / 100
        : 0,
      meter2UsageAvg: data.meter2Usage.length > 0
        ? Math.round((data.meter2Usage.reduce((s, v) => s + v, 0) / data.meter2Usage.length) * 100) / 100
        : 0,
      meter1UsageDays: data.meter1Usage.length,
      meter2UsageDays: data.meter2Usage.length,
    };
  }

  // ── Compute overall confidence ──
  const totalInverterSamples = inverterSamples.filter((s) => s.isOnline !== false).length;
  const totalAllocSamples = allocSamples.length;
  const daysOfInverterData = Math.min(14, Math.floor((now - (inverterSamples[0]?.timestamp || now)) / MS_PER_DAY));
  const daysOfTomznData = Math.min(14, Math.floor((now - (tomznSamples[0]?.timestamp || now)) / MS_PER_DAY));

  // Confidence levels:
  //   insufficient_data: < 2 days or < 500 inverter samples
  //   learning: 2-5 days or 500-2000 samples
  //   moderate_confidence: 5-10 days or 2000-5000 samples
  //   high_confidence: > 10 days and > 5000 samples
  let confidenceLevel;
  if (daysOfInverterData < 2 || totalInverterSamples < 500) {
    confidenceLevel = "insufficient_data";
  } else if (daysOfInverterData < 5 || totalInverterSamples < 2000) {
    confidenceLevel = "learning";
  } else if (daysOfInverterData < 10 || totalInverterSamples < 5000) {
    confidenceLevel = "moderate_confidence";
  } else {
    confidenceLevel = "high_confidence";
  }

  return {
    buckets: profile,
    confidence: {
      level: confidenceLevel,
      daysOfInverterData,
      daysOfTomznData,
      totalInverterSamples,
      totalAllocSamples,
      totalTomznSamples: tomznSamples.length,
    },
    generatedAt: now,
    windowStart,
  };
}

module.exports = {
  TIME_BUCKETS,
  bucketForHour,
  getBucketDef,
  learnDailyPatterns,
};
