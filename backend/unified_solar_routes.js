"use strict";

/**
 * The solar dashboard has one source of truth: TOMZN's cumulative kWh reading.
 * Every positive delta is written once to the allocation ledger and assigned to
 * the meter that was active at that moment. Manual meter readings never replace
 * TOMZN usage; they reconcile the displayed physical-meter reading from then on.
 */

const http = require("http");
const https = require("https");
const { execFile } = require("child_process");
const path = require("path");

const PRIMARY_STATE_ID = "primary";
const METER_IDS = new Set(["meter1", "meter2"]);
const PAKISTAN_OFFSET = "+05:00";
const INVERTER_LOCAL_HOST = "113.203.197.44";
const INVERTER_LOCAL_PORT = 3286;
const INVERTER_POLL_MAX_AGE_MS = 3_000;
// Live cache is refreshed at most every 3s so the dashboard stays responsive
// without hitting Tuya on every frontend poll.
const TOMZN_LIVE_MAX_AGE_MS = 3_000;
// Stale-data detection: when TOMZN's WiFi dies, the local Tuya poll fails.
// We track consecutive poll failures — after TOMZN_FAIL_THRESHOLD failures,
// we mark the device offline. The fingerprint approach also catches the case
// where the poll succeeds but returns identical cached values.
// Secondary signal: when the inverter switches to battery mode (QMOD="B"),
// the grid is down, which means TOMZN (grid meter) is also offline.
//
// STANDBY EXEMPTION: When the user manually turns the TOMZN switch OFF
// (standby / intentional grid cut), the device stays accessible and replies
// to polls — it just reports 0V/0A/0W. Both the fingerprint detection and
// the inverter battery-mode cross-check are SKIPPED when switchOn is false,
// so the device remains "online" and the frontend shows "Standby" (yellow)
// instead of "Offline" (red). True offline only triggers after 10 consecutive
// poll failures (device truly unreachable).
const TOMZN_STALE_THRESHOLD = 10;
const TOMZN_FAIL_THRESHOLD = 10;
const tomznStaleTracker = { fingerprint: null, count: 0, failCount: 0 };
// Seed the stale tracker from the database on startup so we don't restart the
// 10-count from zero every time the backend restarts or the app reopens.
// Checks the last N stored snapshots — if their fingerprints are identical,
// sets the counter so stale detection picks up where it left off.
async function seedStaleTrackerFromDb(snapshots) {
  try {
    const recent = await snapshots.find({}).sort({ timestamp: -1 }).limit(TOMZN_STALE_THRESHOLD).toArray();
    if (recent.length === 0) return;
    // STANDBY EXEMPTION: If the latest snapshot has switchOn === false, the
    // device was intentionally put in standby (manual grid cut). Identical
    // zero readings are expected in standby — don't seed the stale counter,
    // otherwise the device would be marked offline immediately on restart.
    if (recent[0].switchOn === false) {
      console.log("[Solar Engine] stale tracker: latest snapshot is standby (switchOff) — skipping seed");
      return;
    }
    const fp = (s) => `${s.energyKwh}|${s.powerW}|${s.voltageV}|${s.currentA}`;
    const latestFp = fp(recent[0]);
    let identicalCount = 0;
    for (const s of recent) {
      if (fp(s) === latestFp) identicalCount += 1;
      else break;
    }
    tomznStaleTracker.fingerprint = latestFp;
    tomznStaleTracker.count = identicalCount - 1; // latest is count 0; N-1 prior identical
    if (identicalCount >= TOMZN_STALE_THRESHOLD) {
      console.log(`[Solar Engine] stale tracker seeded: ${identicalCount} identical snapshots — TOMZN marked offline immediately`);
    } else if (identicalCount > 1) {
      console.log(`[Solar Engine] stale tracker seeded: ${identicalCount - 1} consecutive identical (need ${TOMZN_STALE_THRESHOLD})`);
    }
  } catch (error) {
    console.error("[Solar Engine] stale tracker seed failed:", error.message);
  }
}
// Snapshots are persisted to the database at most once per minute to avoid
// excessive storage growth (previously every ~5-10s).
const TOMZN_PERSIST_MIN_INTERVAL_MS = 60_000;
const INVERTER_PERSIST_MIN_INTERVAL_MS = 60_000;
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

// ── Grid flow determination ──────────────────────────────────────────────
// The system has two physical modes determined by a changeover switch:
//
//   HYBRID (changeover → inverter): home loads fed by the inverter's AC output.
//     loadW (acOutW) = total home consumption. Direction = loadW vs solarW
//     (energy balance). HARD RULE: loadW > 25W → hybrid. The inverter's load
//     output is either connected to home (loadW = real consumption) or not
//     (loadW ≈ 0-12W jitter). 25W cleanly separates the two — no plausibility
//     check needed.
//
//   ON-GRID (changeover → WAPDA): home loads fed by WAPDA directly. The
//     inverter's WAPDA grid input is a SEPARATE switch (still on), so solar
//     injects into the WAPDA bus: first offsets home, excess flows back through
//     the Tomzn meter. loadW ≤ 25W (jitter) because the inverter's load output
//     isn't connected to home. home = solarW ± tomznPowerW (Tomzn is unsigned).
//
//     Direction detection (4 signals, strongest first):
//       1. HARD RULE: tomzn > solar → import (export is always < solar).
//       2. INVERTER GRID DIRECTION: gridWRaw < -50 with solar > 100 → export.
//          The inverter directly reports feeding back. Trustworthy because
//          Signal 1 already caught tomzn > solar.
//       3. CORRELATION: solar↑ + tomzn↑ → export, solar↑ + tomzn↓ → import.
//       4. Zero-crossing fallback for near-zero grid flow.
//
//   BYPASS (inverter off): home = tomznPowerW, import.
//   NIGHT (no solar): home = tomznPowerW or loadW, import.

const ON_GRID_LOAD_THRESHOLD_W = 25;   // loadW above this → hybrid mode (hard rule)
const SOLAR_PRODUCING_THRESHOLD_W = 5; // solarW below this → no solar
const ENERGY_BALANCE_THRESHOLD_W = 50; // |loadW - solarW| margin for hybrid direction
const NEAR_ZERO_W = 15;                // tomznPowerW at/below this → at the crossing point
const RECENT_WINDOW_MS = 6 * 60_000;   // rolling window for on-grid trend analysis

// Create a fresh grid-flow state tracker (used for real-time billing/live and
// reconstructed fresh for each historical flow-graph pass).
function createGridFlowState() {
  return { lastDirection: "import", atCrossing: false, crossingFromDirection: null, recentPowers: [] };
}

// Update the on-grid direction using THREE signals, strongest first:
//
//   SIGNAL 1 — HARD RULE: tomzn > solar → definitely import.
//     Export = solarW - home is always < solarW (home > 0), so tomzn > solar
//     can't be export. This catches the original bug (solar=120, tomzn=500).
//
//   SIGNAL 2 — INVERTER GRID DIRECTION: the Fronus inverter directly reports
//     whether it's feeding power back to the grid (gridFeed > 0 → "export",
//     gridWRaw < 0). This is the most direct signal — the inverter KNOWS. It's
//     trustworthy here because Signal 1 already filtered out the dangerous case
//     (small trickle with low solar + high tomzn). Only trust when solar is
//     substantial (> 100W) and |gridWRaw| is meaningful (> 50W, not jitter).
//
//   SIGNAL 3 — CORRELATION: how tomznW changes relative to solarW over time.
//     EXPORT: tomzn = solar - home → tomzen tracks solar (positive correlation)
//       solar↑ → tomzn↑ (more excess), solar↓ → tomzn↓ (less excess)
//     IMPORT: tomzn = home - solar → tomzen inversely tracks solar (negative)
//       solar↑ → tomzn↓ (solar covers more), solar↓ → tomzn↑ (more grid needed)
//
//   SIGNAL 4 — Zero-crossing fallback for near-zero grid flow.
function updateOnGridDirection(inverter, solarW, tomznW, state, now) {
  // Track (solarW, tomznW) pairs for correlation analysis.
  state.recentPowers = (state.recentPowers || [])
    .filter((p) => now - p.timestamp < RECENT_WINDOW_MS)
    .concat([{ solarW, powerW: tomznW, timestamp: now }]);

  // SIGNAL 1 — HARD RULE: tomzn > solar → definitely import.
  if (tomznW > solarW + NEAR_ZERO_W) {
    state.lastDirection = "import";
    state.atCrossing = false;
    state.crossingFromDirection = null;
    return "import";
  }

  // When tomznW is 0, TOMZN might be offline (not zero draw). In that case,
  // gridWRaw is unreliable — the grid may be down. Default to import (safe).
  if (tomznW <= 0) {
    state.lastDirection = "import";
    state.atCrossing = false;
    return "import";
  }

  // SIGNAL 2 — INVERTER GRID DIRECTION: direct signal from the inverter.
  // Trustworthy here because Signal 1 already caught the dangerous case
  // (tomzn > solar). Now tomzn ≤ solar, so solar is at least as big as the
  // grid flow — a genuine export signal from the inverter is reliable.
  const gridWRaw = finiteNumber(inverter?.gridWRaw, 0);
  const gridDirection = inverter?.gridDirection || "import";
  if (solarW > 100 && Math.abs(gridWRaw) > 50) {
    if (gridDirection === "export" || gridWRaw < -50) {
      state.lastDirection = "export";
      state.atCrossing = false;
      state.crossingFromDirection = null;
      return "export";
    }
    if (gridDirection === "import" && gridWRaw > 50) {
      state.lastDirection = "import";
      state.atCrossing = false;
      state.crossingFromDirection = null;
      return "import";
    }
  }

  // SIGNAL 3 — CORRELATION: solar vs tomzn trend over the last 30s.
  // Need at least 4 samples with meaningful changes for a reliable read.
  const recent = state.recentPowers || [];
  if (recent.length >= 4) {
    const cutoff = now - 30_000;
    const samples = recent.filter((p) => p.timestamp >= cutoff);
    if (samples.length >= 4) {
      let posCorr = 0, negCorr = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const dSolar = samples[i].solarW - samples[i - 1].solarW;
        const dTomzn = samples[i].powerW - samples[i - 1].powerW;
        if (Math.abs(dSolar) < 10 && Math.abs(dTomzn) < 10) continue;
        if ((dSolar > 10 && dTomzn > 10) || (dSolar < -10 && dTomzn < -10)) posCorr += 1;
        else if ((dSolar > 10 && dTomzn < -10) || (dSolar < -10 && dTomzn > 10)) negCorr += 1;
      }
      if (posCorr + negCorr >= 2) {
        const direction = posCorr > negCorr ? "export" : "import";
        state.lastDirection = direction;
        state.atCrossing = false;
        state.crossingFromDirection = null;
        return direction;
      }
    }
  }

  // SIGNAL 4 — Zero-crossing fallback: near-zero = at the crossing point.
  if (tomznW <= NEAR_ZERO_W) {
    if (!state.atCrossing) {
      state.atCrossing = true;
      state.crossingFromDirection = state.lastDirection;
    }
    return state.lastDirection;
  }
  if (state.atCrossing && tomznW > NEAR_ZERO_W + 10) {
    state.lastDirection = state.crossingFromDirection === "export" ? "import" : "export";
    state.atCrossing = false;
    state.crossingFromDirection = null;
    return state.lastDirection;
  }

  // No strong signal — maintain last direction, default import (conservative).
  if (!state.lastDirection) state.lastDirection = "import";
  return state.lastDirection;
}

// Determine grid flow for a single snapshot. Returns:
//   { mode, direction, homeW, gridExchangeW, isExporting }
//   mode: "hybrid" | "on-grid" | "bypass" | "night"
//   direction: "import" | "export" | "idle"
//   homeW: computed home consumption (W)
//   gridExchangeW: signed grid exchange (+ = import, - = export)
//   isExporting: boolean (true only when direction === "export")
//
// `flowState` is a persistent state object from createGridFlowState(); pass
// null to skip on-grid trend tracking (falls back to conservative import).
function determineGridFlow(inverter, tomznPowerW, flowState, now) {
  now = now || Date.now();
  const inverterOnline = inverter && inverter.isOnline !== false;
  const solarW = finiteNumber(inverter?.solarW, 0);
  const loadW = finiteNumber(inverter?.loadW, 0);
  const tomznW = Math.max(0, finiteNumber(tomznPowerW, 0));

  // BYPASS: inverter offline → grid feeds home directly via changeover/bypass.
  if (!inverterOnline) {
    if (tomznW > 0) return { mode: "bypass", direction: "import", homeW: tomznW, gridExchangeW: tomznW, isExporting: false };
    return { mode: "bypass", direction: "idle", homeW: 0, gridExchangeW: 0, isExporting: false };
  }

  // NIGHT: no solar production → grid feeds home. If loadW > 25W the inverter
  // is passing grid through to home (hybrid night mode). Otherwise on-grid night.
  if (solarW < SOLAR_PRODUCING_THRESHOLD_W) {
    if (loadW >= ON_GRID_LOAD_THRESHOLD_W) {
      return { mode: "hybrid", direction: "import", homeW: loadW, gridExchangeW: Math.max(0, loadW - solarW), isExporting: false };
    }
    if (tomznW > 0) return { mode: "night", direction: "import", homeW: tomznW, gridExchangeW: tomznW, isExporting: false };
    return { mode: "night", direction: "idle", homeW: 0, gridExchangeW: 0, isExporting: false };
  }

  // HYBRID: loadW > 25W → inverter is feeding home. This is a HARD RULE — the
  // inverter's load output is either connected to home (hybrid, loadW = real
  // consumption) or not (on-grid, loadW ≈ 0-12W jitter). 25W cleanly separates
  // the two. No plausibility check needed — if the inverter reports 302W on its
  // load output, that IS home consumption. Direction from energy balance:
  // loadW vs solarW.
  if (loadW >= ON_GRID_LOAD_THRESHOLD_W) {
    const balance = loadW - solarW;
    if (balance > ENERGY_BALANCE_THRESHOLD_W) {
      if (flowState) { flowState.lastDirection = "import"; flowState.atCrossing = false; }
      return { mode: "hybrid", direction: "import", homeW: loadW, gridExchangeW: balance, isExporting: false };
    }
    if (balance < -ENERGY_BALANCE_THRESHOLD_W) {
      // Excess solar (solarW > loadW). Check inverter's grid signal for direction.
      // TOMZN powerW is always positive (counts both import and export), so we
      // can't use it for direction — rely on the inverter's gridWRaw/gridDirection.
      const gridWRaw = finiteNumber(inverter?.gridWRaw, 0);
      const gridDirection = inverter?.gridDirection || "import";
      if (gridDirection === "export" || gridWRaw < -50) {
        if (flowState) { flowState.lastDirection = "export"; flowState.atCrossing = false; }
        return { mode: "hybrid", direction: "export", homeW: loadW, gridExchangeW: balance, isExporting: true };
      }
      // Inverter doesn't confirm export. If TOMZN is online with power flowing,
      // it's likely import (home drawing from grid despite high solar).
      if (tomznW > 0) {
        if (flowState) { flowState.lastDirection = "import"; flowState.atCrossing = false; }
        return { mode: "hybrid", direction: "import", homeW: loadW, gridExchangeW: Math.max(0, loadW - solarW), isExporting: false };
      }
      // TOMZN offline, inverter doesn't confirm export — idle (solar covering home)
      if (flowState) { flowState.lastDirection = "import"; flowState.atCrossing = false; }
      return { mode: "hybrid", direction: "idle", homeW: loadW, gridExchangeW: 0, isExporting: false };
    }
    if (flowState) { flowState.lastDirection = "import"; flowState.atCrossing = false; }
    return { mode: "hybrid", direction: "idle", homeW: loadW, gridExchangeW: 0, isExporting: false };
  }

  // ON-GRID: loadW ≤ 25W, solar producing, inverter online. Home powered by
  // WAPDA via changeover; inverter injects solar to the WAPDA bus. home =
  // solarW ± tomznW (sign from multi-signal direction detection). loadW ≈ 0.
  const direction = flowState
    ? updateOnGridDirection(inverter, solarW, tomznW, flowState, now)
    : (tomznW > solarW + NEAR_ZERO_W ? "import" : "import"); // no state → conservative
  // Physical guard: export can NEVER exceed solar production. If tomzn reports
  // more power than solar is producing (tomznW > solarW), it cannot be export —
  // home is drawing grid + solar (import). This catches any direction-detection
  // edge case (stale zero-crossing state, inverter gridWRaw noise) that wrongly
  // says "export" when tomzn > solar. Without this, the UI would show e.g. 800W
  // export from 600W solar — impossible. Forces import: home = solarW + tomznW.
  if (direction === "export" && tomznW > solarW) {
    if (flowState) { flowState.lastDirection = "import"; flowState.atCrossing = false; }
    return { mode: "on-grid", direction: "import", homeW: solarW + tomznW, gridExchangeW: tomznW, isExporting: false };
  }
  if (direction === "export") {
    // Export magnitude is tomznW (≤ solarW from the guard above), so home =
    // solarW - tomznW is always ≥ 0. Export ≤ solar production.
    return { mode: "on-grid", direction: "export", homeW: solarW - tomznW, gridExchangeW: -tomznW, isExporting: true };
  }
  return { mode: "on-grid", direction: "import", homeW: solarW + tomznW, gridExchangeW: tomznW, isExporting: false };
}

// Build a set of export 5-minute buckets from a day's inverter + TOMZN history,
// processing samples in chronological order so the on-grid direction state
// machine tracks zero-crossings correctly across the day.
function buildExportBuckets(inverterSamples, tomznSamples, bucketMs) {
  const exportBuckets = new Set();
  const state = createGridFlowState();
  // Index tomzn samples by bucket for chronological lookup.
  const tomznByBucket = new Map();
  for (const s of (tomznSamples || [])) {
    if (s.powerW == null || s.powerW < 0) continue;
    const bucket = Math.floor(s.timestamp / bucketMs);
    const prev = tomznByBucket.get(bucket);
    if (!prev || s.timestamp > prev.timestamp) tomznByBucket.set(bucket, { powerW: s.powerW, timestamp: s.timestamp });
  }
  // Sort online inverter samples chronologically and determine direction for each.
  // Skip samples where inverter is in battery mode (B) — no grid to export to.
  const online = (inverterSamples || [])
    .filter((s) => s.isOnline !== false && s.inverterMode !== "B" && s.inverterMode !== "offline")
    .sort((a, b) => a.timestamp - b.timestamp);
  for (const sample of online) {
    const bucket = Math.floor(sample.timestamp / bucketMs);
    const tomznEntry = tomznByBucket.get(bucket);
    const flow = determineGridFlow(sample, tomznEntry?.powerW ?? null, state, sample.timestamp);
    if (flow.isExporting) exportBuckets.add(bucket);
  }
  return exportBuckets;
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
  const transport = (options.protocol === "http:" || options.port) ? http : https;
  return new Promise((resolve, reject) => {
    const request = transport.request(options, (response) => {
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

// ── Local inverter poller ──
// Connects directly to the Fronus inverter's web API at 113.203.197.44:3286
// (port-forwarded to 10.1.10.4:80). Returns real-time data every 3s instead of
// the 15s cloud delay from InverterZone.
// QPIGS format (InverterZone dongle firmware parseLive() mapping):
//   [0]AC_in_V  [1]AC_in_Hz  [2]AC_out_V  [3]AC_out_Hz
//   [4]AC_out_VA  [5]AC_out_W  [6]AC_out_load%  [7]home_load_W (not used by IZ FW)
//   [8]Bat_V  [9]Bat_Charge_A  [10]Bat_%  [11]Inv_Bus_Temp_C
//   [12]PV_Input_A  [13]PV_Input_V  [14](unused)  [15]Bat_Discharge_A
//   [16-18](unused)  [19]status_bitmask (NOT PV power despite IZ FW label)
// PVPOWER format (dual MPPT): pv1V pv1A pv1W pv2V pv2A pv2W ...
// QMOD: L=Line, B=Battery, S=Standby, F=Fault, P=PowerOn
const INVERTER_RATED_W = 10000;

async function requestInverterZone() {
  const response = await requestJson({
    hostname: INVERTER_LOCAL_HOST,
    port: INVERTER_LOCAL_PORT,
    path: "/livejson",
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!response || !response.LiveData) {
    return makeOfflineInverterSnapshot();
  }
  const live = response.LiveData;
  const esp = response.EspData || {};
  const dev = response.DeviceData || {};
  const qpigs = (live.QPIGS || "").split(/\s+/);
  const pvpower = (live.PVPOWER || "").split(/\s+/);

  if (qpigs.length < 16) {
    return makeOfflineInverterSnapshot();
  }

  const gridV = finiteNumber(qpigs[0], 0);
  const gridHz = finiteNumber(qpigs[1], 0);
  const acOutV = finiteNumber(qpigs[2], 0);
  const acOutHz = finiteNumber(qpigs[3], 0);
  const acOutVA = finiteNumber(qpigs[4], 0);
  const acOutW = finiteNumber(qpigs[5], 0);
  const loadPercent = finiteNumber(qpigs[6], 0);  // AC_out_load%
  const busV = finiteNumber(qpigs[7], 0);         // DC bus voltage (NOT home load!)
  const batteryV = finiteNumber(qpigs[8], 0);
  const batteryChargeA = finiteNumber(qpigs[9], 0);
  const batteryPerc = finiteNumber(qpigs[10], 0);
  const temperatureC = finiteNumber(qpigs[11], 0);  // heatsink temp
  const pvInputA = finiteNumber(qpigs[12], 0);      // PV1 input current

  // Dual MPPT solar from PVPOWER
  // Below 20W total, panels are effectively disconnected (phantom readings).
  const SOLAR_STANDBY_W = 20;
  const pv1W_raw = finiteNumber(pvpower[2], 0);
  const pv2W_raw = finiteNumber(pvpower[5], 0);
  const pv1V = finiteNumber(pvpower[0], 0);
  const pv2V = finiteNumber(pvpower[3], 0);
  const pv1A = finiteNumber(pvpower[1], 0);
  const pv2A = finiteNumber(pvpower[4], 0);
  const solarW_raw = pv1W_raw + pv2W_raw;
  const solarStandby = solarW_raw < SOLAR_STANDBY_W;
  const pv1W = solarStandby ? 0 : pv1W_raw;
  const pv2W = solarStandby ? 0 : pv2W_raw;
  const solarW = solarStandby ? 0 : solarW_raw;
  const solarV = solarStandby ? 0 : (pv1V + pv2V) / 2;
  const solarA = solarStandby ? 0 : pv1A + pv2A;

  // Grid power calculation:
  // HYBRID (acOutW >= 25W): inverter AC output powers the home.
  //   acOutW = home load. Grid flow = acOutW - solarW.
  //   If acOutW > solarW → import (grid supplies deficit).
  //   If acOutW < solarW → export (excess solar to grid).
  // ON-GRID (acOutW < 25W): home on changeover (WAPDA), inverter LOAD port
  //   disconnected (acOutW ≈ 0). Solar feeds GRID port directly.
  //   Grid flow = -solarW (all solar exports, home load is on grid separately).
  //   TOMZN meter measures the actual home draw from grid.
  const rawGridW = acOutW >= ON_GRID_LOAD_THRESHOLD_W
    ? acOutW - solarW    // hybrid: home load vs solar
    : -solarW;           // on-grid: solar exports to grid
  const gridW = (gridV > 0 && Math.abs(rawGridW) >= 200) ? Math.max(0, rawGridW) : 0;

  // QMOD mode mapping
  const modeMap = { L: "L", B: "B", S: "S", F: "F", P: "P" };
  const inverterMode = modeMap[live.QMOD] || "unknown";

  // Fault detection: QMOD="F" means the inverter is in fault state.
  // QPIWS contains warning/status bits that are non-zero during normal operation,
  // so we can't use it as a simple fault flag.
  const hasFault = live.QMOD === "F";

  // loadPercent from QPIGS[6] is the inverter's own load percentage

  const timestamp = Date.now();
  return {
    timestamp,
    fetchedAt: new Date(timestamp).toISOString(),
    isOnline: true,
    solarW: Math.max(0, solarW),
    solarV: Math.max(0, solarV),
    solarA: Math.max(0, solarA),
    pv1V: Math.max(0, pv1V),
    pv1A: Math.max(0, pv1A),
    pv1W: Math.max(0, pv1W),
    pv2V: Math.max(0, pv2V),
    pv2A: Math.max(0, pv2A),
    pv2W: Math.max(0, pv2W),
    gridW,
    gridWRaw: rawGridW,
    gridV,
    gridHz,
    gridConnected: gridV > 0,
    gridDirection: rawGridW < 0 ? "export" : "import",
    loadW: Math.max(0, acOutW),       // inverter AC output = home load (hybrid mode)
    loadVa: Math.max(0, acOutVA),
    loadPercent: Math.max(0, loadPercent),
    acOutV,
    acOutHz,
    inverterMode,
    inverterFault: hasFault ? "FAULT" : "NO",
    temperatureC,
    ratedOutputW: INVERTER_RATED_W,
    signal: finiteNumber(esp.Wifi_RSSI),
    firmware: dev.QVFW || null,
    sourceTime: null,
  };
}

// Offline snapshot — stored when InverterZone reports the device as offline or
// when the API request fails (network error, timeout). Keeps "last fetched"
// updating so the user can see polling is still active.
function makeOfflineInverterSnapshot() {
  const ts = Date.now();
  return {
    timestamp: ts,
    fetchedAt: new Date(ts).toISOString(),
    isOnline: false,
    solarW: 0,
    solarV: 0,
    solarA: 0,
    gridW: 0,
    gridWRaw: 0,
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
  // Clamp tightly to reduce accumulated error in meter projections.
  // Most Pakistani digital meters run 0.85-1.15 vs TOMZN; wider ranges
  // cause large swings in projected days left during offline estimation.
  return clamp(finiteNumber(meter?.tomznToMeterRatio, 1), 0.7, 1.3);
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

// Local Tuya poller — uses Python tinytuya to communicate directly with the
// TOMZN device over TCP (protocol v3.5), bypassing the Tuya cloud API entirely.
// This avoids IoT Core quota limits and provides unlimited local polling.
const TUYA_LOCAL_POLL_SCRIPT = path.join(__dirname, "tuya_local_poll.py");

function requestTomzn() {
  return new Promise((resolve, reject) => {
    execFile("python3", [TUYA_LOCAL_POLL_SCRIPT], { timeout: 10_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const msg = stderr.trim() || error.message;
        return reject(new Error(`TOMZN local poll failed: ${msg}`));
      }
      try {
        const data = JSON.parse(stdout.trim());
        if (data.error) return reject(new Error(`TOMZN local poll: ${data.error}`));
        resolve({
          energyKwh: data.energyKwh,
          voltageV: data.voltageV || 0,
          currentA: data.currentA || 0,
          powerW: data.powerW || 0,
          frequencyHz: data.frequencyHz || 50,
          isOnline: data.isOnline,
          switchOn: data.switchOn,
          faultCode: data.faultCode || 0,
          fetchedAt: data.fetchedAt,
        });
      } catch (parseErr) {
        reject(new Error(`TOMZN local poll: invalid JSON output`));
      }
    });
  });
}

function publicTomzn(snapshot) {
  if (!snapshot) {
    return { energyKwh: 0, voltageV: 0, currentA: 0, powerW: 0, powerDisplay: "-- W", frequencyHz: 50, isOnline: false, switchOn: false, faultCode: 0, fetchedAt: "", isLive: false };
  }
  const { _id, ...live } = snapshot;
  // When the TOMZN meter is offline (WAPDA cut off, WiFi dead, etc.), Tuya cloud
  // returns stale cached values. Zero out powerW/voltageV/currentA so downstream
  // consumers (determineGridFlow, overlay, dashboard) don't display phantom energy.
  const isOnline = snapshot.isOnline !== false;
  const faultCode = snapshot.faultCode || 0;
  const wapdaCutOff = faultCode === 2048 || faultCode === 8192;
  const gridOffline = !isOnline || wapdaCutOff;
  const safePowerW = gridOffline ? 0 : (snapshot.powerW || 0);
  const safeVoltageV = gridOffline ? 0 : (snapshot.voltageV || 0);
  const safeCurrentA = gridOffline ? 0 : (snapshot.currentA || 0);
  return {
    ...live,
    powerW: safePowerW,
    voltageV: safeVoltageV,
    currentA: safeCurrentA,
    powerDisplay: gridOffline ? "-- W" : (safePowerW >= 1000 ? `${(safePowerW / 1000).toFixed(2)} kW` : `${safePowerW} W`),
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

async function recordTomzn({ stateCollection, snapshots, allocations, inverterSnapshots, snapshot, billingFlowState }) {
  const now = Date.now();
  let state = await ensureState(stateCollection);
  state = await rolloverBillingCycle({ stateCollection, allocations }, state, now);
  const energyKwh = finiteNumber(snapshot.energyKwh);
  if (energyKwh == null || energyKwh < 0) throw new Error("TOMZN returned an invalid cumulative energy value");

  const previous = state.lastTomzn;
  const record = { ...snapshot, timestamp: now, energyKwh, activeMeter: state.activeMeter };
  await snapshots.insertOne(record);

  // Check if the home is currently exporting to the grid.
  // TOMZN can't distinguish import vs export — its cumulative counter increases
  // in both directions. When exporting, pause all meter allocations and energy
  // accumulation so meter readings and energy used don't increase.
  // determineGridFlow uses: loadW > 25W → hybrid (energy balance loadW vs
  // solarW); loadW ≤ 25W → on-grid (4-signal direction detection: hard rule,
  // inverter gridWRaw, correlation, zero-crossing). Conservative: leans import
  // to avoid losing billing data on a wrong export call.
  const latestInverter = await inverterSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next();
  const flow = determineGridFlow(latestInverter, snapshot.powerW, billingFlowState, now);
  const isExporting = flow.isExporting;

  // lastImportEnergyKwh: the TOMZN cumulative reading at the last non-export
  // persist. Frozen during export so the next import-period delta excludes the
  // export-period counter increase. Falls back to lastTomzn.energyKwh for
  // backward compatibility with states that don't have this field yet.
  const lastImportEnergyKwh = state.lastImportEnergyKwh ?? previous?.energyKwh ?? energyKwh;

  let allocatedDelta = 0;
  if (!isExporting) {
    // Counter reset detection: if energyKwh dropped below lastImportEnergyKwh,
    // the TOMZN meter was reset (e.g. factory reset, firmware update). Start
    // fresh from the new value — don't create a negative delta. Old readings
    // are preserved in the allocations + snapshots collections.
    if (energyKwh >= lastImportEnergyKwh) {
      const delta = round(energyKwh - lastImportEnergyKwh);
      // Deltas larger than 50 units in one poll are a counter replacement/reset issue,
      // not household consumption. Keep the snapshot but wait for a manual reconciliation.
      if (delta > 0 && delta <= 50) {
        allocatedDelta = delta;
        await allocations.insertOne({
          timestamp: now,
          fromTimestamp: previous?.timestamp || now,
          meterId: state.activeMeter,
          delta,
          startEnergyKwh: lastImportEnergyKwh,
          endEnergyKwh: energyKwh,
          source: "TOMZN",
        });
      }
    }
    // Update lastImportEnergyKwh to current reading (only when not exporting).
    // This is the base for the next import-period delta calculation.
    state.lastImportEnergyKwh = energyKwh;
  }
  // When exporting: don't create allocation, don't update lastImportEnergyKwh.
  // The TOMZN counter still increases during export, but we exclude that increase
  // by keeping lastImportEnergyKwh frozen at the pre-export value. When export
  // ends, the delta = energyKwh - lastImportEnergyKwh only counts the actual
  // import increase since the pre-export reading.

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

async function buildDashboard({ stateCollection, allocations, snapshots, manualLogs, inverterSnapshots, weatherSnapshots, liveTomznRef, liveFlowState }) {
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
    // 7 days of inverter snapshots — used for the 24h flow graph (filtered
    // later) AND export subtraction on the 7-day daily usage chart.
    // Limit 20,000 is a safety net — with the 60s persist throttle, only ~1,440
    // snapshots/day are saved (10,080 for 7 days). The downsample also cleans
    // up legacy high-freq data.
    inverterSnapshots.find({ timestamp: { $gte: now - 7 * 86_400_000, $lte: now } }).sort({ timestamp: 1 }).limit(20_000).toArray(),
    // Query the latest inverter snapshot separately — the inverterHistory query
    // above sorts ascending, so without a separate query the most recent snapshot
    // could be cut off if the limit is ever reached.
    inverterSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next(),
    weatherSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next(),
    usageByMeter(allocations, prevCycleStart, cycleStart),
    // Last 24h TOMZN snapshots — used to supplement energy calculations and flow
    // history when the inverter is off (bypass mode). TOMZN powerW sees all power
    // flowing to the home whether from solar or grid, so it fills the gaps.
    snapshots.find({ timestamp: { $gte: now - 24 * 60 * 60 * 1000, $lte: now } }).sort({ timestamp: 1 }).limit(5_000).toArray(),
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
    gridWRaw: latestInverter.gridWRaw ?? 0,
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
  } : { solarW: 0, solarV: 0, solarA: 0, gridW: 0, gridWRaw: 0, gridV: 0, gridHz: 0, gridConnected: false, gridDirection: "import", loadW: 0, loadVa: 0, loadPercent: 0, acOutV: 0, acOutHz: 0, inverterMode: "unknown", inverterFault: "UNKNOWN", temperatureC: 0, ratedOutputW: 0, signal: null, sourceTime: null, fetchedAt: "", isLive: false, isOnline: false };
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
  // 24h-filtered version for the flow graph (the query returns 7 days for
  // export subtraction on the daily usage chart).
  const flow24hInverterHistory = sanitizedInverterHistory.filter((s) => s.timestamp >= now - 24 * 60 * 60 * 1000);
  const todaySanitized = sanitizedInverterHistory.filter((sample) => sample.timestamp >= todayStart - 5 * 60_000);
  // Build a set of 5-minute buckets where the home was genuinely exporting.
  // TOMZN can't distinguish import vs export — its powerW increases in both
  // directions, so during true export periods we zero out TOMZN powerW to keep
  // energy received/used from increasing. buildExportBuckets processes the day's
  // samples in chronological order with the on-grid direction state machine,
  // so zero-crossings (import→export, export→import) are tracked correctly.
  const FLOW_BUCKET_MS = 5 * 60_000;
  const exportBuckets = buildExportBuckets(todaySanitized, todayTomznSnapshots, FLOW_BUCKET_MS);
  // ── TOMZN cumulative counter is the PRIMARY source for usage calculations ──
  // The allocation sum (delta-based) is a fallback when TOMZN is offline or reset.
  // TOMZN's energyKwh is a cumulative counter that never decreases (unless reset),
  // so today's usage = current reading − reading at midnight − export-period skips.
  const rawTodayTomzn = (todayTomznSnapshots || [])
    .filter((s) => s.energyKwh != null && s.energyKwh >= 0 && s.timestamp >= todayStart)
    .sort((a, b) => a.timestamp - b.timestamp);
  // Midnight baseline: pick the first NON-ZERO reading. TOMZN reports energyKwh=0
  // when offline, so a 0 at midnight would make today's usage = the entire
  // cumulative counter (e.g. 200), not just today's consumption. This mirrors the
  // export-skip loop below which already skips 0 readings for the same reason.
  const todayStartEnergyKwh = rawTodayTomzn.length > 0
    ? finiteNumber((rawTodayTomzn.find((s) => s.energyKwh > 0) || rawTodayTomzn[0]).energyKwh)
    : null;
  const currentEnergyKwh = (tomznSource?.energyKwh != null && finiteNumber(tomznSource.energyKwh) > 0)
    ? finiteNumber(tomznSource.energyKwh)
    : null;
  // Export skip: sum of energyKwh increases during export periods today.
  // TOMZN's counter increases during both import and export; we must exclude export.
  // Skip steps where either reading is 0 — TOMZN reports energyKwh=0 when offline,
  // and the jump from 0 back to the real cumulative value (e.g. 0→193) is not real
  // energy flow. Also cap each step at 1 kWh (12 kW over 5 min) to guard against
  // any other spurious jumps.
  let exportSkipToday = 0;
  for (let i = 1; i < rawTodayTomzn.length; i += 1) {
    const prev = rawTodayTomzn[i - 1];
    const curr = rawTodayTomzn[i];
    if (prev.energyKwh === 0 || curr.energyKwh === 0) continue;
    const bucket = Math.floor(curr.timestamp / FLOW_BUCKET_MS);
    if (exportBuckets.has(bucket)) {
      exportSkipToday += Math.min(1, Math.max(0, finiteNumber(curr.energyKwh, 0) - finiteNumber(prev.energyKwh, 0)));
    }
  }
  exportSkipToday = round(exportSkipToday, 3);
  // Clamp export skip to the actual energyKwh increase — false export detection
  // (e.g. TOMZN offline with tomznW=0 misread as "no grid draw") can cause
  // exportSkip to exceed the real consumption, zeroing out homeKwh/gridKwh.
  const actualIncrease = (currentEnergyKwh != null && todayStartEnergyKwh != null)
    ? Math.max(0, currentEnergyKwh - todayStartEnergyKwh) : 0;
  if (exportSkipToday > actualIncrease) exportSkipToday = round(actualIncrease, 3);
  // Counter reset detection: if current < start by > 1 unit, TOMZN was reset.
  // In that case, don't use the direct calculation — fall back to allocation algorithm.
  const tomznResetToday = currentEnergyKwh != null && todayStartEnergyKwh != null
    && currentEnergyKwh < todayStartEnergyKwh - 1;
  // Primary: TOMZN direct today usage (current − midnight − export skip).
  // Plausibility guard: a household exceeding 80 kWh in a single day is almost
  // certainly a bad baseline (e.g. TOMZN offline at midnight reporting 0), not
  // real consumption. Fall back to the allocation/integration algorithm instead.
  const rawTomznDirectToday = (currentEnergyKwh != null && todayStartEnergyKwh != null && !tomznResetToday)
    ? round(Math.max(0, currentEnergyKwh - todayStartEnergyKwh - exportSkipToday), 3)
    : null;
  const tomznDirectTodayUsage = (rawTomznDirectToday != null && rawTomznDirectToday <= 80)
    ? rawTomznDirectToday
    : null;
  // ── TOMZN direct since anchor (for meter reading after manual log) ──
  // When a manual reading is logged, anchorEnergyKwh stores the TOMZN cumulative
  // reading at that moment. Usage since anchor = current − anchor − export skip.
  // This is per-meter (each meter has its own anchor). Export skip since anchor
  // is computed from TOMZN snapshots between anchor time and now.
  function computeTomznSinceAnchor(anchorAt, anchorEnergyKwh) {
    if (anchorEnergyKwh == null || currentEnergyKwh == null || anchorAt == null) return null;
    // Counter reset since anchor: if current < anchor by > 1 unit, TOMZN was reset.
    if (currentEnergyKwh < anchorEnergyKwh - 1) return null;
    // Find TOMZN snapshots since anchor to compute export skip.
    const sinceAnchor = (recentSnapshots || [])
      .filter((s) => s.energyKwh != null && s.energyKwh >= 0 && s.timestamp >= anchorAt)
      .sort((a, b) => a.timestamp - b.timestamp);
    let exportSkip = 0;
    for (let i = 1; i < sinceAnchor.length; i += 1) {
      const prev = sinceAnchor[i - 1];
      const curr = sinceAnchor[i];
      if (prev.energyKwh === 0 || curr.energyKwh === 0) continue;
      const bucket = Math.floor(curr.timestamp / FLOW_BUCKET_MS);
      if (exportBuckets.has(bucket)) {
        exportSkip += Math.min(1, Math.max(0, finiteNumber(curr.energyKwh, 0) - finiteNumber(prev.energyKwh, 0)));
      }
    }
    return round(Math.max(0, currentEnergyKwh - anchorEnergyKwh - exportSkip), 3);
  }
  // TOMZN snapshots supplement energy and flow data when the inverter is off.
  // TOMZN powerW sees ALL power flowing to the home (from grid or solar), so
  // it fills gaps when the inverter is off (bypass mode) or offline.
  // Zero out TOMZN powerW during export periods to pause energy accumulation.
  const todayTomzn = (todayTomznSnapshots || [])
    .filter((s) => s.powerW != null && s.powerW >= 0)
    .map((s) => ({
      timestamp: s.timestamp,
      powerW: exportBuckets.has(Math.floor(s.timestamp / FLOW_BUCKET_MS))
        ? 0
        : Math.max(0, s.powerW || 0),
    }));
  // Build a set of 5-minute buckets covered by inverter data so we know which
  // buckets need TOMZN supplementation.
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
  // TOMZN direct is primary for grid/home kWh (cumulative counter is more accurate
  // than watt integration). Fall back to integration when TOMZN is offline or reset.
  const integrationHomeKwh = round(integrateWatts(todaySanitized, "loadW") + integrateWatts(tomznSupplement, "powerW"), 3);
  const integrationGridKwh = round(integrateWatts(todaySanitized, "gridW") + integrateWatts(tomznSupplement, "powerW"), 3);
  const energyToday = {
    solarKwh: integrateWatts(todaySanitized, "solarW"),
    // Home energy: TOMZN direct (cumulative counter) when available, integration fallback.
    homeKwh: tomznDirectTodayUsage != null ? tomznDirectTodayUsage : integrationHomeKwh,
    // Grid energy: TOMZN direct (cumulative counter) when available, integration fallback.
    gridKwh: tomznDirectTodayUsage != null ? tomznDirectTodayUsage : integrationGridKwh,
  };
  // Downsample flow history to 1 point per 5-minute bucket (max 288 points/24h).
  // This prevents the frontend graph from rendering thousands of duplicate path segments.
  const flowBuckets = new Map();
  for (const sample of flow24hInverterHistory) {
    const bucket = Math.floor(sample.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
    const existing = flowBuckets.get(bucket);
    // Keep the latest sample within each 5-minute bucket.
    if (!existing || sample.timestamp > existing.timestamp) {
      flowBuckets.set(bucket, sample);
    }
  }
  // Merge TOMZN data into flow buckets.
  // TOMZN powerW = grid import, which is always the authoritative grid value.
  // For buckets with inverter data, attach _tomznPowerW so gridKw always uses TOMZN.
  // For buckets without inverter data (inverter off / bypass), create a bucket
  // with TOMZN as the sole source for both grid and home consumption.
  for (const sample of todayTomzn) {
    const bucket = Math.floor(sample.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
    const existing = flowBuckets.get(bucket);
    if (existing) {
      // Inverter data exists — attach TOMZN powerW for the grid line.
      existing._tomznPowerW = sample.powerW;
    } else {
      flowBuckets.set(bucket, {
        timestamp: sample.timestamp,
        solarW: 0,
        gridW: 0,
        loadW: 0,
        _tomznPowerW: sample.powerW,
      });
    }
  }
  const flowHistory = Array.from(flowBuckets.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((sample) => ({
      timestamp: sample.timestamp,
      // Solar — always from the inverter's solarW (its own reading).
      solarKw: round(sample.solarW / 1000, 3),
      // Grid — always from TOMZN powerW (the grid-side meter sees all import).
      gridKw: round((sample._tomznPowerW || 0) / 1000, 3),
      // Home — from inverter loadW when inverter is on (its own reading);
      // when inverter is off (bypass mode), fall back to TOMZN powerW as home consumption.
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
  // Allocation-based fallback (used when TOMZN is offline or counter was reset).
  const allocationTodayTotal = round(Array.from(METER_IDS).reduce((sum, meterId) =>
    sum + calibratedUnits(state.meters[meterId], todayUsage[meterId] || 0), 0), 2);
  // TOMZN direct is primary; allocation sum is fallback.
  const totalToday = tomznDirectTodayUsage != null ? tomznDirectTodayUsage : allocationTodayTotal;
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
  // ── Override dailyUsage with accurate TOMZN counter-based values ──
  // The allocation-based sum above doesn't subtract solar export energy and
  // applies meter calibration factors, causing it to drift from actual
  // consumption. For each day, compute usage from the TOMZN cumulative counter
  // (last − first reading of the day) MINUS export energy (counter increases
  // during both import and export — export must be excluded).
  {
    // Group TOMZN snapshots by Pakistan day.
    const tomznByDay = new Map();
    for (const s of (recentSnapshots || [])) {
      if (s.energyKwh == null || s.energyKwh < 0) continue;
      const key = pakistanDateKey(s.timestamp);
      if (!tomznByDay.has(key)) tomznByDay.set(key, []);
      tomznByDay.get(key).push(s);
    }
    // Group inverter snapshots by Pakistan day (for export detection).
    const invByDay = new Map();
    for (const s of sanitizedInverterHistory) {
      const key = pakistanDateKey(s.timestamp);
      if (!invByDay.has(key)) invByDay.set(key, []);
      invByDay.get(key).push(s);
    }
    for (const day of dailyUsage) {
      const key = pakistanDateKey(day.timestamp);
      const daySnapshots = tomznByDay.get(key);
      if (!daySnapshots || daySnapshots.length === 0) continue;
      daySnapshots.sort((a, b) => a.timestamp - b.timestamp);
      const first = finiteNumber(daySnapshots[0].energyKwh);
      const last = finiteNumber(daySnapshots[daySnapshots.length - 1].energyKwh);
      if (first == null || last == null) continue;
      if (last < first - 1) continue; // counter reset — keep allocation value
      // Compute export skip for this day: sum of counter increases during
      // export periods. Uses the same buildExportBuckets + skip logic as today.
      const dayInv = invByDay.get(key) || [];
      const dayExportBuckets = buildExportBuckets(dayInv, daySnapshots, FLOW_BUCKET_MS);
      let dayExportSkip = 0;
      for (let i = 1; i < daySnapshots.length; i += 1) {
        const prev = daySnapshots[i - 1];
        const curr = daySnapshots[i];
        if (prev.energyKwh === 0 || curr.energyKwh === 0) continue;
        const bucket = Math.floor(curr.timestamp / FLOW_BUCKET_MS);
        if (dayExportBuckets.has(bucket)) {
          dayExportSkip += Math.min(1, Math.max(0, finiteNumber(curr.energyKwh, 0) - finiteNumber(prev.energyKwh, 0)));
        }
      }
      // Clamp export skip to the actual counter increase (safety net).
      const dayIncrease = Math.max(0, last - first);
      if (dayExportSkip > dayIncrease) dayExportSkip = dayIncrease;
      day.usage = round(Math.max(0, dayIncrease - dayExportSkip), 2);
    }
  }
  // Today: use the most accurate value (counter + export subtraction with
  // live in-memory data, not just DB snapshots).
  if (tomznDirectTodayUsage != null && dailyUsage.length > 0) {
    dailyUsage[dailyUsage.length - 1].usage = tomznDirectTodayUsage;
  }
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

  // ── Day-of-week-aware trend algorithm ──
  // Replaces the old "last 3 days vs first 4 days" split which was contaminated
  // by weekend spikes — comparing Mon+Tue+Wed (low days) against Thu+Fri+Sat+Sun
  // (which includes weekend spikes) gave a misleading trend.
  //
  // The new algorithm:
  // 1. Computes 14 days of daily usage from the TOMZN cumulative counter
  //    (more accurate than allocation-based dailyUsage).
  // 2. Separates days into weekday (Mon–Thu) and weekend (Fri–Sun) groups,
  //    matching the household pattern where the father comes home on weekends.
  // 3. Compares recent week vs prior week WITHIN each group (weekdays vs
  //    weekdays, weekends vs weekends), then combines with 4:3 weighting.
  // 4. Falls back to linear regression slope when fewer than 14 days exist.
  {
    const TREND_WINDOW_DAYS = 14;
    const trendMap = new Map();
    for (let offset = 0; offset < TREND_WINDOW_DAYS; offset += 1) {
      const start = todayStart - offset * 86_400_000;
      trendMap.set(pakistanDateKey(start), { timestamp: start, usage: 0, valid: false });
    }
    const trendByDay = new Map();
    for (const s of (recentSnapshots || [])) {
      if (s.energyKwh == null || s.energyKwh < 0) continue;
      const key = pakistanDateKey(s.timestamp);
      if (!trendByDay.has(key)) trendByDay.set(key, []);
      trendByDay.get(key).push(s);
    }
    for (const [key, daySnapshots] of trendByDay) {
      if (!trendMap.has(key)) continue;
      daySnapshots.sort((a, b) => a.timestamp - b.timestamp);
      const first = finiteNumber(daySnapshots[0].energyKwh);
      const last = finiteNumber(daySnapshots[daySnapshots.length - 1].energyKwh);
      if (first == null || last == null) continue;
      if (last < first - 1) continue; // counter reset
      trendMap.get(key).usage = round(Math.max(0, last - first), 2);
      trendMap.get(key).valid = true;
    }
    // Today: use predicted full-day total (partial day would skew the trend)
    const todayKey = pakistanDateKey(now);
    if (trendMap.has(todayKey)) {
      trendMap.get(todayKey).usage = predictedTodayTotal;
      trendMap.get(todayKey).valid = true;
    }
    const trendDaysArray = Array.from(trendMap.values()).reverse(); // oldest → newest
    const validTrendDays = trendDaysArray.filter((d) => d.valid && d.usage > 0);
    // Classify days: weekday = Mon–Thu (low consumption), weekend = Fri–Sun (high)
    const isWeekendDay = (ts) => {
      const dow = new Date(ts).getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      return dow === 0 || dow === 5 || dow === 6; // Sun, Fri, Sat
    };
    if (validTrendDays.length >= 4) {
      const recent  = validTrendDays.slice(-7);
      const earlier = validTrendDays.slice(0, -7);
      if (earlier.length >= 2) {
        // Week-over-week comparison within each day-type group
        const recentWd  = recent.filter((d) => !isWeekendDay(d.timestamp));
        const recentWe  = recent.filter((d) =>  isWeekendDay(d.timestamp));
        const earlierWd = earlier.filter((d) => !isWeekendDay(d.timestamp));
        const earlierWe = earlier.filter((d) =>  isWeekendDay(d.timestamp));
        let trendSum = 0, trendWeight = 0;
        if (earlierWd.length > 0 && recentWd.length > 0) {
          const recentAvg  = recentWd.reduce((s, d) => s + d.usage, 0) / recentWd.length;
          const earlierAvg = earlierWd.reduce((s, d) => s + d.usage, 0) / earlierWd.length;
          if (earlierAvg > 0) {
            trendSum += ((recentAvg - earlierAvg) / earlierAvg) * 100 * 4; // 4 weekdays
            trendWeight += 4;
          }
        }
        if (earlierWe.length > 0 && recentWe.length > 0) {
          const recentAvg  = recentWe.reduce((s, d) => s + d.usage, 0) / recentWe.length;
          const earlierAvg = earlierWe.reduce((s, d) => s + d.usage, 0) / earlierWe.length;
          if (earlierAvg > 0) {
            trendSum += ((recentAvg - earlierAvg) / earlierAvg) * 100 * 3; // 3 weekend days
            trendWeight += 3;
          }
        }
        if (trendWeight > 0) {
          usageTrendPercent = Math.max(-50, Math.min(50, round(trendSum / trendWeight, 1)));
        }
      } else {
        // Not enough history for week-over-week — use linear regression slope
        // across all valid days to detect the overall direction.
        const n = validTrendDays.length;
        const xs = validTrendDays.map((_, i) => i);
        const ys = validTrendDays.map((d) => d.usage);
        const xMean = xs.reduce((s, x) => s + x, 0) / n;
        const yMean = ys.reduce((s, y) => s + y, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i += 1) {
          num += (xs[i] - xMean) * (ys[i] - yMean);
          den += (xs[i] - xMean) ** 2;
        }
        const slope = den > 0 ? num / den : 0;
        if (yMean > 0) {
          usageTrendPercent = Math.max(-50, Math.min(50, round((slope / yMean) * 100, 1)));
        }
      }
    } else if (validTrendDays.length >= 2) {
      // Very little data — simple recent vs earlier
      const recent  = validTrendDays.slice(-1);
      const earlier = validTrendDays.slice(0, -1);
      const priorAvg = earlier.reduce((s, d) => s + d.usage, 0) / earlier.length;
      if (priorAvg > 0) {
        usageTrendPercent = Math.max(-50, Math.min(50, round(((recent[0].usage - priorAvg) / priorAvg) * 100, 1)));
      }
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


  // Unallocated delta: live TOMZN reading minus the last import-period reading.
  // Uses lastImportEnergyKwh (frozen during export) so export-period counter
  // increases aren't counted as unallocated usage.
  // Additionally, when the inverter is currently exporting, zero out the delta
  // entirely — TOMZN's cumulative counter increases during export too, and that
  // increase must not be added to the active meter's reading in real-time.
  const lastImportKwh = state.lastImportEnergyKwh ?? state.lastTomzn?.energyKwh ?? tomznSource?.energyKwh ?? 0;
  // Determine the current grid flow (mode + direction + computed home) using the
  // mode-aware energy-balance + on-grid state machine. liveFlowState persists
  // between dashboard builds for zero-crossing tracking.
  const liveGridFlow = determineGridFlow(latestInverter, tomznSource?.powerW, liveFlowState, now);
  const dashboardExporting = liveGridFlow.isExporting;
  const unallocatedDelta = dashboardExporting
    ? 0
    : (tomznSource && tomznSource.energyKwh >= lastImportKwh)
      ? round(tomznSource.energyKwh - lastImportKwh, 3)
      : 0;

  const readings = {};
  let maxErrorPenalty = 0;
  for (const meterId of METER_IDS) {
    const config = state.meters[meterId];
    let rawAfterAnchor = await meterUsageSince(allocations, meterId, Math.max(config.anchorAt || cycleStart, cycleStart), now);
    let meterTodayUncalibrated = todayUsage[meterId] || 0;

    if (meterId === state.activeMeter) {
      // TOMZN direct since anchor is primary for the meter reading.
      // This uses the TOMZN cumulative counter delta from when the manual reading
      // was logged (anchorEnergyKwh) to now — so the reading always tracks TOMZN truth.
      const tomznSinceAnchor = computeTomznSinceAnchor(config.anchorAt, finiteNumber(config.anchorEnergyKwh));
      if (tomznSinceAnchor != null) {
        rawAfterAnchor = tomznSinceAnchor;
        // For today's usage display: start from this meter's allocation-based usage
        // (which correctly captures only the periods this meter was active today),
        // then add any TOMZN direct excess over total allocations (live unallocated).
        if (tomznDirectTodayUsage != null) {
          const totalAllocationToday = Array.from(METER_IDS).reduce((sum, id) => sum + (todayUsage[id] || 0), 0);
          const tomznDirectExcess = Math.max(0, tomznDirectTodayUsage - totalAllocationToday);
          meterTodayUncalibrated = (todayUsage[meterId] || 0) + tomznDirectExcess;
        }
      } else if (tomznDirectTodayUsage != null) {
        // No anchorEnergyKwh (old manual reading before this feature) — use midnight-based.
        const totalAllocationToday = Array.from(METER_IDS).reduce((sum, id) => sum + (todayUsage[id] || 0), 0);
        const tomznDirectExcess = Math.max(0, tomznDirectTodayUsage - totalAllocationToday);
        const allocationTodayForMeter = todayUsage[meterId] || 0;
        meterTodayUncalibrated = allocationTodayForMeter + tomznDirectExcess;
        rawAfterAnchor = rawAfterAnchor - allocationTodayForMeter + meterTodayUncalibrated;
      } else if (unallocatedDelta > 0) {
        // Fallback: TOMZN offline or reset — add live unallocated consumption
        rawAfterAnchor += unallocatedDelta;
        meterTodayUncalibrated += unallocatedDelta;
      }
    }

    const afterAnchor = calibratedUnits(config, rawAfterAnchor);
    const reading = round((config.anchorReading ?? config.cycleBaselineReading) + afterAnchor, 3);
    const cycleUsageValue = Math.max(0, round(reading - config.cycleBaselineReading, 3));
    const remainingUnits = Math.max(0, round(state.slabTargetUnits - cycleUsageValue, 3));
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
      // Grid always from TOMZN (the meter sees all grid exchange regardless of inverter state).
      gridKw: round((tomznSource?.powerW || 0) / 1000, 3),
      solarKw: (inverterLive && inverterOnline) ? round(inverter.solarW / 1000, 3) : 0,
      // Home: in hybrid mode from inverter loadW; in on-grid/bypass from the
      // grid-flow computation (solarW ± tomznPowerW or tomznPowerW). The
      // gridFlow object below carries the computed homeW for on-grid mode.
      homeKw: (inverterLive && inverterOnline && liveGridFlow.mode === "hybrid")
        ? round(inverter.loadW / 1000, 3)
        : round(liveGridFlow.homeW / 1000, 3),
      currentAmp: (inverterLive && inverterOnline) ? inverter.solarA : (tomznSource?.currentA || 0),
      voltage: (inverterLive && inverterOnline) ? inverter.gridV : (tomznSource?.voltageV || 0),
      frequency: (inverterLive && inverterOnline) ? inverter.gridHz : (tomznSource?.frequencyHz || 50),
      powerFactor: 0.98,
    },
    // Grid flow: mode (hybrid/on-grid/bypass/night), direction (import/export/idle),
    // computed home consumption (homeW), and signed grid exchange (gridExchangeW,
    // + = import, - = export). The frontend uses this for on-grid labels, the
    // blue inverter→DB wire, and displaying computed home when loadW ≈ 0.
    gridFlow: {
      mode: liveGridFlow.mode,
      direction: liveGridFlow.direction,
      homeW: Math.round(liveGridFlow.homeW),
      gridExchangeW: Math.round(liveGridFlow.gridExchangeW),
      solarW: Math.round(finiteNumber(latestInverter?.solarW, 0)),
      loadW: Math.round(finiteNumber(latestInverter?.loadW, 0)),
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

// Same as downsampleTomznSnapshots but for the inverter collection. Reduces
// high-frequency (every 5s) snapshots to 1 per minute, keeping the latest in
// each minute bucket. Only processes snapshots older than 1 hour.
async function downsampleInverterSnapshots(inverterSnapshots) {
  const cutoff = Date.now() - 3_600_000;
  const groups = await inverterSnapshots.aggregate([
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
    const deleteIds = group.ids.slice(0, -1);
    if (deleteIds.length > 0) {
      await inverterSnapshots.deleteMany({ _id: { $in: deleteIds } });
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
  // dataVersion increments whenever meter/home/forecast data changes (TOMZN
  // persist, manual reading, changeover, manual log edit). The frontend sends
  // its current version — if it matches, we return { changed: false } instead
  // of the full dashboard, saving bandwidth and re-render cycles.
  let dataVersion = 0;
  const bumpDataVersion = () => { dataVersion += 1; };
  // In-memory live cache: holds the freshest TOMZN reading for dashboard display
  // without requiring a database write on every 5s poll. Reset to null on restart.
  const liveTomznRef = { value: null };
  // In-memory live inverter cache — same pattern as liveTomznRef, keeps the
  // freshest inverter reading for the live payload without DB reads every 3s.
  const liveInverterRef = { value: null };
  // Grid-flow state trackers for the on-grid direction state machine. These
  // persist between polls (in-memory, reset on restart) so the import↔export
  // zero-crossing detection works across the 5s live polls. billingFlowState is
  // used by recordTomzn (persists to DB); liveFlowState is used by the live/
  // dashboard display endpoints.
  const billingFlowState = createGridFlowState();
  const liveFlowState = createGridFlowState();
  // UPS check cache — pingHome() is cached for 10s to avoid pinging on every
  // 2s broadcast. Reset to null on restart.
  let upsCache = null;
  // Weather cache — the DB read for the latest weather snapshot is cached for
  // 60s (weather changes slowly, polled every 30 min) to avoid a query on
  // every 2s live broadcast. Included in the live payload so the frontend can
  // auto-shift day/night/weather scenes in real time.
  let weatherCache = { value: null, timestamp: 0 };

  const context = { stateCollection, snapshots, allocations, manualLogs, inverterSnapshots, weatherSnapshots, liveTomznRef, billingFlowState, liveFlowState };
  const pollTomzn = async ({ forcePersist = false, force = false } = {}) => {
    const now = Date.now();
    // Serve from in-memory live cache if fresh enough (avoids hitting Tuya on every 5s request).
    // `force` bypasses the cache so manual refresh / app-open always hits the device.
    if (!force && !forcePersist && liveTomznRef.value && now - liveTomznRef.value.timestamp < TOMZN_LIVE_MAX_AGE_MS) {
      return { record: liveTomznRef.value, allocatedDelta: 0 };
    }
    if (pollInFlight) return pollInFlight;
    pollInFlight = (async () => {
      let snapshot;
      try {
        snapshot = await requestTomzn();
        // Poll succeeded — reset fail counter
        tomznStaleTracker.failCount = 0;
      } catch (pollErr) {
        // ── Poll failure detection ──
        // Local Tuya poll failed (WiFi dead, device unreachable). Increment fail
        // counter. After TOMZN_FAIL_THRESHOLD consecutive failures, mark offline.
        tomznStaleTracker.failCount += 1;
        console.error(`[Solar Engine] TOMZN poll failed (${tomznStaleTracker.failCount}/${TOMZN_FAIL_THRESHOLD}):`, pollErr.message);
        if (tomznStaleTracker.failCount >= TOMZN_FAIL_THRESHOLD) {
          // Build an offline snapshot from the last known values
          const lastKnown = liveTomznRef.value;
          snapshot = {
            energyKwh: lastKnown?.energyKwh ?? 0,
            voltageV: 0,
            currentA: 0,
            powerW: 0,
            frequencyHz: lastKnown?.frequencyHz ?? 50,
            isOnline: false,
            switchOn: lastKnown?.switchOn ?? false,
            faultCode: lastKnown?.faultCode ?? 0,
            fetchedAt: new Date().toISOString(),
          };
        } else {
          // Not enough failures yet — return last known good data
          if (liveTomznRef.value) {
            return { record: { ...liveTomznRef.value, timestamp: now }, allocatedDelta: 0 };
          }
          throw pollErr;
        }
      }
      // ── Stale-data detection (fingerprint) ──
      // Even when the local poll succeeds, the device-sharing SDK may return
      // cached phase_a values. We fingerprint key values across consecutive
      // polls. If they're identical for TOMZN_STALE_THRESHOLD polls, override
      // isOnline to false.
      //
      // STANDBY EXEMPTION: When the user manually turns the TOMZN switch OFF
      // (standby / intentional grid cut), the device is still accessible and
      // replies to polls — it just reports 0V/0A/0W because no power flows.
      // Identical zero readings are EXPECTED in standby, not a sign of stale
      // cached data. Skip fingerprint detection when switchOn is false so the
      // device stays "online" and the frontend shows "Standby" instead of
      // "Offline". True offline is handled by the fail counter (10 consecutive
      // poll failures → unreachable).
      const tuyaReportsOnline = snapshot.isOnline;
      const switchOn = snapshot.switchOn;
      const fingerprint = `${snapshot.energyKwh}|${snapshot.powerW}|${snapshot.voltageV}|${snapshot.currentA}`;
      if (!tuyaReportsOnline || !switchOn) {
        // Device reported offline, OR switch is off (standby) — reset fingerprint
        // counter. In standby, identical readings are normal, not stale.
        tomznStaleTracker.fingerprint = null;
        tomznStaleTracker.count = 0;
      } else {
        if (fingerprint === tomznStaleTracker.fingerprint) {
          tomznStaleTracker.count += 1;
        } else {
          tomznStaleTracker.fingerprint = fingerprint;
          tomznStaleTracker.count = 0;
        }
        if (tomznStaleTracker.count >= TOMZN_STALE_THRESHOLD) {
          snapshot.isOnline = false;
        }
      }
      // ── Inverter mode cross-check ──
      // When the inverter switches to battery mode (QMOD="B"), the grid is down.
      // TOMZN (grid meter) can't be online if there's no grid. Use this as a
      // secondary offline signal.
      //
      // STANDBY EXEMPTION: When the user manually turned the TOMZN switch OFF,
      // they intentionally cut the grid — the inverter switching to battery
      // mode is the expected consequence, not a fault. The TOMZN device itself
      // is still accessible and replying to polls. Skip this cross-check when
      // switchOn is false.
      const invSnap = liveInverterRef.value;
      if (invSnap && invSnap.inverterMode === "B" && snapshot.isOnline && switchOn) {
        snapshot.isOnline = false;
        snapshot.voltageV = 0;
        snapshot.currentA = 0;
        snapshot.powerW = 0;
      }
      // If energyKwh is null (datapoint unavailable), fall back to last known value
      let energyKwh = finiteNumber(snapshot.energyKwh);
      if (energyKwh == null || energyKwh < 0) {
        energyKwh = liveTomznRef.value?.energyKwh ?? 0;
        snapshot.energyKwh = energyKwh;
      }
      // Only persist to the database once per minute (or when explicitly forced by
      // changeover/manual-reading endpoints that need to close the billing interval).
      const latestStored = await snapshots.find({}).sort({ timestamp: -1 }).limit(1).next();
      const shouldPersist = forcePersist || !latestStored || now - latestStored.timestamp >= TOMZN_PERSIST_MIN_INTERVAL_MS;
      if (shouldPersist) {
        const result = await recordTomzn({ ...context, snapshot });
        liveTomznRef.value = result.record;
        bumpDataVersion(); // meter/home/forecast data changed
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
    if (!force && latest && Date.now() - latest.timestamp < INVERTER_POLL_MAX_AGE_MS) return latest;
    if (inverterPollInFlight) return inverterPollInFlight;
    inverterPollInFlight = requestInverterZone()
      .then(async (snapshot) => {
        if (!snapshot) return snapshot;
        // Only persist to the database once per minute. The 5s background poll
        // still updates the in-memory live cache (via the return value), but DB
        // writes are throttled to avoid flooding the collection with 17,280
        // snapshots/day (which exceeded the 5,000 query limit and caused the
        // flow graph to miss solar-producing hours).
        const now = Date.now();
        const shouldPersist = !latest || now - latest.timestamp >= INVERTER_PERSIST_MIN_INTERVAL_MS;
        if (shouldPersist) {
          await inverterSnapshots.updateOne(
            { timestamp: snapshot.timestamp },
            { $set: snapshot },
            { upsert: true }
          );
        }
        liveInverterRef.value = snapshot;
        return snapshot;
      })
      .catch(async (error) => {
        // Network error / timeout / non-2xx — store an offline snapshot so
        // "last fetched" keeps updating and the user can see we're still polling.
        // Don't just return stale data silently.
        console.error("[Solar Engine] inverter poll failed:", error.message);
        const offline = makeOfflineInverterSnapshot();
        const now = Date.now();
        const shouldPersist = !latest || now - latest.timestamp >= INVERTER_PERSIST_MIN_INTERVAL_MS;
        if (shouldPersist) {
          await inverterSnapshots.updateOne(
            { timestamp: offline.timestamp },
            { $set: offline },
            { upsert: true }
          );
        }
        liveInverterRef.value = offline;
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
      .then(async (snapshot) => {
        await weatherSnapshots.insertOne(snapshot);
        // Invalidate weatherCache so the next buildLivePayload reads the
        // fresh snapshot (sunrise/sunset for the current day).
        weatherCache = { value: null, timestamp: 0 };
        return snapshot;
      })
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

  // Build the lightweight live payload (tomznLive + inverter + gridFlow) from
  // the in-memory live cache. Used by /live, /live/stream, and broadcastLive()
  // so all three return an identical shape without duplicating the assembly logic.
  const buildLivePayload = async () => {
    const state = await ensureState(stateCollection);
    const liveOverride = liveTomznRef?.value;
    const tomznSource = (liveOverride && (!state.lastTomzn || liveOverride.timestamp >= state.lastTomzn.timestamp))
      ? liveOverride
      : state.lastTomzn;
    const latestInverter = liveInverterRef.value || await inverterSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next();
    const inverter = latestInverter ? {
      solarW: latestInverter.solarW || 0,
      solarV: latestInverter.solarV || 0,
      solarA: latestInverter.solarA || 0,
      pv1V: latestInverter.pv1V || 0,
      pv1A: latestInverter.pv1A || 0,
      pv1W: latestInverter.pv1W || 0,
      pv2V: latestInverter.pv2V || 0,
      pv2A: latestInverter.pv2A || 0,
      pv2W: latestInverter.pv2W || 0,
      gridW: latestInverter.gridW || 0,
      gridWRaw: latestInverter.gridWRaw || 0,
      gridV: latestInverter.gridV || 0,
      gridHz: latestInverter.gridHz || 0,
      gridConnected: latestInverter.gridConnected !== false,
      gridDirection: latestInverter.gridDirection || "import",
      loadW: latestInverter.loadW || 0,
      loadVa: latestInverter.loadVa || 0,
      loadPercent: latestInverter.loadPercent || 0,
      acOutV: latestInverter.acOutV || 0,
      acOutHz: latestInverter.acOutHz || 0,
      inverterMode: latestInverter.inverterMode || "unknown",
      inverterFault: latestInverter.inverterFault || "UNKNOWN",
      temperatureC: latestInverter.temperatureC || 0,
      ratedOutputW: latestInverter.ratedOutputW || 0,
      signal: latestInverter.signal ?? null,
      firmware: latestInverter.firmware || null,
      isOnline: latestInverter.isOnline !== false,
      isLive: Date.now() - latestInverter.timestamp < 10 * 60 * 1000,
      fetchedAt: latestInverter.fetchedAt || new Date(latestInverter.timestamp).toISOString(),
    } : { solarW: 0, solarV: 0, solarA: 0, pv1V: 0, pv1A: 0, pv1W: 0, pv2V: 0, pv2A: 0, pv2W: 0, gridW: 0, gridWRaw: 0, gridV: 0, gridHz: 0, gridConnected: false, gridDirection: "import", loadW: 0, loadVa: 0, loadPercent: 0, acOutV: 0, acOutHz: 0, inverterMode: "unknown", inverterFault: "UNKNOWN", temperatureC: 0, ratedOutputW: 0, signal: null, firmware: null, isOnline: false, isLive: false, fetchedAt: "" };
    // Compute grid flow (mode + direction + computed home) for the live hero.
    // Uses liveFlowState for on-grid zero-crossing tracking across 5s polls.
    // When the TOMZN meter is offline (WAPDA cut off, WiFi dead), Tuya cloud
    // returns stale cached powerW — zero it out so determineGridFlow doesn't
    // compute phantom import/export from dead data.
    const tomznOnline = tomznSource?.isOnline !== false;
    const tomznFault = tomznSource?.faultCode || 0;
    const tomznPowerForFlow = (!tomznOnline || tomznFault === 2048 || tomznFault === 8192) ? 0 : tomznSource?.powerW;
    const liveFlow = determineGridFlow(latestInverter, tomznPowerForFlow, liveFlowState, Date.now());
    // When the grid is down (TOMZN offline or inverter in battery mode), there's
    // no grid to export to. Force direction to "idle" to prevent phantom export.
    const inverterOnBattery = latestInverter?.inverterMode === "B";
    const gridDown = !tomznOnline || inverterOnBattery;
    const gridFlow = {
      mode: gridDown ? (inverterOnBattery ? "battery" : liveFlow.mode) : liveFlow.mode,
      direction: gridDown ? "idle" : liveFlow.direction,
      homeW: Math.round(liveFlow.homeW),
      gridExchangeW: gridDown ? 0 : Math.round(liveFlow.gridExchangeW),
      solarW: Math.round(finiteNumber(latestInverter?.solarW, 0)),
      loadW: Math.round(finiteNumber(latestInverter?.loadW, 0)),
    };
    // UPS check: when BOTH inverter AND grid are offline (no power source),
    // ping the home IP to determine if the router is still on UPS backup.
    // Cached for 10s to avoid pinging on every 2s broadcast.
    // Mode "B" (Battery) means the inverter is actively powering the home from
    // battery + solar — NOT offline, so UPS check should NOT trigger.
    const inverterOffline = !latestInverter || latestInverter.isOnline === false ||
      latestInverter.inverterMode === "S" || latestInverter.inverterMode === "offline" ||
      (latestInverter.gridV === 0 && latestInverter.solarW === 0 && latestInverter.gridW === 0 && latestInverter.loadW === 0);
    const gridOffline = !tomznOnline || tomznFault === 2048 || tomznFault === 8192;
    let ups = null;
    if (inverterOffline && gridOffline) {
      const now = Date.now();
      if (!upsCache || now - upsCache.timestamp > 10_000) {
        const reachable = await pingHome();
        upsCache = { active: reachable, label: reachable ? "UPS" : "Power Down", timestamp: now };
      }
      ups = { active: upsCache.active, label: upsCache.label };
    }
    // Include weather in the live payload so the frontend can auto-shift
    // day/night/weather scenes without waiting for a full dashboard sync.
    // Weather changes slowly (polluted every 30 min), so cache the DB read
    // for 60s to avoid a query on every 2s broadcast.
    let weather = weatherCache.value;
    if (!weather || Date.now() - weatherCache.timestamp > 60_000) {
      const latestWeather = await weatherSnapshots.find({}).sort({ timestamp: -1 }).limit(1).next();
      weather = latestWeather ? {
        code: latestWeather.code,
        isDay: latestWeather.isDay,
        cloudCover: latestWeather.cloudCover,
        precipitation: latestWeather.precipitation,
        temperatureC: latestWeather.temperatureC,
        sunrise: latestWeather.sunrise || null,
        sunset: latestWeather.sunset || null,
        fetchedAt: new Date(latestWeather.timestamp).toISOString(),
        isLive: Date.now() - latestWeather.timestamp < WEATHER_POLL_MAX_AGE_MS * 2,
      } : { code: 0, isDay: pakistanHour(Date.now()) >= 6 && pakistanHour(Date.now()) < 19, cloudCover: 0, precipitation: 0, temperatureC: 0, sunrise: null, sunset: null, fetchedAt: "", isLive: false };
      weatherCache = { value: weather, timestamp: Date.now() };
    }
    return { tomznLive: publicTomzn(tomznSource), inverter, gridFlow, ups, weather };
  };

  // SSE subscribers for /live/stream — pushed instantly after each 5s
  // background poll so connected clients (RN app + Android overlay) get fresh
  // data without independent polling. Eliminates the "each client triggers its
  // own backend poll" pattern that caused random bursts.
  const liveClients = new Set();
  const broadcastLive = async () => {
    if (liveClients.size === 0) return;
    try {
      const payload = JSON.stringify(await buildLivePayload());
      for (const res of liveClients) {
        try { res.write(`data: ${payload}\n\n`); }
        catch (e) { liveClients.delete(res); }
      }
    } catch (e) { console.error("[Solar Engine] live broadcast failed:", e.message); }
  };

  // Lightweight live endpoint — returns the in-memory cached TOMZN + inverter
  // data without the heavy buildDashboard DB queries. The 5s background poller
  // keeps the cache fresh, so this endpoint just reads the cache. Only
  // force=true (manual refresh / app-open) bypasses the cache to hit Tuya/
  // InverterZone directly for truly fresh data.
  app.get("/api/solar/live", async (req, res) => {
    try {
      const force = req.query.force === "true";
      if (force) await Promise.all([pollTomzn({ force }), pollInverter({ force })]);
      res.json(await buildLivePayload());
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  // SSE stream — pushes live data to subscribers instantly after each 5s
  // backend poll. The React Native app (via react-native-sse) and the Android
  // floating overlay (via HttpURLConnection streaming) subscribe to this
  // endpoint so they get updates without independent polling.
  app.get("/api/solar/live/stream", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    liveClients.add(res);
    // Send current cached state immediately so the client doesn't wait
    // for the next background poll.
    void broadcastLive();
    // Trigger a non-blocking fresh poll so the client gets truly fresh
    // data from Tuya/InverterZone within 1-3s via SSE push (without
    // blocking the initial cached response above).
    void Promise.all([pollTomzn({ force: true }), pollInverter({ force: true })])
      .then(() => broadcastLive())
      .catch(() => {});

    // SSE keep-alive comment every 25s (prevents proxy/load-balancer timeouts)
    const ping = setInterval(() => {
      try { res.write(":ping\n\n"); } catch (e) { clearInterval(ping); }
    }, 25_000);

    req.on("close", () => {
      clearInterval(ping);
      liveClients.delete(res);
    });
  });

  // Delta sync endpoint — the frontend sends its current dataVersion. If nothing
  // changed since then, we return { changed: false } (tiny response, no DB queries).
  // If data changed, we return the full dashboard + new dataVersion. The 5s
  // background poller keeps the live cache fresh, so this endpoint no longer
  // triggers polls — it just reads the cache for the live hero portion.
  app.get("/api/solar/dashboard/sync", async (req, res) => {
    try {
      const clientVersion = Number(req.query.since) || 0;
      if (clientVersion === dataVersion) {
        // Nothing changed — return minimal response with live hero data only
        const live = await buildLivePayload();
        res.json({ changed: false, dataVersion, tomznLive: live.tomznLive, inverter: live.inverter, gridFlow: live.gridFlow });
      } else {
        // Data changed — return full dashboard
        res.json({ changed: true, dataVersion, dashboard: await buildDashboard(context) });
      }
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  app.post("/api/solar/refresh", async (req, res) => {
    try {
      const force = req.query.force === "true";
      const [recorded] = await Promise.all([pollTomzn({ force }), pollInverter({ force }), pollWeather()]);
      res.json({ allocatedDelta: recorded.allocatedDelta, dataVersion, dashboard: await buildDashboard(context) });
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  // Force-refresh only TOMZN (bypasses 5s live-cache guard).
  app.post("/api/solar/refresh/tomzn", async (req, res) => {
    try {
      const force = req.query.force === "true";
      await pollTomzn({ force });
      res.json({ dataVersion, dashboard: await buildDashboard(context) });
    } catch (error) { res.status(502).json({ error: error.message }); }
  });

  // Force-refresh only the inverter (bypasses 5s max-age guard).
  app.post("/api/solar/refresh/inverter", async (req, res) => {
    try {
      const force = req.query.force === "true";
      await pollInverter({ force });
      res.json({ dataVersion, dashboard: await buildDashboard(context) });
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
      bumpDataVersion();
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
      // Store the TOMZN cumulative reading at anchor time so future reading
      // calculations can use the TOMZN direct approach (current − anchor).
      meter.anchorEnergyKwh = state.lastTomzn?.energyKwh ?? null;
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
      bumpDataVersion();
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
      bumpDataVersion();
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
  // Dedicated endpoint for rolling 24-hour flow history (solar/grid/load kW
  // per sample). Window = now - 24h → now, so the graph always shows the last
  // 24 hours with current time at the right edge. Does NOT reset at midnight.
  // Filters out offline snapshots (isOnline === false) so they don't create
  // zero-drops in the flow graph. Supplements with TOMZN data for periods when
  // the inverter was off (bypass mode) so the graph shows grid energy.
  app.get("/api/solar/flow-history", async (_req, res) => {
    try {
      const now = Date.now();
      const windowStart = now - 24 * 60 * 60 * 1000;
      const [invHistory, tomznHistory] = await Promise.all([
        inverterSnapshots.find({ timestamp: { $gte: windowStart, $lte: now } }).sort({ timestamp: 1 }).limit(20_000).toArray(),
        snapshots.find({ timestamp: { $gte: windowStart, $lte: now } }).sort({ timestamp: 1 }).limit(5_000).toArray(),
      ]);
      const FLOW_BUCKET_MS = 5 * 60_000;
      // Build a set of export buckets to zero out TOMZN powerW during true
      // export periods — TOMZN can't distinguish import vs export.
      // buildExportBuckets processes the day chronologically with the on-grid
      // direction state machine so zero-crossings are tracked correctly.
      const exportBuckets = buildExportBuckets(invHistory, tomznHistory, FLOW_BUCKET_MS);
      const flowBuckets = new Map();
      // Inverter data — primary source
      for (const sample of invHistory.filter((s) => s.isOnline !== false)) {
        const bucket = Math.floor(sample.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
        const existing = flowBuckets.get(bucket);
        if (!existing || sample.timestamp > existing.timestamp) {
          flowBuckets.set(bucket, sample);
        }
      }
      // Merge TOMZN data into flow buckets — TOMZN powerW is always the
      // authoritative grid import value, regardless of inverter state.
      // Zero out during export periods to pause energy accumulation.
      for (const sample of tomznHistory) {
        const bucket = Math.floor(sample.timestamp / FLOW_BUCKET_MS) * FLOW_BUCKET_MS;
        const isExport = exportBuckets.has(Math.floor(sample.timestamp / FLOW_BUCKET_MS));
        const tomznPowerW = isExport ? 0 : Math.max(0, sample.powerW || 0);
        const existing = flowBuckets.get(bucket);
        if (existing) {
          existing._tomznPowerW = tomznPowerW;
        } else {
          flowBuckets.set(bucket, {
            timestamp: sample.timestamp,
            solarW: 0,
            gridW: 0,
            loadW: 0,
            _tomznPowerW: tomznPowerW,
          });
        }
      }
      res.json(Array.from(flowBuckets.values())
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((sample) => ({
          timestamp: sample.timestamp,
          // Solar — always from the inverter's solarW (its own reading).
          solarKw: round(sample.solarW / 1000, 3),
          // Grid — always from TOMZN powerW (the grid-side meter sees all import).
          gridKw: round((sample._tomznPowerW || 0) / 1000, 3),
          // Home — from inverter loadW when on; TOMZN powerW when in bypass mode.
          loadKw: sample.loadW > 0
            ? round(sample.loadW / 1000, 3)
            : round((sample._tomznPowerW || 0) / 1000, 3),
        })));
    } catch (error) { res.status(500).json({ error: error.message }); }
  });

  // Polling is server-owned and is the single source of truth for live data.
  // A unified 5s background loop polls both TOMZN + inverter (using force=true
  // to bypass the max-age guards, since this IS the primary poller) and then
  // broadcasts to all SSE subscribers. This eliminates the old pattern where
  // each frontend client triggered its own backend poll via /live, causing
  // random bursts and desynchronized updates.
  //
  // The 60s persist guard (TOMZN_PERSIST_MIN_INTERVAL_MS) still applies inside
  // pollTomzn, so the database collects one snapshot per minute while the
  // in-memory live cache updates every 5s.
  //
  // Seed stale tracker from DB before first poll so restart doesn't reset the count.
  setTimeout(() => seedStaleTrackerFromDb(snapshots).then(() => pollTomzn()).catch((error) => console.error("[Solar Engine] initial TOMZN poll failed:", error.message)), 2_000);
  setTimeout(() => pollInverter().catch((error) => console.error("[Solar Engine] initial inverter poll failed:", error.message)), 3_000);

  // One-time downsample of legacy high-frequency (every ~5-10s) snapshots to
  // one per minute. Runs shortly after startup so the DB shrinks immediately.
  setTimeout(() => {
    downsampleTomznSnapshots(snapshots)
      .then((deleted) => { if (deleted > 0) console.log(`[Solar Engine] downsampled ${deleted} legacy TOMZN snapshots to 1/min`); })
      .catch((error) => console.error("[Solar Engine] initial TOMZN downsample failed:", error.message));
    downsampleInverterSnapshots(inverterSnapshots)
      .then((deleted) => { if (deleted > 0) console.log(`[Solar Engine] downsampled ${deleted} legacy inverter snapshots to 1/min`); })
      .catch((error) => console.error("[Solar Engine] initial inverter downsample failed:", error.message));
  }, 5_000);

  // Unified 2s background poll loop — polls both TOMZN + inverter in parallel
  // and broadcasts to all SSE clients after EACH individual poll completes (not
  // waiting for both). This cuts tag-change latency significantly: TOMZN-dependent
  // tags (import/standby/offline) update ~1-2s after the device state changes,
  // instead of waiting for the slower inverter poll to finish first.
  // pollTomzn/pollInverter use pollInFlight deduplication so concurrent force=true
  // requests (e.g. /live?force=true on app open) won't double-poll Tuya/InverterZone.
  setInterval(async () => {
    try {
      // Broadcast after each poll completes so subscribers get fresh data
      // as soon as it's available, instead of waiting for both to finish.
      const tomznP = pollTomzn({ force: true })
        .then(() => broadcastLive())
        .catch((e) => console.error("[Solar Engine] TOMZN poll failed:", e.message));
      const inverterP = pollInverter({ force: true })
        .then(() => broadcastLive())
        .catch((e) => console.error("[Solar Engine] inverter poll failed:", e.message));
      await Promise.all([tomznP, inverterP]);
      // Final broadcast with both fresh — ensures gridFlow uses latest from both.
      await broadcastLive();
    } catch (e) { console.error("[Solar Engine] 2s poll loop failed:", e.message); }
  }, 2_000);

  // Weather poll loop — polls weather every 10 minutes so sunrise/sunset are
  // always for the current day (not stale from yesterday). Without this, the
  // scene resolver compares Date.now() against yesterday's sunset, which makes
  // it think it's permanently night after the first sunset. pollWeather() has
  // a 30-min cache built in, so the Open-Meteo API is only hit every 30 min.
  // Broadcasts after each poll so SSE clients get the fresh weather + scene.
  setInterval(async () => {
    try {
      await pollWeather();
      await broadcastLive();
    } catch (e) { console.error("[Solar Engine] weather poll loop failed:", e.message); }
  }, 10 * 60_000);

  // Cleanup: delete inverter snapshots older than 7 days (needed for export
  // subtraction on the 7-day daily usage chart). Old inverter data beyond 7
  // days is not used anywhere else, so it's safe to delete.
  // TOMZN snapshots are kept for 30 days — they're needed for billing cycle calculations,
  // load status history, daily/hourly summaries, and the /tomzn/history endpoint.
  // Weather snapshots older than 7 days are also pruned (only the latest is ever used).
  // Also re-runs the downsample as a safety net in case any high-frequency data
  // was written before the throttling took effect.
  setInterval(async () => {
    try {
      const inverterCutoff = Date.now() - 7 * 86_400_000;
      const tomznCutoff = Date.now() - 30 * 86_400_000;
      const weatherCutoff = Date.now() - 7 * 86_400_000;
      await inverterSnapshots.deleteMany({ timestamp: { $lt: inverterCutoff } });
      await snapshots.deleteMany({ timestamp: { $lt: tomznCutoff } });
      await weatherSnapshots.deleteMany({ timestamp: { $lt: weatherCutoff } });
      await downsampleTomznSnapshots(snapshots);
      await downsampleInverterSnapshots(inverterSnapshots);
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
