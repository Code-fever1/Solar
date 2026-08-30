"use strict";

/**
 * DailyPatternLearner v2 — adaptive household profile.
 *
 * v1 learned one blended 14-day baseline per time bucket. v2 learns:
 *   - weekday vs weekend profiles (the "father comes home on weekends" split)
 *   - per-mode baselines (on_grid / hybrid / bypass / night)
 *   - voltage baselines (solarV, gridV, homeV, tomznV) per bucket + day type
 *   - export behaviour (frequency, avg export W, daily export kWh, peak window)
 *   - 24h hourly curves (usage kWh, solar W, load W) per day type
 *   - 7d-vs-prior-7d usage trend
 *
 * Everything the analyzers (MeterAdvisor, ExportAnalyzer, VoltageAnalyzer,
 * SolarAnomalyDetector, ConsumptionAnalyzer) read lives in one profile so
 * every module adapts to this specific household instead of global defaults.
 */

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
const PK_OFFSET_MS = 5 * MS_PER_HOUR; // Pakistan is UTC+5, no DST

const DAY_TYPES = ["weekday", "weekend"];

function bucketForHour(hour) {
  for (const b of TIME_BUCKETS) {
    if (hour >= b.startHour && hour < b.endHour) return b.id;
  }
  return "late_evening";
}

function getBucketDef(bucketId) {
  return TIME_BUCKETS.find((b) => b.id === bucketId) || TIME_BUCKETS[0];
}

/** Pakistan-local date key "YYYY-MM-DD". */
function pkDateKey(timestamp) {
  return new Date(timestamp + PK_OFFSET_MS).toISOString().slice(0, 10);
}

/** Pakistan-local hour 0-23. */
function pkHourOf(timestamp) {
  return new Date(timestamp + PK_OFFSET_MS).getUTCHours();
}

/** weekday (Mon-Fri) or weekend (Sat-Sun) in Pakistan local time. */
function pakistanDayType(timestamp) {
  const d = new Date(timestamp + PK_OFFSET_MS).getUTCDay();
  return d === 0 || d === 6 ? "weekend" : "weekday";
}

/** Map live gridFlow / inverter mode onto learner keys (on_grid, hybrid, bypass, night). */
function normalizeHouseholdMode(mode) {
  const raw = String(mode || "").toLowerCase().replace(/-/g, "_");
  if (raw === "b" || raw === "battery") return "hybrid";
  if (raw === "l" || raw === "on_grid" || raw === "ongrid") return "on_grid";
  if (raw === "s" || raw === "bypass" || raw === "offline") return "bypass";
  if (raw === "hybrid") return "hybrid";
  if (raw === "night") return "night";
  return raw || "night";
}

function median(sortedArr) {
  if (!sortedArr.length) return 0;
  const mid = Math.floor(sortedArr.length / 2);
  return sortedArr.length % 2 === 0
    ? (sortedArr[mid - 1] + sortedArr[mid]) / 2
    : sortedArr[mid];
}

function trimmedMean(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * 0.2);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (!trimmed.length) return median(sorted);
  return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
}

function stdDev(arr, mean) {
  if (arr.length < 2) return 0;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/** Raw accumulator shared by bucket/day-type/mode stats. */
function freshStats() {
  return {
    solarW: [], loadW: [], tomznW: [], exportW: [],
    solarV: [], gridV: [], homeV: [], tomznV: [],
    hybridCount: 0, onGridCount: 0, bypassCount: 0, nightCount: 0,
    totalCount: 0,
    meter1Usage: [], meter2Usage: [],
  };
}

/** Summarize an accumulator into the profile shape. */
function summarize(stats) {
  const solarMean = trimmedMean(stats.solarW);
  const loadMean = trimmedMean(stats.loadW);
  const tomznMean = trimmedMean(stats.tomznW);
  const exportMean = trimmedMean(stats.exportW);
  const total = stats.totalCount || 1;
  const night = stats.nightCount + stats.bypassCount;
  return {
    sampleCount: stats.totalCount,
    solarWavg: Math.round(solarMean),
    solarWmedian: Math.round(median([...stats.solarW].sort((a, b) => a - b))),
    solarWstdDev: Math.round(stdDev(stats.solarW, solarMean)),
    solarSampleCount: stats.solarW.length,
    loadWavg: Math.round(loadMean),
    loadWmedian: Math.round(median([...stats.loadW].sort((a, b) => a - b))),
    loadWstdDev: Math.round(stdDev(stats.loadW, loadMean)),
    loadSampleCount: stats.loadW.length,
    tomznWavg: Math.round(tomznMean),
    tomznSampleCount: stats.tomznW.length,
    exportFreq: stats.totalCount > 0 ? stats.exportW.length / stats.totalCount : 0,
    exportWavg: Math.round(exportMean),
    exportSampleCount: stats.exportW.length,
    solarVavg: Math.round(trimmedMean(stats.solarV)),
    gridVavg: Math.round(trimmedMean(stats.gridV)),
    homeVavg: Math.round(trimmedMean(stats.homeV)),
    tomznVavg: Math.round(trimmedMean(stats.tomznV)),
    hybridFreq: stats.hybridCount / total,
    onGridFreq: stats.onGridCount / total,
    bypassFreq: stats.bypassCount / total,
    nightFreq: night / total,
    meter1UsageAvg: stats.meter1Usage.length
      ? Math.round((stats.meter1Usage.reduce((s, v) => s + v, 0) / stats.meter1Usage.length) * 100) / 100
      : 0,
    meter2UsageAvg: stats.meter2Usage.length
      ? Math.round((stats.meter2Usage.reduce((s, v) => s + v, 0) / stats.meter2Usage.length) * 100) / 100
      : 0,
    meter1UsageDays: stats.meter1Usage.length,
    meter2UsageDays: stats.meter2Usage.length,
  };
}

/** Classify an inverter sample into a household mode. */
function classifyMode(s) {
  const solar = (s.solarW || 0) > 5;
  const load = (s.loadW || 0) >= 25;
  if ((s.inverterMode || "") === "B") return "hybrid"; // battery assist = hybrid
  if (solar && load) return "hybrid";
  if (solar) return "on_grid";      // solar covers load, grid idle/exporting
  if (load) return "bypass";        // no solar, load fed by grid
  return "night";
}

/** Mean PV voltage from the inverter sample. */
function inverterVoltages(s) {
  const pv = [s.pv1V, s.pv2V].filter((v) => Number.isFinite(v) && v > 0);
  const solarV = pv.length ? pv.reduce((a, b) => a + b, 0) / pv.length : (s.solarV || 0);
  return { solarV, gridV: s.gridV || 0, homeV: s.acOutV || 0 };
}

async function learnDailyPatterns(collections, now = Date.now()) {
  const { inverterSnapshots, tomznSnapshots, allocations } = collections;
  const windowStart = now - 14 * MS_PER_DAY;

  const [inverterSamples, tomznSamples, allocSamples] = await Promise.all([
    inverterSnapshots.find({ timestamp: { $gte: windowStart, $lte: now } }).sort({ timestamp: 1 }).limit(20_000).toArray(),
    tomznSnapshots.find({ timestamp: { $gte: windowStart, $lte: now } }).sort({ timestamp: 1 }).limit(20_000).toArray(),
    allocations.find({ timestamp: { $gte: windowStart, $lte: now } }).sort({ timestamp: 1 }).limit(20_000).toArray(),
  ]);

  // ── Accumulators ──
  const buckets = {};      // bucketId -> freshStats() with byDayType
  const modes = {};        // mode -> freshStats()
  const dayTypeInfo = { weekday: { samples: 0, days: new Set() }, weekend: { samples: 0, days: new Set() } };
  const hourly = {};       // dayType -> { usageSum[24], usageCount[24], solarSum[24], solarCount[24], loadSum[24], loadCount[24] }
  for (const dt of DAY_TYPES) {
    hourly[dt] = {
      usageSum: new Array(24).fill(0), usageCount: new Array(24).fill(0),
      solarSum: new Array(24).fill(0), solarCount: new Array(24).fill(0),
      loadSum: new Array(24).fill(0), loadCount: new Array(24).fill(0),
    };
  }

  for (const b of TIME_BUCKETS) {
    buckets[b.id] = { stats: freshStats(), byDayType: { weekday: freshStats(), weekend: freshStats() } };
  }
  for (const m of ["on_grid", "hybrid", "bypass", "night"]) modes[m] = freshStats();

  const exportPerDay = new Map(); // pkDateKey -> { kwh, dayType }
  const usagePerDay = new Map();  // pkDateKey -> kwh (allocations)
  const dayBucketUsage = new Map(); // dayType|bucket|meterId -> per-day usage list

  // ── Inverter samples: solar/load/voltage/export/mode/hourly ──
  for (let i = 0; i < inverterSamples.length; i++) {
    const s = inverterSamples[i];
    if (s.isOnline === false) continue;
    const ts = s.timestamp;
    const dt = pakistanDayType(ts);
    const hour = pkHourOf(ts);
    const bucketId = bucketForHour(hour);
    const dateKey = pkDateKey(ts);

    const b = buckets[bucketId];
    const stats = b.stats;
    const dtStats = b.byDayType[dt];
    const mode = classifyMode(s);

    // Counts
    stats.totalCount += 1; dtStats.totalCount += 1; modes[mode].totalCount += 1;
    dayTypeInfo[dt].samples += 1; dayTypeInfo[dt].days.add(dateKey);

    // Mode counters (aggregate + day-type)
    if (mode === "hybrid") { stats.hybridCount += 1; dtStats.hybridCount += 1; }
    else if (mode === "on_grid") { stats.onGridCount += 1; dtStats.onGridCount += 1; }
    else if (mode === "bypass") { stats.bypassCount += 1; dtStats.bypassCount += 1; }
    else { stats.nightCount += 1; dtStats.nightCount += 1; }

    // Power samples
    if (s.solarW > 5) { stats.solarW.push(s.solarW); dtStats.solarW.push(s.solarW); modes[mode].solarW.push(s.solarW); }
    if (s.loadW > 0) { stats.loadW.push(s.loadW); dtStats.loadW.push(s.loadW); modes[mode].loadW.push(s.loadW); }

    // Voltages
    const v = inverterVoltages(s);
    if (v.solarV > 0) { stats.solarV.push(v.solarV); dtStats.solarV.push(v.solarV); modes[mode].solarV.push(v.solarV); }
    if (v.gridV > 0) { stats.gridV.push(v.gridV); dtStats.gridV.push(v.gridV); modes[mode].gridV.push(v.gridV); }
    if (v.homeV > 0) { stats.homeV.push(v.homeV); dtStats.homeV.push(v.homeV); modes[mode].homeV.push(v.homeV); }

    // Export: gridW < 0 means feeding back. Integrate kWh using sample spacing.
    const gridW = s.gridW != null ? s.gridW : (s.gridWRaw || 0);
    if (gridW < -10) {
      const next = inverterSamples[i + 1];
      const endTs = next && next.timestamp > ts ? next.timestamp : ts + 60_000;
      const kwh = (Math.abs(gridW) * (endTs - ts)) / 3_600_000 / 1000;
      stats.exportW.push(Math.abs(gridW));
      dtStats.exportW.push(Math.abs(gridW));
      modes[mode].exportW.push(Math.abs(gridW));
      const day = exportPerDay.get(dateKey) || { kwh: 0, dayType: dt };
      day.kwh += kwh;
      exportPerDay.set(dateKey, day);
    }

    // Hourly solar/load
    hourly[dt].solarSum[hour] += s.solarW || 0; hourly[dt].solarCount[hour] += 1;
    hourly[dt].loadSum[hour] += s.loadW || 0; hourly[dt].loadCount[hour] += 1;
  }

  // ── TOMZN samples: grid import W + grid voltage ──
  for (const t of tomznSamples) {
    if (t.isOnline === false) continue;
    const ts = t.timestamp;
    const dt = pakistanDayType(ts);
    const bucketId = bucketForHour(pkHourOf(ts));
    if (t.powerW != null && t.powerW > 0) {
      buckets[bucketId].stats.tomznW.push(t.powerW);
      buckets[bucketId].byDayType[dt].tomznW.push(t.powerW);
    }
    if (t.voltageV != null && t.voltageV > 0) {
      buckets[bucketId].stats.tomznV.push(t.voltageV);
      buckets[bucketId].byDayType[dt].tomznV.push(t.voltageV);
    }
  }

  // ── Allocations: usage per day/bucket/hour/meter ──
  for (const a of allocSamples) {
    if (!a.delta || a.delta <= 0) continue;
    const ts = a.timestamp;
    const dt = pakistanDayType(ts);
    const hour = pkHourOf(ts);
    const bucketId = bucketForHour(hour);
    const dateKey = pkDateKey(ts);

    usagePerDay.set(dateKey, (usagePerDay.get(dateKey) || 0) + a.delta);
    hourly[dt].usageSum[hour] += a.delta; hourly[dt].usageCount[hour] += 1;

    const key = `${dt}|${bucketId}|${a.meterId}`;
    const list = dayBucketUsage.get(key) || [];
    list.push(a.delta);
    dayBucketUsage.set(key, list);
  }

  for (const [key, list] of dayBucketUsage) {
    const [dt, bucketId, meterId] = key.split("|");
    const target = buckets[bucketId].byDayType[dt];
    if (meterId === "meter1") target.meter1Usage.push(list.reduce((s, v) => s + v, 0));
    else if (meterId === "meter2") target.meter2Usage.push(list.reduce((s, v) => s + v, 0));
  }

  // ── Build the profile ──
  const profile = {};
  for (const b of TIME_BUCKETS) {
    profile[b.id] = {
      label: b.label,
      startHour: b.startHour,
      endHour: b.endHour,
      ...summarize(buckets[b.id].stats),
      byDayType: {
        weekday: summarize(buckets[b.id].byDayType.weekday),
        weekend: summarize(buckets[b.id].byDayType.weekend),
      },
    };
  }

  // Per-mode baselines (whole day, mode-aware expectations)
  const modeProfile = {};
  for (const [m, st] of Object.entries(modes)) modeProfile[m] = summarize(st);

  // Hourly curves
  const hourlyProfile = {};
  for (const dt of DAY_TYPES) {
    const h = hourly[dt];
    const toAvg = (sum, count) => {
      const arr = new Array(24).fill(0);
      for (let i = 0; i < 24; i++) arr[i] = count[i] ? Math.round((sum[i] / count[i]) * 100) / 100 : 0;
      return arr;
    };
    hourlyProfile[dt] = {
      usageKwh: toAvg(h.usageSum, h.usageCount),
      solarW: toAvg(h.solarSum, h.solarCount),
      loadW: toAvg(h.loadSum, h.loadCount),
    };
  }

  // Export profile per day type
  const exportProfile = { weekday: { days: 0, exportDays: 0, totalKwh: 0 }, weekend: { days: 0, exportDays: 0, totalKwh: 0 } };
  for (const [dateKey, { kwh, dayType }] of exportPerDay) {
    const e = exportProfile[dayType];
    e.days += 1;
    e.totalKwh += kwh;
    if (kwh > 0.3) e.exportDays += 1;
  }
  for (const dt of DAY_TYPES) {
    const e = exportProfile[dt];
    e.avgExportKwhPerDay = e.days ? Math.round((e.totalKwh / e.days) * 100) / 100 : 0;
    e.exportDayFreq = e.days ? Math.round((e.exportDays / e.days) * 100) / 100 : 0;
    // Peak export window = bucket with most export samples on this day type
    let peak = null;
    for (const b of TIME_BUCKETS) {
      const st = buckets[b.id].byDayType[dt];
      if (!st.exportW.length) continue;
      if (!peak || st.exportW.length > peak.samples) peak = { bucketId: b.id, samples: st.exportW.length, avgW: Math.round(trimmedMean(st.exportW)) };
    }
    e.peakWindow = peak ? { bucketId: peak.bucketId, avgExportW: peak.avgW } : null;
  }

  // Usage trend: last 7 full days vs prior 7
  const todayKey = pkDateKey(now);
  const dayUsages = [...usagePerDay.entries()]
    .filter(([d]) => d !== todayKey)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, u]) => u);
  const recent = dayUsages.slice(-7);
  const prior = dayUsages.slice(-14, -7);
  const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const recentAvg = avg(recent);
  const priorAvg = avg(prior);
  const trend = {
    usageLast7d: Math.round(recentAvg * 100) / 100,
    usagePrior7d: Math.round(priorAvg * 100) / 100,
    usageTrendPct: priorAvg > 0.2 ? Math.round(((recentAvg - priorAvg) / priorAvg) * 100) : 0,
    days: recent.length,
  };

  // ── Confidence ──
  const totalInverterSamples = inverterSamples.filter((s) => s.isOnline !== false).length;
  const totalAllocSamples = allocSamples.length;
  const daysOfInverterData = Math.min(14, Math.floor((now - (inverterSamples[0]?.timestamp || now)) / MS_PER_DAY));
  const daysOfTomznData = Math.min(14, Math.floor((now - (tomznSamples[0]?.timestamp || now)) / MS_PER_DAY));

  let confidenceLevel;
  if (daysOfInverterData < 2 || totalInverterSamples < 500) confidenceLevel = "insufficient_data";
  else if (daysOfInverterData < 5 || totalInverterSamples < 2000) confidenceLevel = "learning";
  else if (daysOfInverterData < 10 || totalInverterSamples < 5000) confidenceLevel = "moderate_confidence";
  else confidenceLevel = "high_confidence";

  const byDayType = {};
  for (const dt of DAY_TYPES) {
    const info = dayTypeInfo[dt];
    const confident = dt === "weekday"
      ? info.samples >= 800 && info.days.size >= 3
      : info.samples >= 300 && info.days.size >= 2;
    byDayType[dt] = { confident, samples: info.samples, days: info.days.size };
  }
  // If the CURRENT day type is under-learned, cap overall confidence.
  const nowDt = pakistanDayType(now);
  if (!byDayType[nowDt].confident && confidenceLevel === "high_confidence") confidenceLevel = "moderate_confidence";
  if (!byDayType[nowDt].confident && confidenceLevel === "moderate_confidence" && byDayType[nowDt].days < 1) confidenceLevel = "learning";

  return {
    buckets: profile,
    modes: modeProfile,
    hourly: hourlyProfile,
    export: exportProfile,
    trend,
    confidence: {
      level: confidenceLevel,
      daysOfInverterData,
      daysOfTomznData,
      totalInverterSamples,
      totalAllocSamples,
      totalTomznSamples: tomznSamples.length,
      byDayType,
    },
    generatedAt: now,
    windowStart,
  };
}

module.exports = {
  TIME_BUCKETS,
  DAY_TYPES,
  bucketForHour,
  getBucketDef,
  pakistanDayType,
  classifyMode,
  normalizeHouseholdMode,
  learnDailyPatterns,
};
