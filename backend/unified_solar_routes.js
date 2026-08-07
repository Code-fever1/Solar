"use strict";

/**
 * The solar dashboard has one source of truth: TOMZN's cumulative kWh reading.
 * Every positive delta is written once to the allocation ledger and assigned to
 * the meter that was active at that moment. Manual meter readings never replace
 * TOMZN usage; they reconcile the displayed physical-meter reading from then on.
 */

const http = require("http");
const https = require("https");

const PRIMARY_STATE_ID = "primary";
const METER_IDS = new Set(["meter1", "meter2"]);
const PAKISTAN_OFFSET = "+05:00";
const INVERTERZONE_HOST = "inverterzone.com";
const INVERTER_POLL_MAX_AGE_MS = 5_000;
// Live cache is refreshed at most every 5s so the dashboard stays responsive
// without hitting Tuya on every frontend poll.
const TOMZN_LIVE_MAX_AGE_MS = 5_000;
// Snapshots are persisted to the database at most once per minute to avoid
// excessive storage growth (previously every ~5-10s).
const TOMZN_PERSIST_MIN_INTERVAL_MS = 60_000;
const WEATHER_POLL_MAX_AGE_MS = 30 * 60_000;
const BHAKKAR_COORDINATES = { latitude: 31.6269, longitude: 71.0657 };
const HOME_PUBLIC_IP = "113.203.197.44";

// Check if the home router is alive via TCP connect to port 7547 (TR-069/CWMP
// management port, which is open on the router). ICMP ping is blocked from the
// Azure VM, and ports 80/443/22 are filtered, but 7547 responds. If the TCP
// connection succeeds or gets ECONNREFUSED (host up, port closed), the router
// is powered → UPS backup is working. Timeout = power loss.
const HOME_PING_PORT = 7547;
function pingHome() {
  return new Promise((resolve) => {
    const net = require("net");
    const socket = new net.Socket();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(3000);
    socket.once("connect", () => done(true));
    socket.once("error", (err) => {
      // ECONNREFUSED means the host is up (it actively rejected the port) — UPS is working
      if (err.code === "ECONNREFUSED") done(true);
      else done(false);
    });
    socket.once("timeout", () => done(false));
    socket.connect(HOME_PING_PORT, HOME_PUBLIC_IP);
  });
}

const DEFAULT_METERS = {
  meter1: { label: "Meter 1 (Analog)", type: "ANALOG", cycleBaselineReading: 59546, tomznToMeterRatio: 1, calibrationTomznUnits: 0, calibrationMeterUnits: 0, ratioObservationCount: 0 },
  meter2: { label: "Meter 2 (Digital)", type: "DIGITAL", cycleBaselineReading: 15060, tomznToMeterRatio: 1, calibrationTomznUnits: 0, calibrationMeterUnits: 0, ratioObservationCount: 0 },
};

function finiteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

// Parse inverter realTime format "DD-MM-YYYY HH:mm" → epoch ms.
// Returns null if the string can't be parsed.
function parseInverterRealTime(str) {
  const match = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/.exec(str);
  if (!match) return null;
  const [, dd, mm, yyyy, hh, min] = match;
  // InverterZone returns local Pakistan time without timezone info.
  // Treat as Asia/Karachi (UTC+5) and convert to epoch ms.
  const utcMs = Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min, 0) - 5 * 60 * 60 * 1000;
  return utcMs;
}

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let raw = "";
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`Remote request failed with ${response.statusCode}`));
        }
        try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
      });
    });
    request.setTimeout(12_000, () => request.destroy(new Error("Remote request timed out")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function requestInverterZone() {
  const deviceId = process.env.INVERTERZONE_DEVICE_ID;
  if (!deviceId) return null;
  const body = new URLSearchParams({ deviceId }).toString();
  const response = await requestJson({
    hostname: INVERTERZONE_HOST,
    path: "/api/getRealtimeData",
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Content-Length": Buffer.byteLength(body),
      Origin: `https://${INVERTERZONE_HOST}`,
      Referer: `https://${INVERTERZONE_HOST}/device/${encodeURIComponent(deviceId)}`,
    },
  }, body);
  const data = response?.dataDTO;
  // Device is offline or InverterZone has no realtime data for it — return an
  // offline snapshot so the dashboard's "last fetched" keeps updating and the
  // user can see we're still polling. Don't throw; throwing causes pollInverter
  // to return stale data and "last fetched" never updates.
  if (!data || data.deviceId !== deviceId) {
    return makeOfflineInverterSnapshot();
  }
  // Staleness check: if the inverter's realTime is more than 3 minutes behind
  // the server time, the inverter is not communicating properly — mark offline.
  // realTime format: "DD-MM-YYYY HH:mm" (e.g. "06-08-2026 01:30")
  // Threshold is 3 minutes because the inverter hardware updates its realTime
  // via InverterZone's cloud API every 1-2 minutes; a 1-minute threshold caused
  // false "offline" flickering during normal polling gaps.
  const sourceTimeStr = typeof data.realTime === "string" ? data.realTime : null;
  if (sourceTimeStr) {
    const parsed = parseInverterRealTime(sourceTimeStr);
    if (parsed !== null && Date.now() - parsed > 3 * 60 * 1000) {
      return makeOfflineInverterSnapshot();
    }
  }
  const timestamp = Date.now();
  const gridV = Math.max(0, finiteNumber(data.gridV, 0));
  // When gridV is 0, the grid relay is open (standby/disconnected).
  // The InverterZone API may still report a small gridW value (leakage/artifact);
  // force it to 0 so the graph doesn't show phantom grid import during solar-only mode.
  // Also zero out readings < 200W that appear even when gridV is non-zero but relay is off
  // (the inverter reports tiny phantom grid feed during high solar production).
  const rawGridW = Math.max(0, finiteNumber(data.gridW, 0));
  const gridW = (gridV > 0 && rawGridW >= 200) ? rawGridW : 0;
  return {
    timestamp,
    isOnline: true,
    solarW: Math.max(0, finiteNumber(data.solarW, 0)),
    solarV: Math.max(0, finiteNumber(data.solarV, 0)),
    solarA: Math.max(0, finiteNumber(data.solarA, 0)),
    gridW,
    gridV,
    gridHz: Math.max(0, finiteNumber(data.gridHz, 0)),
    gridConnected: Boolean(data.grid),
    gridDirection: finiteNumber(data.gridFeed, 0) > 0 ? "export" : "import",
    loadW: Math.max(0, finiteNumber(data.acOutW, 0)),
    loadVa: Math.max(0, finiteNumber(data.acOutVa, 0)),
    loadPercent: Math.max(0, finiteNumber(data.acOutPercent, 0)),
    acOutV: Math.max(0, finiteNumber(data.acOutV, 0)),
    acOutHz: Math.max(0, finiteNumber(data.acOutHz, 0)),
    inverterMode: typeof data.iv_mode === "string" ? data.iv_mode : "unknown",
    inverterFault: typeof data.fault === "string" ? data.fault : "UNKNOWN",
    temperatureC: finiteNumber(data.heatSinkDegC, 0),
    ratedOutputW: Math.max(0, finiteNumber(data.acOutRatingW, 0)),
    signal: finiteNumber(data.signal),
    sourceTime: typeof data.realTime === "string" ? data.realTime : null,
  };
}

// Offline snapshot — stored when InverterZone reports the device as offline or
// when the API request fails (network error, timeout). Keeps "last fetched"
// updating so the user can see polling is still active.
function makeOfflineInverterSnapshot() {
  return {
    timestamp: Date.now(),
    isOnline: false,
    solarW: 0,
    solarV: 0,
    solarA: 0,
    gridW: 0,
    gridV: 0,
    gridHz: 0,
    gridConnected: false,
    gridDirection: "import",
    loadW: 0,
    loadVa: 0,
    loadPercent: 0,
    acOutV: 0,
    acOutHz: 0,
    inverterMode: "offline",
    inverterFault: "OFFLINE",
    temperatureC: 0,
    ratedOutputW: 0,
    signal: null,
    sourceTime: null,
  };
}

async function requestWeather() {
  const query = new URLSearchParams({
    latitude: String(BHAKKAR_COORDINATES.latitude),
    longitude: String(BHAKKAR_COORDINATES.longitude),
    current: "weather_code,is_day,cloud_cover,precipitation,temperature_2m",
    daily: "sunrise,sunset",
    timezone: "Asia/Karachi",
  }).toString();
  const response = await requestJson({ hostname: "api.open-meteo.com", path: `/v1/forecast?${query}`, method: "GET" });
  const current = response?.current;
  if (!current) throw new Error("Weather provider returned no current conditions");
  const daily = response?.daily;
  return {
    timestamp: Date.now(),
    code: finiteNumber(current.weather_code, 0),
    isDay: Boolean(current.is_day),
    cloudCover: Math.max(0, finiteNumber(current.cloud_cover, 0)),
    precipitation: Math.max(0, finiteNumber(current.precipitation, 0)),
    temperatureC: finiteNumber(current.temperature_2m, 0),
    sunrise: daily?.sunrise?.[0] || null,
    sunset: daily?.sunset?.[0] || null,
  };
}

function integrateWatts(samples, property) {
  let wattHours = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const elapsedHours = Math.min(5 * 60_000, Math.max(0, current.timestamp - previous.timestamp)) / 3_600_000;
    wattHours += ((finiteNumber(previous[property], 0) + finiteNumber(current[property], 0)) / 2) * elapsedHours;
  }
  return round(wattHours / 1000, 2);
}

function round(value, decimals = 3) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// TOMZN measures the home's real consumption. Physical utility meters can run
// slightly slower or faster, so each meter learns its own conversion factor
// from confirmed manual readings. Bounds reject a mistyped reading without
// allowing it to poison future forecasts.
function meterRatio(meter) {
  return clamp(finiteNumber(meter?.tomznToMeterRatio, 1), 0.5, 1.5);
}

function calibratedUnits(meter, tomznUnits) {
  return round(Math.max(0, tomznUnits || 0) * meterRatio(meter));
}

function ensureMeterCalibration(meter) {
  const priorRatio = meterRatio(meter);
  let changed = false;
  const defaults = {
    tomznToMeterRatio: priorRatio,
    calibrationTomznUnits: 0,
    calibrationMeterUnits: 0,
    ratioObservationCount: 0,
  };
  for (const [key, fallback] of Object.entries(defaults)) {
    if (!Number.isFinite(Number(meter[key]))) {
      meter[key] = fallback;
      changed = true;
    }
  }
  return changed;
}

function learnMeterRatio(meter, tomznUnits, actualMeterUnits, timestamp = Date.now()) {
  const usableTomznUnits = finiteNumber(tomznUnits, 0);
  const usableMeterUnits = finiteNumber(actualMeterUnits, -1);
  if (usableTomznUnits < 0.2 || usableMeterUnits < 0) return null;

  const sampleRatio = usableMeterUnits / usableTomznUnits;
  // A real ratio outside this band is extraordinarily unlikely. The manual
  // reading is still accepted as an anchor, only learning is skipped.
  if (sampleRatio < 0.5 || sampleRatio > 1.5) return null;

  const priorEvidence = clamp(finiteNumber(meter.calibrationTomznUnits, 0), 0, 100);
  const priorRatio = meterRatio(meter);
  const sampleWeight = Math.min(usableTomznUnits, 25);
  const nextEvidence = Math.min(100, priorEvidence + sampleWeight);
  const nextRatio = (priorRatio * priorEvidence + sampleRatio * sampleWeight) / Math.max(0.001, priorEvidence + sampleWeight);

  meter.tomznToMeterRatio = round(clamp(nextRatio, 0.5, 1.5), 4);
  meter.calibrationTomznUnits = round(nextEvidence, 2);
  meter.calibrationMeterUnits = round((finiteNumber(meter.calibrationMeterUnits, 0) * (priorEvidence / Math.max(0.001, priorEvidence + sampleWeight))) + (usableMeterUnits * (sampleWeight / Math.max(0.001, priorEvidence + sampleWeight))), 2);
  meter.ratioObservationCount = Math.max(0, Math.floor(finiteNumber(meter.ratioObservationCount, 0))) + 1;
  meter.lastCalibrationAt = timestamp;
  return { sampleRatio: round(sampleRatio, 4), ratio: meter.tomznToMeterRatio, confidence: Math.round(Math.min(95, 25 + nextEvidence * 0.7)) };
}

function clientActionTimestamp(value, now = Date.now()) {
  const requested = finiteNumber(value);
  // Offline actions may be delivered later, but never allow a future timestamp
  // to rewrite billing history or cause negative queries.
  if (requested != null && requested >= now - 30 * 86_400_000) {
    return Math.round(Math.min(requested, now));
  }
  return now;
}

function pakistanParts(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(byType.year), month: Number(byType.month), day: Number(byType.day) };
}

function pakistanTimestamp(year, month, day, hour = 0) {
  return Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00${PAKISTAN_OFFSET}`);
}

function billingCycleStart(timestamp = Date.now(), billingDay = 28) {
  const parts = pakistanParts(timestamp);
  let { year, month } = parts;
  if (parts.day < billingDay) {
    month -= 1;
    if (month === 0) { month = 12; year -= 1; }
  }
  return pakistanTimestamp(year, month, billingDay, 12);
}

function nextBillingCycleStart(timestamp = Date.now(), billingDay = 28) {
  const start = billingCycleStart(timestamp, billingDay);
  const parts = pakistanParts(start);
  let month = parts.month + 1;
  let year = parts.year;
  if (month === 13) { month = 1; year += 1; }
  return pakistanTimestamp(year, month, billingDay, 12);
}

function startOfPakistanDay(timestamp = Date.now()) {
  const parts = pakistanParts(timestamp);
  return pakistanTimestamp(parts.year, parts.month, parts.day);
}

function pakistanDateKey(timestamp) {
  const { year, month, day } = pakistanParts(timestamp);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function pakistanDayLabel(timestamp) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", weekday: "short" }).format(new Date(timestamp));
}

function pakistanHour(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Karachi", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date(timestamp));
  return Number(parts.find((part) => part.type === "hour")?.value || 0);
}

function makeDefaultState(now = Date.now()) {
  const cycleStart = billingCycleStart(now);
  return {
    _id: PRIMARY_STATE_ID,
    version: 1,
    activeMeter: "meter1",
    slabTargetUnits: 200,
    billingDay: 28,
    meters: {
      meter1: { ...DEFAULT_METERS.meter1, cycleBaselineAt: cycleStart, anchorReading: DEFAULT_METERS.meter1.cycleBaselineReading, anchorAt: cycleStart },
      meter2: { ...DEFAULT_METERS.meter2, cycleBaselineAt: cycleStart, anchorReading: DEFAULT_METERS.meter2.cycleBaselineReading, anchorAt: cycleStart },
    },
    lastChangeoverAt: now,
    lastTomzn: null,
    updatedAt: now,
  };
}

function requestTomzn() {
  return new Promise((resolve, reject) => {
    const request = http.get("http://127.0.0.1:3001/api/tuya/device", { timeout: 12_000 }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          const data = JSON.parse(body);
          const dps = Array.isArray(data.dps) ? data.dps : [];
          const find = (code) => dps.find((dp) => dp.code === code);
          const energy = find("forward_energy_total") || find("total_forward_energy");
          if (!data.configured || !energy) return reject(new Error("TOMZN total-energy datapoint is unavailable"));
          resolve({
            energyKwh: finiteNumber(energy.displayValue),
            voltageV: finiteNumber(find("voltage")?.displayValue, 0),
            currentA: finiteNumber(find("current")?.displayValue, 0),
            powerW: finiteNumber(find("power")?.value, 0),
            frequencyHz: finiteNumber(find("supply_frequency")?.displayValue, 50),
            isOnline: find("online_state")?.displayValue === "online",
            switchOn: find("switch")?.value === true,
            faultCode: finiteNumber(find("fault")?.value, 0),
            fetchedAt: data.fetchedAt || new Date().toISOString(),
          });
        } catch (error) { reject(error); }
      });
    });
    request.on("timeout", () => request.destroy(new Error("TOMZN request timed out")));
    request.on("error", reject);
  });
}

function publicTomzn(snapshot) {
  if (!snapshot) {
    return { energyKwh: 0, voltageV: 0, currentA: 0, powerW: 0, powerDisplay: "-- W", frequencyHz: 50, isOnline: false, switchOn: false, faultCode: 0, fetchedAt: "", isLive: false };
  }
  const { _id, ...live } = snapshot;
  return {
    ...live,
    powerDisplay: snapshot.powerW >= 1000 ? `${(snapshot.powerW / 1000).toFixed(2)} kW` : `${snapshot.powerW || 0} W`,
    isLive: Date.now() - snapshot.timestamp < 10 * 60 * 1000,
  };
}

async function ensureState(stateCollection) {
  let state = await stateCollection.findOne({ _id: PRIMARY_STATE_ID });
  if (!state) {
    state = makeDefaultState();
    await stateCollection.insertOne(state);
  } else {
    let changed = false;
    for (const meterId of METER_IDS) {
      changed = ensureMeterCalibration(state.meters[meterId]) || changed;
    }
    if (changed) await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, state);
  }
  return state;
}

async function recordTomzn({ stateCollection, snapshots, allocations, snapshot }) {
  const now = Date.now();
  let state = await ensureState(stateCollection);
  state = await rolloverBillingCycle({ stateCollection, allocations }, state, now);
  const energyKwh = finiteNumber(snapshot.energyKwh);
  if (energyKwh == null || energyKwh < 0) throw new Error("TOMZN returned an invalid cumulative energy value");

  const previous = state.lastTomzn;
  const record = { ...snapshot, timestamp: now, energyKwh, activeMeter: state.activeMeter };
  await snapshots.insertOne(record);

  let allocatedDelta = 0;
  if (previous && energyKwh >= previous.energyKwh) {
    const delta = round(energyKwh - previous.energyKwh);
    // Deltas larger than 50 units in one poll are a counter replacement/reset issue,
    // not household consumption. Keep the snapshot but wait for a manual reconciliation.
    if (delta > 0 && delta <= 50) {
      allocatedDelta = delta;
      await allocations.insertOne({
        timestamp: now,
        fromTimestamp: previous.timestamp,
        meterId: state.activeMeter,
        delta,
        startEnergyKwh: previous.energyKwh,
        endEnergyKwh: energyKwh,
        source: "TOMZN",
      });
    }
  }

  const newState = { ...state, lastTomzn: record, updatedAt: now };
  await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, newState, { upsert: true });
  return { state: newState, record, allocatedDelta };
}

async function usageByMeter(allocations, fromTimestamp, until = Date.now()) {
  const rows = await allocations.aggregate([
    { $match: { timestamp: { $gte: fromTimestamp, $lte: until } } },
    { $group: { _id: "$meterId", usage: { $sum: "$delta" } } },
  ]).toArray();
  return Object.fromEntries(rows.map((row) => [row._id, round(row.usage)]));
}

async function meterUsageSince(allocations, meterId, fromTimestamp, until = Date.now()) {
  const row = await allocations.aggregate([
    { $match: { meterId, timestamp: { $gte: fromTimestamp, $lte: until } } },
    { $group: { _id: null, usage: { $sum: "$delta" } } },
  ]).next();
  return round(row?.usage || 0);
}

function readingAt(readings, targetTimestamp) {
  const ordered = [...readings].sort((a, b) => a.timestamp - b.timestamp);
  if (!ordered.length || targetTimestamp < ordered[0].timestamp || targetTimestamp > ordered[ordered.length - 1].timestamp) return null;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (targetTimestamp >= current.timestamp && targetTimestamp <= next.timestamp) {
      const fraction = (targetTimestamp - current.timestamp) / Math.max(1, next.timestamp - current.timestamp);
      return current.reading + (next.reading - current.reading) * fraction;
    }
  }
  return ordered[ordered.length - 1].reading;
}

function manualUsageAcrossWindow(readings, startTimestamp, endTimestamp) {
  return Array.from(METER_IDS).reduce((sum, meterId) => {
    const series = readings.filter((reading) => reading.meterId === meterId);
    const start = readingAt(series, startTimestamp);
    const end = readingAt(series, endTimestamp);
    return sum + (start == null || end == null ? 0 : Math.max(0, end - start));
  }, 0);
}

// Turns each pair of confirmed physical readings into proportional time slices.
// This preserves every old reading in daily/hourly summaries instead of treating
// the imported history as a single average number.
function forEachReadingInterval(readings, callback) {
  for (const meterId of METER_IDS) {
    const series = readings.filter((reading) => reading.meterId === meterId).sort((a, b) => a.timestamp - b.timestamp);
    for (let index = 1; index < series.length; index += 1) {
      const previous = series[index - 1];
      const current = series[index];
      const totalDuration = current.timestamp - previous.timestamp;
      const totalUsage = current.reading - previous.reading;
      if (totalDuration <= 0 || totalUsage < 0) continue;
      let cursor = previous.timestamp;
      while (cursor < current.timestamp) {
        const nextDay = startOfPakistanDay(cursor) + 86_400_000;
        const end = Math.min(current.timestamp, nextDay);
        const usage = totalUsage * ((end - cursor) / totalDuration);
        callback({ meterId, start: cursor, end, usage });
        cursor = end;
      }
    }
  }
}

// Runs both from the exact 28th 12:00 PM job and as a catch-up after a restart.
// The baseline is the calculated meter reading at the cycle boundary, so no units
// before the 28th leak into the new monthly allowance.
async function rolloverBillingCycle({ stateCollection, allocations }, state, now = Date.now()) {
  const cycleStart = billingCycleStart(now, state.billingDay);
  const needsRollover = Array.from(METER_IDS).some((meterId) => (state.meters[meterId].cycleBaselineAt || 0) < cycleStart);
  if (!needsRollover) return state;

  // Before resetting baselines, capture the total usage from the ending cycle
  // and save it as lastMonthTotalOverride for trend comparison.
  let cycleTotal = 0;
  for (const meterId of METER_IDS) {
    const meter = state.meters[meterId];
    if ((meter.cycleBaselineAt || 0) >= cycleStart) continue;
    const anchorAt = meter.anchorAt || meter.cycleBaselineAt || cycleStart;
    const rawUsageUpToCycleStart = anchorAt < cycleStart
      ? await meterUsageSince(allocations, meterId, anchorAt, cycleStart)
      : 0;
    const usageUpToCycleStart = calibratedUnits(meter, rawUsageUpToCycleStart);
    cycleTotal += usageUpToCycleStart;
    meter.cycleBaselineReading = round((meter.anchorReading ?? meter.cycleBaselineReading) + usageUpToCycleStart, 2);
    meter.cycleBaselineAt = cycleStart;
  }
  if (cycleTotal > 0) {
    state.lastMonthTotalOverride = round(cycleTotal, 1);
  }
  state.updatedAt = now;
  await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, state);
  return state;
}

function projectMeters(state, readings, averageDaily, now) {
  const billingEnd = nextBillingCycleStart(now, state.billingDay);
  const daysLeft = Math.max(0, (billingEnd - now) / 86_400_000);
  const target = state.slabTargetUnits;
  const result = {};
  let cursor = now;

  const order = [state.activeMeter, state.activeMeter === "meter1" ? "meter2" : "meter1"];
  for (const meterId of order) {
    const meter = readings[meterId];
    // There is no measured average until the first TOMZN interval has closed.
    // Use a clearly low-confidence, conservative bootstrap rate rather than
    // returning impossible 20,000-day slab dates to the dashboard.
    const rate = Math.max(0.01, calibratedUnits(state.meters[meterId], averageDaily || 5));
    const daysToSlab = meter.remainingUnits / rate;
    const startAt = cursor;
    const allocatedDays = Math.min(Math.max(0, (billingEnd - cursor) / 86_400_000), Math.max(0, daysToSlab));
    const projectedUsage = meter.cycleUsage + allocatedDays * rate;
    const slabAt = cursor + daysToSlab * 86_400_000;
    result[meterId] = {
      projectedDaysLeft: Math.max(0, Math.floor(daysToSlab)),
      projectedSlabDate: slabAt,
      startsAfterDate: meterId === state.activeMeter ? undefined : startAt,
      projectedMonthly: round(projectedUsage, 1),
      queueStatus: meterId === state.activeMeter ? "ACTIVE" : "NEXT",
    };
    cursor = slabAt;
  }
  return { meters: result, projectedHome: round(Object.values(result).reduce((sum, item) => sum + item.projectedMonthly, 0), 1), daysLeft };
}

// Reassign the allocation ledger when a phone records a changeover while
// offline. Normally TOMZN intervals are five minutes long; splitting a single
// interval that crosses the recorded switch keeps the correction proportional
// instead of moving the whole interval to the wrong meter.
async function applyHistoricalChangeover(allocations, fromMeter, toMeter, effectiveAt) {
  if (fromMeter === toMeter) return;
  const candidates = await allocations.find({
    meterId: fromMeter,
    $or: [
      { timestamp: { $gte: effectiveAt } },
      { fromTimestamp: { $lt: effectiveAt }, timestamp: { $gt: effectiveAt } },
    ],
  }).toArray();

  for (const allocation of candidates) {
    const startsBefore = finiteNumber(allocation.fromTimestamp, allocation.timestamp) < effectiveAt;
    if (startsBefore && allocation.timestamp > effectiveAt) {
      const span = Math.max(1, allocation.timestamp - allocation.fromTimestamp);
      const afterRatio = clamp((allocation.timestamp - effectiveAt) / span, 0, 1);
      const afterDelta = round(allocation.delta * afterRatio);
      const beforeDelta = round(Math.max(0, allocation.delta - afterDelta));
      if (afterDelta <= 0) continue;
      await allocations.updateOne({ _id: allocation._id }, { $set: { delta: beforeDelta, splitAt: effectiveAt } });
      const { _id, ...splitAllocation } = allocation;
      await allocations.insertOne({
        ...splitAllocation,
        meterId: toMeter,
        delta: afterDelta,
        fromTimestamp: effectiveAt,
        startEnergyKwh: round(allocation.endEnergyKwh - afterDelta, 3),
        source: "TOMZN_CHANGEOVER_SPLIT",
        splitAt: effectiveAt,
      });
    } else {
      await allocations.updateOne({ _id: allocation._id }, { $set: { meterId: toMeter, reassignedAt: Date.now(), changeoverAt: effectiveAt } });
    }
  }
}

async function buildDashboard({ stateCollection, allocations, snapshots, manualLogs, inverterSnapshots, weatherSnapshots, liveTomznRef }) {
  const now = Date.now();
  let state = await ensureState(stateCollection);
  state = await rolloverBillingCycle({ stateCollection, allocations }, state, now);
  // Prefer the in-memory live cache for display values when it's fresher than the
  // last persisted snapshot — this keeps the dashboard responsive (5s updates) while
  // the database only stores one snapshot per minute.
  const liveOverride = liveTomznRef?.value;
  const tomznSource = (liveOverride && (!state.lastTomzn || liveOverride.timestamp >= state.lastTomzn.timestamp))
    ? liveOverride
    : state.lastTomzn;
  const cycleStart = billingCycleStart(now, state.billingDay);
  const prevCycleStart = billingCycleStart(cycleStart - 1, state.billingDay);
  const todayStart = startOfPakistanDay(now);
  const [cycleUsage, todayUsage, recentUsage, logs, firstAllocation, recentAllocations, recentSnapshots, inverterHistory, latestInverterSnapshot, latestWeather, lastCycleUsage, todayTomznSnapshots] = await Promise.all([
    usageByMeter(allocations, cycleStart, now),
    usageByMeter(allocations, todayStart, now),
    usageByMeter(allocations, Math.max(cycleStart, now - 7 * 86_400_000), now),
    manualLogs.find({}).sort({ timestamp: -1 }).limit(100).toArray(),
    allocations.find({}).sort({ timestamp: 1 }).limit(1).next(),
    allocations.find({ timestamp: { $gte: todayStart - 7 * 86_400_000, $lte: now } }).sort({ timestamp: 1 }).toArray(),
    snapshots.find({ timestamp: { $gte: now - 30 * 86_400_000 } }).sort({ timestamp: -1 }).limit(5_000).toArray(),
    // Flow graph is today-only (resets at Pakistan midnight) — don't query 24h.
    inverterSnapshots.find({ timestamp: { $gte: todayStart, $lte: now } }).sort({ timestamp: 1 }).limit(5_000).toArray(),
    // Query the latest inverter snapshot separately — the inverterHistory query
    // above sorts ascending and limits to 5000, so with high-frequency polling
    // (>5000 snapshots/24h) the most recent snapshots would be cut off.
    inverterSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next(),
    weatherSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next(),
    usageByMeter(allocations, prevCycleStart, cycleStart),
    // Today's TOMZN snapshots — used to supplement energy calculations and flow
    // history when the inverter is off (bypass mode). TOMZN powerW sees all power
    // flowing to the home whether from solar or grid, so it fills the gaps.
    snapshots.find({ timestamp: { $gte: todayStart - 5 * 60_000, $lte: now } }).sort({ timestamp: 1 }).limit(5_000).toArray(),
  ]);
  const latestInverter = latestInverterSnapshot || inverterHistory[inverterHistory.length - 1] || null;
  // Staleness check: inverter is live only if the server fetched data recently
  // AND the inverter's own realTime (sourceTime) is not more than 3 min behind.
  // The 3-min threshold matches the poll-time check (line 101) — the inverter
  // updates its hardware clock every 1-2 min, so a tighter threshold (e.g. 60s)
  // causes false "offline" flickering for 2-5 seconds between inverter updates.
  let inverterLive = Boolean(latestInverter && now - latestInverter.timestamp < 3 * 60_000);
  if (inverterLive && latestInverter?.sourceTime) {
    const parsed = parseInverterRealTime(latestInverter.sourceTime);
    if (parsed !== null && now - parsed > 3 * 60 * 1000) {
      inverterLive = false;
    }
  }
  // isOnline: true when the inverter is reporting valid data (not offline).
  // Defaults to true for old snapshots that don't have the field.
  const inverterOnline = latestInverter ? latestInverter.isOnline !== false : false;
  const inverter = latestInverter ? {
    solarW: latestInverter.solarW,
    solarV: latestInverter.solarV,
    solarA: latestInverter.solarA,
    gridW: latestInverter.gridW,
    gridV: latestInverter.gridV,
    gridHz: latestInverter.gridHz,
    gridConnected: latestInverter.gridConnected,
    gridDirection: latestInverter.gridDirection,
    loadW: latestInverter.loadW,
    loadVa: latestInverter.loadVa,
    loadPercent: latestInverter.loadPercent,
    acOutV: latestInverter.acOutV,
    acOutHz: latestInverter.acOutHz,
    inverterMode: latestInverter.inverterMode,
    inverterFault: latestInverter.inverterFault,
    temperatureC: latestInverter.temperatureC,
    ratedOutputW: latestInverter.ratedOutputW,
    signal: latestInverter.signal,
    sourceTime: latestInverter.sourceTime || null,
    fetchedAt: new Date(latestInverter.timestamp).toISOString(),
    isLive: inverterLive,
    isOnline: inverterOnline,
  } : { solarW: 0, solarV: 0, solarA: 0, gridW: 0, gridV: 0, gridHz: 0, gridConnected: false, gridDirection: "import", loadW: 0, loadVa: 0, loadPercent: 0, acOutV: 0, acOutHz: 0, inverterMode: "unknown", inverterFault: "UNKNOWN", temperatureC: 0, ratedOutputW: 0, signal: null, sourceTime: null, fetchedAt: "", isLive: false, isOnline: false };
  const weather = latestWeather ? {
    code: latestWeather.code,
    isDay: latestWeather.isDay,
    cloudCover: latestWeather.cloudCover,
    precipitation: latestWeather.precipitation,
    temperatureC: latestWeather.temperatureC,
    sunrise: latestWeather.sunrise || null,
    sunset: latestWeather.sunset || null,
    fetchedAt: new Date(latestWeather.timestamp).toISOString(),
    isLive: now - latestWeather.timestamp < WEATHER_POLL_MAX_AGE_MS * 2,
  } : { code: 0, isDay: pakistanHour(now) >= 6 && pakistanHour(now) < 19, cloudCover: 0, precipitation: 0, temperatureC: 0, sunrise: null, sunset: null, fetchedAt: "", isLive: false };
  // Sanitize historical samples: zero out gridW when gridV is 0 (grid relay open)
  // or when gridW is a phantom reading (< 200W) that the InverterZone API
  // reports even when the grid relay is on standby.
  // Filter out offline snapshots (isOnline === false) so they don't create
  // zero-drops in the flow graph or skew energy integration calculations.
  const sanitizedInverterHistory = inverterHistory
    .filter((s) => s.isOnline !== false)
    .map((s) => ({
      ...s,
      gridW: (s.gridV > 0 && s.gridW >= 200) ? s.gridW : 0,
    }));
  const todaySanitized = sanitizedInverterHistory.filter((sample) => sample.timestamp >= todayStart - 5 * 60_000);
  // TOMZN snapshots supplement energy and flow data when the inverter is off.
  // TOMZN powerW sees ALL power flowing to the home (from grid or solar), so
  // it fills gaps when the inverter is off (bypass mode) or offline.
  const todayTomzn = (todayTomznSnapshots || [])
    .filter((s) => s.powerW != null && s.powerW >= 0)
    .map((s) => ({ timestamp: s.timestamp, powerW: Math.max(0, s.powerW || 0) }));
  // Build a set of 5-minute buckets covered by inverter data so we know which
  // buckets need TOMZN supplementation.
  const FLOW_BUCKET_MS = 5 * 60_000;
  const inverterBuckets = new Set();
  for (const sample of todaySanitized) {
    inverterBuckets.add(Math.floor(sample.timestamp / FLOW_BUCKET_MS));
  }
  // TOMZN samples for buckets where no inverter data exists — these represent
  // periods when the inverter was off and only grid (TOMZN) was supplying power.
  const tomznSupplement = todayTomzn.filter((s) =>
    !inverterBuckets.has(Math.floor(s.timestamp / FLOW_BUCKET_MS))
  );
  const tomznGridKwh = integrateWatts(todayTomzn, "powerW");
  const energyToday = {
    solarKwh: integrateWatts(todaySanitized, "solarW"),
    // Home energy: use inverter loadW when available, supplement with TOMZN
    // powerW for periods when inverter was off (TOMZN sees all home power).
    homeKwh: round(integrateWatts(todaySanitized, "loadW") + integrateWatts(tomznSupplement, "powerW"), 3),
    // Grid energy: use inverter gridW when available, supplement with TOMZN
    // powerW for periods when inverter was off.
    gridKwh: round(integrateWatts(todaySanitized, "gridW") + integrateWatts(tomznSupplement, "powerW"), 3),
  };
  // Downsample flow history to 1 point per 5-minute bucket (max 288 points/24h).
  // This prevents the frontend graph from rendering thousands of duplicate path segments.
  const flowBuckets = new Map();
  for (const sample of sanitizedInverterHistory) {
    const bucket = Math.floor(sample.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
    const existing = flowBuckets.get(bucket);
    // Keep the latest sample within each 5-minute bucket.
    if (!existing || sample.timestamp > existing.timestamp) {
      flowBuckets.set(bucket, sample);
    }
  }
  // Fill flow history gaps with TOMZN data for buckets where inverter was off.
  // TOMZN powerW = grid import = home usage when inverter is off (bypass mode).
  for (const sample of todayTomzn) {
    const bucket = Math.floor(sample.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
    if (!flowBuckets.has(bucket)) {
      flowBuckets.set(bucket, {
        timestamp: sample.timestamp,
        solarW: 0,
        gridW: 0, // inverter gridW — 0 because inverter was off
        loadW: 0, // inverter loadW — 0 because inverter was off
        _tomznPowerW: sample.powerW, // TOMZN grid import for this bucket
      });
    }
  }
  const flowHistory = Array.from(flowBuckets.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((sample) => ({
      timestamp: sample.timestamp,
      solarKw: round(sample.solarW / 1000, 3),
      // Use inverter gridW when available; fall back to TOMZN powerW for buckets
      // where the inverter was off (bypass mode).
      gridKw: (sample.gridV > 0 && sample.gridW >= 200)
        ? round(sample.gridW / 1000, 3)
        : round((sample._tomznPowerW || 0) / 1000, 3),
      // Use inverter loadW when available; fall back to TOMZN powerW.
      loadKw: sample.loadW > 0
        ? round(sample.loadW / 1000, 3)
        : round((sample._tomznPowerW || 0) / 1000, 3),
    }));
  const windowStart = Math.max(cycleStart, now - 7 * 86_400_000, firstAllocation?.timestamp || now);
  const observedDays = Math.max(0, (now - windowStart) / 86_400_000);
  const totalObservedDays = Math.max(0, (now - (firstAllocation?.timestamp || now)) / 86_400_000);
  const observedUsage = Object.values(recentUsage).reduce((sum, value) => sum + value, 0);
  // A few minutes of data should not be annualised into a wild monthly forecast.
  // Before 12 hours of TOMZN history exist, forecasts use the bootstrap rate below.
  const tomznAverageDaily = observedDays >= 0.5 ? round(observedUsage / observedDays, 2) : 0;
  const historicalLogs = logs.filter((log) => log.source === "HISTORICAL_IMPORT" && log.timestamp >= cycleStart);
  const firstHistoricalAt = historicalLogs.length ? Math.min(...historicalLogs.map((log) => log.timestamp)) : 0;
  const lastHistoricalAt = historicalLogs.length ? Math.max(...historicalLogs.map((log) => log.timestamp)) : 0;
  
  const allHistoricalLogs = logs.filter((log) => log.source === "HISTORICAL_IMPORT");
  const firstAllHistoricalAt = allHistoricalLogs.length ? Math.min(...allHistoricalLogs.map((log) => log.timestamp)) : 0;
  const lastAllHistoricalAt = allHistoricalLogs.length ? Math.max(...allHistoricalLogs.map((log) => log.timestamp)) : 0;
  const totalHistoricalDays = firstAllHistoricalAt && lastAllHistoricalAt > firstAllHistoricalAt ? (lastAllHistoricalAt - firstAllHistoricalAt) / 86_400_000 : 0;
  
  const historicalUnits = Array.from(METER_IDS).reduce((sum, meterId) => {
    const series = historicalLogs.filter((log) => log.meterId === meterId).sort((a, b) => a.timestamp - b.timestamp);
    return sum + (series.length > 1 ? Math.max(0, series[series.length - 1].reading - series[0].reading) : 0);
  }, 0);
  const historicalDays = firstHistoricalAt && lastHistoricalAt > firstHistoricalAt ? (lastHistoricalAt - firstHistoricalAt) / 86_400_000 : 0;
  const historicalAverageDaily = historicalDays >= 0.25 ? round(historicalUnits / historicalDays, 2) : 0;
  // TOMZN becomes the dominant forecast source as its own measured history grows.
  const averageDaily = tomznAverageDaily > 0 && historicalAverageDaily > 0
    ? round(tomznAverageDaily * 0.7 + historicalAverageDaily * 0.3, 2)
    : tomznAverageDaily || historicalAverageDaily;
  const safeAverageDaily = averageDaily || 0;
  // Load status uses TOMZN powerW for BOTH current and normal draw.
  // TOMZN sits between grid and home — it sees ALL power flowing to the home
  // whether from solar or grid. Mixing inverter loadW (solar output) with
  // TOMZN powerW (grid import) historical averages produced false "High" readings
  // during solar hours because inverter loadW >> historical grid import.
  const currentDrawKw = tomznSource?.powerW != null
    ? round(tomznSource.powerW / 1000, 2)
    : 0;
  const targetHourOfDay = pakistanHour(now);
  const sameHourSnapshots = recentSnapshots.filter((snapshot) => pakistanHour(snapshot.timestamp) === targetHourOfDay && snapshot.powerW > 0);
  // If fewer than 5 readings exist for this exact hour (new hour just started),
  // widen the search to include the same clock-hour ±1 from the last 30 days
  // so the Load status doesn't reset to "Normal" every time the clock ticks over.
  const adjacentHourSnapshots = sameHourSnapshots.length < 5
    ? recentSnapshots.filter((snapshot) => {
        const h = pakistanHour(snapshot.timestamp);
        return (h === targetHourOfDay || h === (targetHourOfDay + 1) % 24 || h === (targetHourOfDay + 23) % 24) && snapshot.powerW > 0;
      })
    : sameHourSnapshots;
  // Trimmed mean: remove top & bottom 20% of readings to eliminate outliers
  // (grid-off events, brief surges, solar-only low-draw periods). This gives
  // a more stable "normal" baseline that doesn't get skewed by atypical days.
  const sortedPower = adjacentHourSnapshots.map((s) => s.powerW).sort((a, b) => a - b);
  const trimCount = Math.floor(sortedPower.length * 0.2);
  const trimmed = sortedPower.slice(trimCount, sortedPower.length - trimCount);
  const normalDrawKw = trimmed.length >= 3
    ? round(trimmed.reduce((sum, pw) => sum + pw, 0) / trimmed.length / 1000, 2)
    : adjacentHourSnapshots.length >= 3
      ? round(adjacentHourSnapshots.reduce((sum, snapshot) => sum + snapshot.powerW, 0) / adjacentHourSnapshots.length / 1000, 2)
      : round(safeAverageDaily / 24, 2);
  // Wider gap: ±35% instead of ±20%. With solar in the mix, TOMZN powerW
  // naturally varies more (solar hours vs grid-only hours). A wider dead
  // zone prevents the status from flickering between High/Low on minor changes.
  const loadRatio = normalDrawKw > 0 ? currentDrawKw / normalDrawKw : 1;
  const loadStatus = loadRatio >= 1.35 ? "High" : loadRatio <= 0.65 ? "Low" : "Normal";
  const totalToday = round(Array.from(METER_IDS).reduce((sum, meterId) =>
    sum + calibratedUnits(state.meters[meterId], todayUsage[meterId] || 0), 0), 2);
  // Last month total = sum of all meter usage in the previous billing cycle (28th → 28th)
  // Uses manual override if set (from settings), otherwise calculated from allocations.
  const calculatedLastMonth = round(Object.values(lastCycleUsage).reduce((sum, value) => sum + value, 0), 1);
  const lastMonthTotal = finiteNumber(state.lastMonthTotalOverride, calculatedLastMonth) || calculatedLastMonth;
  const sevenDayStart = todayStart - 6 * 86_400_000;
  const dailyMap = new Map();
  for (let offset = 0; offset < 7; offset += 1) {
    const start = sevenDayStart + offset * 86_400_000;
    dailyMap.set(pakistanDateKey(start), { timestamp: start, label: pakistanDayLabel(start), usage: 0 });
  }
  // Time-of-day buckets (Pakistan time)
  // Night:          10 PM – 5 AM  (hours 22,23,0,1,2,3,4)
  // Day:             9 AM – 6 PM  (hours 9..17)
  // Morning/Evening: 5 AM – 9 AM + 6 PM – 10 PM  (hours 5,6,7,8,18,19,20,21)
  const isNightHour   = (h) => h >= 22 || h < 5;
  const isDayHour     = (h) => h >= 9 && h < 18;
  // everything else falls into morning/evening
  let periodNight = 0;
  let periodDay = 0;
  let periodMorningEvening = 0;
  // Seed the summaries from the imported physical readings. TOMZN allocations
  // begin after this historical series, so this does not double-count usage.
  forEachReadingInterval(historicalLogs, (segment) => {
    if (segment.end <= sevenDayStart || segment.start >= now) return;
    const segmentStart = Math.max(segment.start, sevenDayStart);
    const segmentEnd = Math.min(segment.end, now);
    const visibleUsage = segment.usage * ((segmentEnd - segmentStart) / Math.max(1, segment.end - segment.start));
    const bucket = dailyMap.get(pakistanDateKey(segmentStart));
    if (bucket) bucket.usage += visibleUsage;

    let cursor = segmentStart;
    while (cursor < segmentEnd) {
      const hourEnd = (Math.floor(cursor / 3_600_000) + 1) * 3_600_000;
      const end = Math.min(segmentEnd, hourEnd);
      const portion = visibleUsage * ((end - cursor) / Math.max(1, segmentEnd - segmentStart));
      const h = pakistanHour(cursor);
      if (isNightHour(h)) periodNight += portion;
      else if (isDayHour(h)) periodDay += portion;
      else periodMorningEvening += portion;
      cursor = end;
    }
  });
  for (const allocation of recentAllocations) {
    const key = pakistanDateKey(allocation.timestamp);
    const bucket = dailyMap.get(key);
    const calibratedDelta = calibratedUnits(state.meters[allocation.meterId], allocation.delta);
    if (bucket) bucket.usage += calibratedDelta;
    const h = pakistanHour(allocation.timestamp);
    if (isNightHour(h)) periodNight += calibratedDelta;
    else if (isDayHour(h)) periodDay += calibratedDelta;
    else periodMorningEvening += calibratedDelta;
  }
  const dailyUsage = Array.from(dailyMap.values()).map((item) => ({ ...item, usage: round(item.usage, 2) }));
  let usageTrendPercent = null;
  const usageTrendDelta = null;

  const currentHourStart = Math.floor(now / 3_600_000) * 3_600_000;
  const hourlyMap = new Map();
  for (let offset = 0; offset < 24; offset += 1) {
    const timestamp = currentHourStart - (23 - offset) * 3_600_000;
    hourlyMap.set(timestamp, { timestamp, usage: 0 });
  }
  forEachReadingInterval(historicalLogs, (segment) => {
    let cursor = Math.max(segment.start, currentHourStart - 23 * 3_600_000);
    const endLimit = Math.min(segment.end, now);
    while (cursor < endLimit) {
      const hourEnd = (Math.floor(cursor / 3_600_000) + 1) * 3_600_000;
      const end = Math.min(endLimit, hourEnd);
      const portion = segment.usage * ((end - cursor) / Math.max(1, segment.end - segment.start));
      const bucket = hourlyMap.get(Math.floor(cursor / 3_600_000) * 3_600_000);
      if (bucket) bucket.usage += portion;
      cursor = end;
    }
  });
  for (const allocation of recentAllocations) {
    const timestamp = Math.floor(allocation.timestamp / 3_600_000) * 3_600_000;
    const bucket = hourlyMap.get(timestamp);
    if (bucket) bucket.usage += calibratedUnits(state.meters[allocation.meterId], allocation.delta);
  }
  const hourlyUsage = Array.from(hourlyMap.values()).map((item) => ({ ...item, usage: round(item.usage, 3) }));
  // Build a time-of-day hourly profile from the last 7 past days.
  // For each hour slot (0-23) we accumulate how many units were typically consumed,
  // then use that profile to predict the remaining hours of today.
  const elapsedHoursToday = Math.floor((now - todayStart) / 3_600_000);
  const hourlyProfileSum   = new Array(24).fill(0); // sum of units per hour slot across days
  const hourlyProfileCount = new Array(24).fill(0); // how many days contributed to each slot
  let activeDaysCount = 0;

  for (let i = 1; i <= 7; i++) {
    const dayStart = todayStart - i * 86_400_000;
    const dayEnd   = dayStart + 86_400_000;
    const dayHourlyMap = new Map();
    for (let h = 0; h < 24; h++) dayHourlyMap.set(h, 0);

    // Seed from historical manual-reading segments
    forEachReadingInterval(historicalLogs, (segment) => {
      const segStart = Math.max(segment.start, dayStart);
      const segEnd   = Math.min(segment.end, dayEnd);
      if (segStart >= segEnd) return;
      let cursor = segStart;
      while (cursor < segEnd) {
        const hourBucket = Math.floor((cursor - dayStart) / 3_600_000);
        const hourEnd = dayStart + (hourBucket + 1) * 3_600_000;
        const end = Math.min(segEnd, hourEnd);
        const portion = segment.usage * ((end - cursor) / Math.max(1, segment.end - segment.start));
        dayHourlyMap.set(hourBucket, (dayHourlyMap.get(hourBucket) || 0) + portion);
        cursor = end;
      }
    });

    // Seed from TOMZN allocations
    for (const allocation of recentAllocations) {
      if (allocation.timestamp < dayStart || allocation.timestamp >= dayEnd) continue;
      const hourBucket = Math.floor((allocation.timestamp - dayStart) / 3_600_000);
      dayHourlyMap.set(hourBucket, (dayHourlyMap.get(hourBucket) || 0) + calibratedUnits(state.meters[allocation.meterId], allocation.delta));
    }

    // Only include days with meaningful data
    const dayTotal = Array.from(dayHourlyMap.values()).reduce((s, v) => s + v, 0);
    if (dayTotal > 0.01) {
      activeDaysCount++;
      for (let h = 0; h < 24; h++) {
        hourlyProfileSum[h]   += dayHourlyMap.get(h) || 0;
        hourlyProfileCount[h]++;
      }
    }
  }

  // Avg units consumed per hour of day (falls back to flat avg/24 when no history for that slot)
  const flatHourlyFallback = safeAverageDaily / 24;
  const avgHourlyProfile = hourlyProfileSum.map((sum, h) =>
    hourlyProfileCount[h] > 0 ? sum / hourlyProfileCount[h] : flatHourlyFallback
  );

  // Predict remaining hours using the historical hourly profile
  let predictedRemainingUnits = 0;
  for (let h = elapsedHoursToday; h < 24; h++) {
    predictedRemainingUnits += avgHourlyProfile[h];
  }

  // Projected full-day = units already consumed + predicted remaining
  const predictedTodayTotal = round(totalToday + predictedRemainingUnits, 2);

  // Trend: compare today's prediction + past 2 completed days (3 days total)
  // against the remaining earlier completed days in the 7-day window.
  const effectiveUsageDays = dailyUsage.map((day, i) => 
    i === dailyUsage.length - 1 ? { ...day, usage: predictedTodayTotal } : day
  ).filter((day) => day.usage > 0);

  if (effectiveUsageDays.length >= 4) {
    // Recent half: last 3 days (today + last 2). Earlier half: everything before that.
    const recent  = effectiveUsageDays.slice(-3);
    const earlier = effectiveUsageDays.slice(0, -3);
    const recentAvg  = recent.reduce((s, d) => s + d.usage, 0) / recent.length;
    const earlierAvg = earlier.reduce((s, d) => s + d.usage, 0) / earlier.length;
    if (earlierAvg > 0) {
      usageTrendPercent = Math.max(-50, Math.min(50, round(((recentAvg - earlierAvg) / earlierAvg) * 100, 1)));
    }
  } else if (effectiveUsageDays.length >= 2) {
    const recent = effectiveUsageDays.slice(-1);
    const earlier = effectiveUsageDays.slice(0, -1);
    const priorAvg = earlier.reduce((s, d) => s + d.usage, 0) / earlier.length;
    if (priorAvg > 0) {
      usageTrendPercent = Math.max(-50, Math.min(50, round(((recent[0].usage - priorAvg) / priorAvg) * 100, 1)));
    }
  }

  // Historical full-day baseline: avg of past 7 complete days (from safeAverageDaily)
  // If no rolling avg yet, sum the full profile as a fallback
  const historicalFullDayAvg = safeAverageDaily > 0
    ? safeAverageDaily
    : (activeDaysCount > 0 ? round(hourlyProfileSum.reduce((s, v) => s + v, 0) / activeDaysCount, 2) : 0);

  // Full yesterday total (for display / other uses)
  const yesterdayUsage = dailyUsage[5]?.usage || 0;

  // % = how today is predicted to end up vs a normal day — capped at ±99%
  const usageChangePercent = historicalFullDayAvg > 0
    ? Math.max(-99, Math.min(99, round(((predictedTodayTotal - historicalFullDayAvg) / historicalFullDayAvg) * 100, 1)))
    : null;


  const unallocatedDelta = (tomznSource && state.lastTomzn && tomznSource.energyKwh >= state.lastTomzn.energyKwh)
    ? round(tomznSource.energyKwh - state.lastTomzn.energyKwh, 3)
    : 0;

  const readings = {};
  let maxErrorPenalty = 0;
  for (const meterId of METER_IDS) {
    const config = state.meters[meterId];
    let rawAfterAnchor = await meterUsageSince(allocations, meterId, Math.max(config.anchorAt || cycleStart, cycleStart), now);
    let meterTodayUncalibrated = todayUsage[meterId] || 0;
    
    if (meterId === state.activeMeter && unallocatedDelta > 0) {
      // Add the live unallocated consumption to the active meter so readings update in real time
      rawAfterAnchor += unallocatedDelta;
      meterTodayUncalibrated += unallocatedDelta;
    }

    const afterAnchor = calibratedUnits(config, rawAfterAnchor);
    const reading = round((config.anchorReading ?? config.cycleBaselineReading) + afterAnchor, 2);
    const cycleUsageValue = Math.max(0, round(reading - config.cycleBaselineReading, 2));
    const remainingUnits = Math.max(0, round(state.slabTargetUnits - cycleUsageValue, 2));
    const meterToday = calibratedUnits(config, meterTodayUncalibrated);
    const calibrationEvidence = clamp(finiteNumber(config.calibrationTomznUnits, 0), 0, 100);
    
    // Penalize confidence if the last manual reading was far off the prediction
    const baseConfidence = averageDaily > 0 ? Math.round(55 + Math.min(35, Math.max(totalObservedDays, totalHistoricalDays) * 8)) : 20;
    const errorPenalty = Math.min(40, Math.round((Math.abs(finiteNumber(config.lastManualCorrection, 0)) / Math.max(1, safeAverageDaily)) * 30));
    const finalConfidence = Math.max(10, Math.min(95, baseConfidence - errorPenalty));
    if (errorPenalty > maxErrorPenalty) maxErrorPenalty = errorPenalty;
    readings[meterId] = {
      id: meterId,
      label: config.label,
      reading,
      cycleUsage: cycleUsageValue,
      targetUnits: state.slabTargetUnits,
      remainingUnits,
      todayUsage: meterToday,
      currentDaily: meterToday,
      averageDaily: calibratedUnits(config, safeAverageDaily),
      averageLast3Days: calibratedUnits(config, safeAverageDaily),
      recentDailyAvg: calibratedUnits(config, safeAverageDaily),
      targetDaily: 0,
      expectedDrawNow: meterId === state.activeMeter ? round(currentDrawKw * meterRatio(config), 2) : 0,
      paceRatio: 0,
      trendStatus: "stable",
      predictionConfidence: finalConfidence,
      healthScore: 0,
      healthColor: "#22C55E",
      consumptionSpeedScore: 0,
      consumptionSpeedColor: "#22C55E",
      remainingColor: "#22C55E",
      driftOffset: round(finiteNumber(config.lastManualCorrection, 0), 2),
      averageError: Math.abs(round(finiteNumber(config.lastManualCorrection, 0), 2)),
      calibrationCount: Math.max(0, Math.floor(finiteNumber(config.ratioObservationCount, 0))),
      calibrationFactor: meterRatio(config),
      calibrationConfidence: Math.round(Math.min(95, 25 + calibrationEvidence * 0.7)),
      lastLoggedAt: logs.find((log) => log.meterId === meterId)?.timestamp,
      lastLoggedReading: logs.find((log) => log.meterId === meterId)?.reading,
      explanation: `TOMZN usage is allocated only while this meter is active, then adjusted by its learned ${(meterRatio(config) * 100).toFixed(1)}% meter ratio.`,
      confidencePercent: finalConfidence,
      minLikelyReading: reading,
      maxLikelyReading: reading,
      trend: "stable",
    };
  }
  const projected = projectMeters(state, readings, safeAverageDaily, now);
  // vsLastMonthPercent: how this month's projection compares to last month's actual total
  const vsLastMonthPercent = lastMonthTotal > 0
    ? Math.max(-99, Math.min(99, round(((projected.projectedHome - lastMonthTotal) / lastMonthTotal) * 100, 1)))
    : null;
  const billingEnd = nextBillingCycleStart(now, state.billingDay);
  const daysInCycle = Math.max(1, (billingEnd - cycleStart) / 86_400_000);
  const remainingCycleDays = Math.max(0, (billingEnd - now) / 86_400_000);
  for (const meterId of METER_IDS) {
    Object.assign(readings[meterId], projected.meters[meterId]);
    const expectedRemaining = state.slabTargetUnits * remainingCycleDays / daysInCycle;
    readings[meterId].paceRatio = expectedRemaining > 0 ? round(readings[meterId].remainingUnits / expectedRemaining, 2) : 0;
    readings[meterId].targetDaily = round(readings[meterId].remainingUnits / Math.max(1, remainingCycleDays), 2);
    // Outer ring: 80% live consumption pace, 20% remaining quota. A normal
    // draw is neutral (white); high remaining units pull the blend green slightly. A
    // draw twice the normal level offsets a full quota back to red/warning quickly.
    const consumptionScore = clamp(50 + (1 - loadRatio) * 50, 0, 100);
    const remainingScore = clamp((readings[meterId].remainingUnits / state.slabTargetUnits) * 100, 0, 100);
    readings[meterId].consumptionSpeedScore = Math.round((consumptionScore * 0.8) + (remainingScore * 0.2));
    readings[meterId].healthScore = readings[meterId].consumptionSpeedScore;
    readings[meterId].trendStatus = consumptionScore < 45 ? "worsening" : consumptionScore > 55 ? "improving" : "stable";
  }
  const combinedTarget = state.slabTargetUnits * METER_IDS.size;
  const combinedRemaining = Array.from(METER_IDS).reduce((sum, meterId) => sum + readings[meterId].remainingUnits, 0);
  const activeRate = Math.max(0.01, calibratedUnits(state.meters[state.activeMeter], safeAverageDaily || 5));
  const nextMeterId = state.activeMeter === "meter1" ? "meter2" : "meter1";
  const nextRate = Math.max(0.01, calibratedUnits(state.meters[nextMeterId], safeAverageDaily || 5));
  const combinedDaysLeft = safeAverageDaily > 0
    ? (readings[state.activeMeter].remainingUnits / activeRate) + (readings[nextMeterId].remainingUnits / nextRate)
    : 0;
  const daysBuffer = safeAverageDaily > 0 ? Math.floor(combinedDaysLeft - remainingCycleDays) : 0;
  const forecastRatio = projected.projectedHome / combinedTarget;
  const paceStatus = forecastRatio > 1.05 ? "CRITICAL" : forecastRatio > 1.0 ? "AVERAGE" : forecastRatio >= 0.93 ? "ON PACE" : forecastRatio >= 0.8 ? "GOOD" : "EXCELLENT";
  const outerRingScore = Math.round(Array.from(METER_IDS).reduce((sum, meterId) => sum + readings[meterId].consumptionSpeedScore, 0) / METER_IDS.size);

  // UPS backup check: only ping the home IP when BOTH solar inverter is offline
  // AND grid is unavailable/cutoff — meaning no power source is active. If the
  // ping succeeds, the router is still on (UPS backup). If it fails, power loss.
  const tomznFault = tomznSource?.faultCode || 0;
  const gridCutoffOrUnavailable = !tomznSource?.isOnline || tomznFault === 2048 || tomznFault === 8192;
  const inverterOffline = !inverterOnline || inverter.inverterMode === "S" ||
    (inverter.gridV === 0 && inverter.solarW === 0 && inverter.gridW === 0 && inverter.loadW === 0);
  let ups = null;
  if (inverterOffline && gridCutoffOrUnavailable) {
    const reachable = await pingHome();
    ups = { active: reachable, label: reachable ? "UPS Backup" : "Power Loss" };
  }

  return {
    version: state.version,
    generatedAt: new Date(now).toISOString(),
    activeMeter: state.activeMeter,
    changeover: { activeMeter: state.activeMeter, lastSwitchedAt: state.lastChangeoverAt },
    tomznLive: publicTomzn(tomznSource),
    inverter,
    weather,
    energyToday,
    flowHistory,
    ups,
    live: {
      gridKw: (inverterLive && inverterOnline) ? round(inverter.gridW / 1000, 3) : currentDrawKw,
      solarKw: (inverterLive && inverterOnline) ? round(inverter.solarW / 1000, 3) : 0,
      homeKw: (inverterLive && inverterOnline) ? round(inverter.loadW / 1000, 3) : currentDrawKw,
      currentAmp: (inverterLive && inverterOnline) ? inverter.solarA : (tomznSource?.currentA || 0),
      voltage: (inverterLive && inverterOnline) ? inverter.gridV : (tomznSource?.voltageV || 0),
      frequency: (inverterLive && inverterOnline) ? inverter.gridHz : (tomznSource?.frequencyHz || 50),
      powerFactor: 0.98,
    },
    home: {
      todayUsage: totalToday,
      averageDaily: safeAverageDaily,
      expectedDrawNow: currentDrawKw,
      projectedMonthly: projected.projectedHome,
      confidencePercent: averageDaily > 0 ? Math.max(10, Math.min(95, Math.round(55 + Math.min(35, Math.max(totalObservedDays, totalHistoricalDays) * 8)) - maxErrorPenalty)) : 20,
      trend: usageChangePercent == null ? "stable" : usageChangePercent > 5 ? "increasing" : usageChangePercent < -5 ? "decreasing" : "stable",
      primaryPattern: currentDrawKw > 0 ? "grid-only" : "transition",
      explanation: averageDaily > 0
        ? `Forecast uses ${historicalAverageDaily > 0 ? "confirmed meter history plus " : ""}${round(observedDays, 1)} day(s) of TOMZN usage and allocates future use in active-meter order. (Error Penalty: -${maxErrorPenalty}%)`
        : "Forecast is using a low-confidence starter rate until 12 hours of TOMZN history are collected.",
      yesterdayUsage,
      usageChangePercent,
      dailyUsage,
      hourlyUsage,
      periodDay: round(periodDay, 2),
      periodNight: round(periodNight, 2),
      periodMorningEvening: round(periodMorningEvening, 2),
      usageTrendPercent,
      usageTrendDelta,
      normalDrawKw,
      loadStatus,
      paceStatus,
      outerRingScore,
      combinedDaysLeft: round(combinedDaysLeft, 1),
      daysBuffer,
      combinedTarget,
      lastMonthTotal,
      vsLastMonthPercent,
    },
    meters: readings,
    manualLogs: logs.map(({ _id, ...log }) => log),
    meta: { cycleStart, billingEnd: nextBillingCycleStart(now, state.billingDay), todayStart, cycleUsage, todayUsage, averageWindowDays: round(observedDays, 2), historicalAverageDaily },
  };
}

// Downsample old high-frequency snapshots (every ~5-10s) to one per minute.
// Groups snapshots by minute bucket, keeps the latest in each minute, deletes
// the rest. Only processes snapshots older than 1 hour to avoid touching live
// data. Idempotent — safe to run repeatedly (no-op once data is 1/min).
async function downsampleTomznSnapshots(snapshots) {
  const cutoff = Date.now() - 3_600_000;
  const groups = await snapshots.aggregate([
    { $match: { timestamp: { $lt: cutoff } } },
    { $sort: { timestamp: 1 } },
    { $group: {
        _id: { $floor: { $divide: ["$timestamp", 60_000] } },
        ids: { $push: "$_id" },
        count: { $sum: 1 },
    }},
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  let deleted = 0;
  for (const group of groups) {
    // ids are in ascending timestamp order (from the $sort), so the last one
    // is the latest snapshot in that minute — keep it, delete the rest.
    const deleteIds = group.ids.slice(0, -1);
    if (deleteIds.length > 0) {
      await snapshots.deleteMany({ _id: { $in: deleteIds } });
      deleted += deleteIds.length;
    }
  }
  return deleted;
}

function registerUnifiedSolarRoutes(app, db) {
  const stateCollection = db.collection("solar_engine_state");
  const snapshots = db.collection("solar_tomzn_snapshots");
  const allocations = db.collection("solar_usage_allocations");
  const manualLogs = db.collection("solar_manual_logs");
  const inverterSnapshots = db.collection("solar_inverter_snapshots");
  const weatherSnapshots = db.collection("solar_weather_snapshots");
  let pollInFlight = null;
  let inverterPollInFlight = null;
  let weatherPollInFlight = null;
  // In-memory live cache: holds the freshest TOMZN reading for dashboard display
  // without requiring a database write on every 5s poll. Reset to null on restart.
  const liveTomznRef = { value: null };

  const context = { stateCollection, snapshots, allocations, manualLogs, inverterSnapshots, weatherSnapshots, liveTomznRef };
  const pollTomzn = async ({ forcePersist = false, force = false } = {}) => {
    const now = Date.now();
    // Serve from in-memory live cache if fresh enough (avoids hitting Tuya on every 5s request).
    // `force` bypasses the cache so manual refresh / app-open always hits the device.
    if (!force && !forcePersist && liveTomznRef.value && now - liveTomznRef.value.timestamp < TOMZN_LIVE_MAX_AGE_MS) {
      return { record: liveTomznRef.value, allocatedDelta: 0 };
    }
    if (pollInFlight) return pollInFlight;
    pollInFlight = (async () => {
      const snapshot = await requestTomzn();
      const energyKwh = finiteNumber(snapshot.energyKwh);
      if (energyKwh == null || energyKwh < 0) throw new Error("TOMZN returned an invalid cumulative energy value");
      // Only persist to the database once per minute (or when explicitly forced by
      // changeover/manual-reading endpoints that need to close the billing interval).
      const latestStored = await snapshots.find({}).sort({ timestamp: -1 }).limit(1).next();
      const shouldPersist = forcePersist || !latestStored || now - latestStored.timestamp >= TOMZN_PERSIST_MIN_INTERVAL_MS;
      if (shouldPersist) {
        const result = await recordTomzn({ ...context, snapshot });
        liveTomznRef.value = result.record;
        return result;
      }
      // Live-only update: refresh the in-memory cache for the dashboard without
      // writing to the database or creating an allocation record.
      const state = await ensureState(stateCollection);
      const liveRecord = { ...snapshot, timestamp: now, energyKwh, activeMeter: state.activeMeter };
      liveTomznRef.value = liveRecord;
      return { state, record: liveRecord, allocatedDelta: 0 };
    })();
    try { return await pollInFlight; } finally { pollInFlight = null; }
  };
  const pollInverter = async ({ force = false } = {}) => {
    const latest = await inverterSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next();
    // `force` bypasses the 5s max-age guard so manual refresh / app-open always hits InverterZone.
    if (!process.env.INVERTERZONE_DEVICE_ID || (!force && latest && Date.now() - latest.timestamp < INVERTER_POLL_MAX_AGE_MS)) return latest;
    if (inverterPollInFlight) return inverterPollInFlight;
    inverterPollInFlight = requestInverterZone()
      .then(async (snapshot) => {
        if (snapshot) await inverterSnapshots.updateOne(
          { timestamp: snapshot.timestamp },
          { $set: snapshot },
          { upsert: true }
        );
        return snapshot;
      })
      .catch(async (error) => {
        // Network error / timeout / non-2xx — store an offline snapshot so
        // "last fetched" keeps updating and the user can see we're still polling.
        // Don't just return stale data silently.
        console.error("[Solar Engine] inverter poll failed:", error.message);
        const offline = makeOfflineInverterSnapshot();
        await inverterSnapshots.updateOne(
          { timestamp: offline.timestamp },
          { $set: offline },
          { upsert: true }
        );
        return offline;
      })
      .finally(() => { inverterPollInFlight = null; });
    return inverterPollInFlight;
  };
  const pollWeather = async () => {
    const latest = await weatherSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next();
    if (latest && Date.now() - latest.timestamp < WEATHER_POLL_MAX_AGE_MS) return latest;
    if (weatherPollInFlight) return weatherPollInFlight;
    weatherPollInFlight = requestWeather()
      .then(async (snapshot) => { await weatherSnapshots.insertOne(snapshot); return snapshot; })
      .catch(() => latest)
      .finally(() => { weatherPollInFlight = null; });
    return weatherPollInFlight;
  };

  stateCollection.createIndex({ updatedAt: -1 }).catch(() => {});
  snapshots.createIndex({ timestamp: -1 }).catch(() => {});
  allocations.createIndex({ meterId: 1, timestamp: -1 }).catch(() => {});
  allocations.createIndex({ timestamp: -1 }).catch(() => {});
  manualLogs.createIndex({ timestamp: -1 }).catch(() => {});
  inverterSnapshots.createIndex({ timestamp: -1 }).catch(() => {});
  weatherSnapshots.createIndex({ timestamp: -1 }).catch(() => {});

  app.get("/api/solar/dashboard", async (req, res) => {
    try {
      if (req.query.refresh !== "false") await Promise.all([pollTomzn(), pollInverter(), pollWeather()]);
      res.json(await buildDashboard(context));
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  app.post("/api/solar/refresh", async (req, res) => {
    try {
      const force = req.query.force === "true";
      const [recorded] = await Promise.all([pollTomzn({ force }), pollInverter({ force }), pollWeather()]);
      res.json({ allocatedDelta: recorded.allocatedDelta, dashboard: await buildDashboard(context) });
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  // Force-refresh only TOMZN (bypasses 5s live-cache guard).
  app.post("/api/solar/refresh/tomzn", async (req, res) => {
    try {
      const force = req.query.force === "true";
      await pollTomzn({ force });
      res.json({ dashboard: await buildDashboard(context) });
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  // Force-refresh only the inverter (bypasses 5s max-age guard).
  app.post("/api/solar/refresh/inverter", async (req, res) => {
    try {
      const force = req.query.force === "true";
      await pollInverter({ force });
      res.json({ dashboard: await buildDashboard(context) });
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  app.post("/api/solar/changeover", async (req, res) => {
    try {
      const meterId = req.body?.meterId;
      if (!METER_IDS.has(meterId)) return res.status(400).json({ error: "meterId must be meter1 or meter2" });
      await pollTomzn({ forcePersist: true }); // close the current interval before switching its ownership
      const state = await ensureState(stateCollection);
      const timestamp = clientActionTimestamp(req.body?.timestamp);
      await applyHistoricalChangeover(allocations, state.activeMeter, meterId, timestamp);
      state.activeMeter = meterId;
      state.lastChangeoverAt = timestamp;
      state.updatedAt = Date.now();
      await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, state);
      res.json(await buildDashboard(context));
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  app.post("/api/solar/manual-readings", async (req, res) => {
    try {
      const meterId = req.body?.meterId;
      const reading = finiteNumber(req.body?.reading);
      if (!METER_IDS.has(meterId) || reading == null || reading < 0) return res.status(400).json({ error: "A valid meterId and non-negative reading are required" });
      const recorded = await pollTomzn({ forcePersist: true });
      const state = recorded.state;
      const timestamp = clientActionTimestamp(req.body?.timestamp);
      const meter = state.meters[meterId];
      const oldAnchor = meter.anchorReading;
      const anchorAt = meter.anchorAt || state.lastChangeoverAt;
      const rawUsageSinceAnchor = await meterUsageSince(allocations, meterId, anchorAt, timestamp);
      const ratioBefore = meterRatio(meter);
      const predictedReading = round((oldAnchor ?? meter.cycleBaselineReading) + calibratedUnits(meter, rawUsageSinceAnchor), 2);
      const actualUsageSinceAnchor = round(reading - (oldAnchor ?? meter.cycleBaselineReading), 3);
      const calibration = learnMeterRatio(meter, rawUsageSinceAnchor, actualUsageSinceAnchor, timestamp);
      meter.anchorReading = reading;
      meter.anchorAt = timestamp;
      meter.lastManualCorrection = round(reading - predictedReading, 2);
      state.updatedAt = timestamp;
      await manualLogs.insertOne({
        id: `${meterId}-${timestamp}`,
        meterId,
        reading,
        timestamp,
        notes: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 500) : undefined,
        source: "MANUAL",
        tomznEnergyKwh: state.lastTomzn?.energyKwh ?? null,
        predictedReading,
        correction: round(reading - predictedReading, 2),
        rawTomznUsageSinceAnchor: rawUsageSinceAnchor,
        actualMeterUsageSinceAnchor: actualUsageSinceAnchor,
        meterRatioBefore: ratioBefore,
        learnedRatio: calibration?.ratio ?? null,
        calibrationSampleRatio: calibration?.sampleRatio ?? null,
        anchorAt: timestamp,
      });
      await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, state);
      res.status(201).json(await buildDashboard(context));
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  app.patch("/api/solar/manual-readings/:id", async (req, res) => {
    try {
      const reading = finiteNumber(req.body?.reading);
      if (reading == null || reading < 0) return res.status(400).json({ error: "A non-negative reading is required" });
      const log = await manualLogs.findOne({ id: req.params.id });
      if (!log) return res.status(404).json({ error: "Manual reading not found" });
      const state = await ensureState(stateCollection);
      const latest = await manualLogs.find({ meterId: log.meterId }).sort({ timestamp: -1 }).limit(1).next();
      if (latest?.id === log.id) state.meters[log.meterId].anchorReading = reading;
      await manualLogs.updateOne({ id: log.id }, { $set: {
        reading,
        notes: typeof req.body?.notes === "string" ? req.body.notes.slice(0, 500) : log.notes,
        editedAt: Date.now(),
      } });
      state.updatedAt = Date.now();
      await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, state);
      res.json(await buildDashboard(context));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.delete("/api/solar/manual-readings/:id", async (req, res) => {
    try {
      const log = await manualLogs.findOne({ id: req.params.id });
      if (!log) return res.status(404).json({ error: "Manual reading not found" });
      const state = await ensureState(stateCollection);
      const latest = await manualLogs.find({ meterId: log.meterId }).sort({ timestamp: -1 }).limit(1).next();
      await manualLogs.deleteOne({ id: log.id });
      if (latest?.id === log.id) {
        const prior = await manualLogs.find({ meterId: log.meterId }).sort({ timestamp: -1 }).limit(1).next();
        const meter = state.meters[log.meterId];
        // Revert anchor to prior reading (or cycle baseline if none)
        meter.anchorReading = prior?.reading ?? meter.cycleBaselineReading;
        meter.anchorAt = prior?.anchorAt ?? meter.cycleBaselineAt;
        // Revert calibration data to what it was before this reading
        if (log.meterRatioBefore != null) {
          meter.tomznToMeterRatio = log.meterRatioBefore;
        }
        if (prior) {
          // Restore correction from the prior log
          meter.lastManualCorrection = finiteNumber(prior.correction, 0);
        } else {
          // No prior logs — reset to defaults
          meter.lastManualCorrection = 0;
          meter.calibrationTomznUnits = 0;
          meter.calibrationMeterUnits = 0;
          meter.ratioObservationCount = 0;
          meter.tomznToMeterRatio = 1;
        }
      }
      state.updatedAt = Date.now();
      await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, state);
      res.json(await buildDashboard(context));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/solar/baselines", async (req, res) => {
    try {
      const meterId = req.body?.meterId;
      const reading = finiteNumber(req.body?.reading);
      if (!METER_IDS.has(meterId) || reading == null || reading < 0) return res.status(400).json({ error: "A valid meterId and non-negative reading are required" });
      await pollTomzn();
      const state = await ensureState(stateCollection);
      // Billing readings are always anchored to the configured 28th, never to
      // the day a phone happens to submit the settings form.
      // Only update the cycle baseline — do NOT touch anchorReading/anchorAt,
      // which track the live current reading from manual logs / TOMZN.
      const at = billingCycleStart(Date.now(), state.billingDay);
      const meter = state.meters[meterId];
      const oldBaseline = meter.cycleBaselineReading;
      const baselineDelta = reading - oldBaseline;
      meter.cycleBaselineReading = reading;
      meter.cycleBaselineAt = at;
      // Shift the anchor by the same delta so the live reading stays consistent
      // (the current reading doesn't jump when the baseline is corrected).
      if (meter.anchorReading != null && Number.isFinite(baselineDelta)) {
        meter.anchorReading = round(meter.anchorReading + baselineDelta, 2);
      }
      state.updatedAt = Date.now();
      await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, state);
      res.json(await buildDashboard(context));
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  // Manual override for last month's total units used (for trend comparison)
  app.post("/api/solar/last-month-total", async (req, res) => {
    try {
      const total = finiteNumber(req.body?.total);
      if (total == null || total < 0) return res.status(400).json({ error: "A non-negative total is required" });
      const state = await ensureState(stateCollection);
      state.lastMonthTotalOverride = total;
      state.updatedAt = Date.now();
      await stateCollection.replaceOne({ _id: PRIMARY_STATE_ID }, state);
      res.json(await buildDashboard(context));
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  // Compatibility for existing installs. New clients should use /dashboard.
  app.get("/api/solar/sync", async (_req, res) => {
    try {
      const dashboard = await buildDashboard(context);
      res.json({ ...dashboard, logs: dashboard.manualLogs, baselines: {} });
    } catch (error) { res.status(500).json({ error: error.message }); }
  });
  app.get("/api/solar/tomzn/history", async (_req, res) => {
    const history = await snapshots.find({ timestamp: { $gte: Date.now() - 30 * 86_400_000 } }).sort({ timestamp: 1 }).toArray();
    res.json(history.map(({ _id, ...row }) => row));
  });
  app.get("/api/solar/tomzn/cron", async (_req, res) => {
    try { await pollTomzn(); res.json({ triggered: true }); } catch (error) { res.status(502).json({ error: error.message }); }
  });
  // Dedicated endpoint for today's flow history (solar/grid/load kW per sample).
  // Resets at Pakistan midnight so the graph starts fresh each day.
  // Filters out offline snapshots (isOnline === false) so they don't create
  // zero-drops in the flow graph. Supplements with TOMZN data for periods when
  // the inverter was off (bypass mode) so the graph shows grid energy.
  app.get("/api/solar/flow-history", async (_req, res) => {
    try {
      const now = Date.now();
      const todayStart = startOfPakistanDay(now);
      const [invHistory, tomznHistory] = await Promise.all([
        inverterSnapshots.find({ timestamp: { $gte: todayStart, $lte: now } }).sort({ timestamp: 1 }).limit(5_000).toArray(),
        snapshots.find({ timestamp: { $gte: todayStart, $lte: now } }).sort({ timestamp: 1 }).limit(5_000).toArray(),
      ]);
      const FLOW_BUCKET_MS = 5 * 60_000;
      const flowBuckets = new Map();
      // Inverter data — primary source
      for (const sample of invHistory.filter((s) => s.isOnline !== false)) {
        const bucket = Math.floor(sample.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
        const existing = flowBuckets.get(bucket);
        if (!existing || sample.timestamp > existing.timestamp) {
          flowBuckets.set(bucket, sample);
        }
      }
      // TOMZN supplement — fill buckets where inverter was off
      for (const sample of tomznHistory) {
        const bucket = Math.floor(sample.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
        if (!flowBuckets.has(bucket)) {
          flowBuckets.set(bucket, {
            timestamp: sample.timestamp,
            solarW: 0,
            gridW: 0,
            loadW: 0,
            _tomznPowerW: Math.max(0, sample.powerW || 0),
          });
        }
      }
      res.json(Array.from(flowBuckets.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((sample) => ({
          timestamp: sample.timestamp,
          solarKw: round(sample.solarW / 1000, 3),
          gridKw: (sample.gridV > 0 && sample.gridW >= 200)
            ? round(sample.gridW / 1000, 3)
            : round((sample._tomznPowerW || 0) / 1000, 3),
          loadKw: sample.loadW > 0
            ? round(sample.loadW / 1000, 3)
            : round((sample._tomznPowerW || 0) / 1000, 3),
        })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // Polling is server-owned. It continues while the phone is closed.
  // Poll every 60 seconds so the database collects one snapshot per minute even
  // when the app is closed (the 5s live-cache guard prevents over-polling Tuya
  // when the frontend is also requesting refreshes).
  setTimeout(() => pollTomzn().catch((error) => console.error("[Solar Engine] initial TOMZN poll failed:", error.message)), 2_000);
  setInterval(() => pollTomzn().catch((error) => console.error("[Solar Engine] TOMZN poll failed:", error.message)), 60_000);

  // One-time downsample of legacy high-frequency (every ~5-10s) snapshots to
  // one per minute. Runs shortly after startup so the DB shrinks immediately.
  setTimeout(() => {
    downsampleTomznSnapshots(snapshots)
      .then((deleted) => { if (deleted > 0) console.log(`[Solar Engine] downsampled ${deleted} legacy TOMZN snapshots to 1/min`); })
      .catch((error) => console.error("[Solar Engine] initial downsample failed:", error.message));
  }, 5_000);

  // Server-side inverter polling — collects data even when the app is closed.
  // Poll every 60 seconds (the 5s max-age guard in pollInverter prevents over-polling
  // when the frontend is also requesting refreshes).
  setTimeout(() => pollInverter().catch((error) => console.error("[Solar Engine] initial inverter poll failed:", error.message)), 3_000);
  setInterval(() => pollInverter().catch((error) => console.error("[Solar Engine] inverter poll failed:", error.message)), 60_000);

  // Cleanup: delete inverter snapshots older than today's start (flow graph is
  // today-only, resets at Pakistan midnight). Old inverter data is not used
  // anywhere else, so it's safe to delete.
  // TOMZN snapshots are kept for 30 days — they're needed for billing cycle calculations,
  // load status history, daily/hourly summaries, and the /tomzn/history endpoint.
  // Weather snapshots older than 7 days are also pruned (only the latest is ever used).
  // Also re-runs the downsample as a safety net in case any high-frequency data
  // was written before the throttling took effect.
  setInterval(async () => {
    try {
      const inverterCutoff = startOfPakistanDay(Date.now());
      const tomznCutoff = Date.now() - 30 * 86_400_000;
      const weatherCutoff = Date.now() - 7 * 86_400_000;
      await inverterSnapshots.deleteMany({ timestamp: { $lt: inverterCutoff } });
      await snapshots.deleteMany({ timestamp: { $lt: tomznCutoff } });
      await weatherSnapshots.deleteMany({ timestamp: { $lt: weatherCutoff } });
      await downsampleTomznSnapshots(snapshots);
    } catch (error) {
      console.error("[Solar Engine] cleanup failed:", error.message);
    }
  }, 3_600_000);

  try {
    const cron = require("node-cron");
    cron.schedule("0 12 28 * *", () => {
      pollTomzn().catch((error) => console.error("[Solar Engine] 28th baseline rollover failed:", error.message));
    }, { timezone: "Asia/Karachi" });
  } catch (error) {
    console.error("[Solar Engine] monthly baseline scheduler unavailable:", error.message);
  }
  console.log("[Solar Engine] unified TOMZN allocation routes registered");
}

module.exports = { registerUnifiedSolarRoutes };
