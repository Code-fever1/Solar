import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import { interpolateUsageHistory, summarizeHistory } from "@/utils/calculations";
import {
    applyOfflineBaseline,
    applyOfflineChangeover,
    applyOfflineManualReading,
    estimateOfflineDashboard,
    type CachedDashboardSnapshot,
    type CachedTomznLive,
} from "@/utils/offline-dashboard";
import type {
    AlertItem,
    EnergyFlowPoint,
    EnergyToday,
    HistoryPoint,
    HomeState,
    InverterTelemetry,
    LiveTelemetry,
    ManualLog,
    MeterId,
    MeterState,
    Recommendation,
    WeatherState,
} from "./energy-types";

export type {
    AlertItem,
    EnergyFlowPoint,
    EnergyToday,
    HistoryPoint,
    HomeState,
    InverterTelemetry,
    LiveTelemetry,
    ManualLog,
    MeterId,
    MeterState,
    Recommendation,
    WeatherState
} from "./energy-types";

export interface ManualBaseline {
  reading: number;
  cycleStartTs: number;
}

export type TomznLive = CachedTomznLive;

type ChangeoverState = { activeMeter: MeterId; lastSwitchedAt: Date };

type DashboardSnapshot = CachedDashboardSnapshot;

type PendingOperation = {
  id: string;
  path: "/changeover" | "/manual-readings" | "/baselines" | "/last-month-total";
  method: "POST";
  body: Record<string, unknown>;
  createdAt: number;
};

type StoredDashboard = { snapshot: DashboardSnapshot; savedAt: number };

type EnergyContextValue = {
  live: LiveTelemetry;
  tomznLive: TomznLive;
  inverter: InverterTelemetry;
  weather: WeatherState;
  energyToday: EnergyToday;
  flowHistory: EnergyFlowPoint[];
  home: HomeState;
  meters: Record<MeterId, MeterState>;
  activeMeter: MeterId;
  changeover: ChangeoverState;
  recommendations: Recommendation[];
  alerts: AlertItem[];
  history: HistoryPoint[];
  manualLogs: ManualLog[];
  learningProfiles: Record<string, never>;
  manualBaselines: Record<MeterId, ManualBaseline | null>;
  tomznHistory: any[];
  meta?: { billingEnd?: number; todayStart?: number; [key: string]: unknown };
  ups: { active: boolean; label: string } | null;
  summary: ReturnType<typeof summarizeHistory>;
  period: "day" | "week" | "month" | "year";
  loading: boolean;
  isOffline: boolean;
  pendingSyncCount: number;
  lastSyncedAt: number | null;
  setPeriod: (period: "day" | "week" | "month" | "year") => void;
  swapChangeover: (target?: MeterId) => void;
  calibrateMeter: (meterId: MeterId, manualReading: number) => void;
  setManualBaseline: (meterId: MeterId, reading: number, cycleStartTs: number) => Promise<void>;
  setLastMonthTotal: (total: number) => Promise<void>;
  addManualLog: (meterId: MeterId, reading: number, timestamp: number, notes?: string) => Promise<void>;
  editManualLog: (id: string, reading: number, timestamp: number, notes?: string) => Promise<void>;
  deleteManualLog: (id: string) => Promise<void>;
  clearAlerts: () => void;
  resetAllLogs: () => Promise<void>;
  refreshTomzn: () => Promise<void>;
  refreshAll: () => Promise<void>;
  refreshTomznForce: () => Promise<void>;
  refreshInverterForce: () => Promise<void>;
};

const API_URL = "http://104.43.56.204:3001/api/solar";
const POLL_FOREGROUND_MS = 5_000;
const POLL_BACKGROUND_MS = 5_000;
const DASHBOARD_CACHE_KEY = "voltx.solar.dashboard.v1";
const PENDING_OPERATIONS_KEY = "voltx.solar.pending-operations.v1";
const LAST_MONTH_TOTAL_KEY = "voltx.solar.last-month-total.v1";
const ACTIVE_METER_OVERRIDE_KEY = "voltx.solar.active-meter-override.v1";
const MANUAL_READINGS_OVERRIDE_KEY = "voltx.solar.manual-readings-override.v1";

const EMPTY_TOMZN: TomznLive = {
  energyKwh: 0, voltageV: 0, currentA: 0, powerW: 0, powerDisplay: "-- W",
  frequencyHz: 50, isOnline: false, switchOn: false, faultCode: 0, fetchedAt: "", isLive: false,
};

const EMPTY_HOME: HomeState = {
  todayUsage: 0, averageDaily: 0, expectedDrawNow: 0, projectedMonthly: 0,
  confidencePercent: 0, trend: "stable", primaryPattern: "transition",
  explanation: "Waiting for the server-side TOMZN engine.",
};

function emptyMeter(id: MeterId): MeterState {
  return {
    id, label: id === "meter1" ? "Meter 1 (Analog)" : "Meter 2 (Digital)", reading: 0,
    remainingUnits: 200, cycleUsage: 0, targetUnits: 200, driftOffset: 0,
    averageError: 0, calibrationCount: 0, queueStatus: id === "meter1" ? "ACTIVE" : "NEXT",
    projectedDaysLeft: 0, projectedSlabDate: 0, projectedMonthly: 0, averageDaily: 0,
    averageLast3Days: 0, currentDaily: 0, targetDaily: 0, paceRatio: 0,
    trendStatus: "stable", predictionConfidence: 0, healthScore: 0, healthColor: "#64748B",
    consumptionSpeedScore: 0, consumptionSpeedColor: "#64748B", remainingColor: "#64748B",
    todayUsage: 0, recentDailyAvg: 0, expectedDrawNow: 0,
    explanation: "Waiting for the server-side TOMZN engine.", confidencePercent: 0,
    minLikelyReading: 0, maxLikelyReading: 0, trend: "stable",
  };
}

const EMPTY_METERS: Record<MeterId, MeterState> = { meter1: emptyMeter("meter1"), meter2: emptyMeter("meter2") };
const EMPTY_LIVE: LiveTelemetry = { gridKw: 0, solarKw: 0, homeKw: 0, currentAmp: 0, voltage: 0, frequency: 50, powerFactor: 0 };
const EMPTY_INVERTER: InverterTelemetry = { solarW: 0, solarV: 0, solarA: 0, gridW: 0, gridWRaw: 0, gridV: 0, gridHz: 0, gridConnected: false, gridDirection: "import", loadW: 0, loadVa: 0, loadPercent: 0, acOutV: 0, acOutHz: 0, inverterMode: "unknown", inverterFault: "UNKNOWN", temperatureC: 0, ratedOutputW: 0, signal: null, sourceTime: null, fetchedAt: "", isLive: false };
// isDay is derived from the device's local hour so the empty fallback doesn't
// report daytime at night (which would force daytime hero scenes/labels before
// the backend has responded). Pakistan users' local hour matches the site TZ.
const EMPTY_WEATHER: WeatherState = { code: 0, isDay: new Date().getHours() >= 5 && new Date().getHours() < 19, cloudCover: 0, precipitation: 0, temperatureC: 0, sunrise: null, sunset: null, fetchedAt: "", isLive: false };
const EMPTY_ENERGY_TODAY: EnergyToday = { solarKwh: 0, homeKwh: 0, gridKwh: 0 };

const EnergyContext = createContext<EnergyContextValue | null>(null);

/**
 * The phone renders a server snapshot only. It no longer estimates readings,
 * stores baselines, or assigns TOMZN deltas locally; that work is authoritative
 * on the VM so every device sees the same dashboard.
 */
export function EnergyProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [tomznHistory, setTomznHistory] = useState<any[]>([]);
  const [flowHistory24h, setFlowHistory24h] = useState<{ timestamp: number; solarKw: number; gridKw: number; loadKw: number }[]>([]);
  const [manualBaselines, setManualBaselines] = useState<Record<MeterId, ManualBaseline | null>>({ meter1: null, meter2: null });
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const cacheRef = useRef<StoredDashboard | null>(null);
  const queueSyncRef = useRef<Promise<void> | null>(null);
  const lastMonthTotalRef = useRef<number | null>(null);
  const activeMeterOverrideRef = useRef<{ meterId: MeterId; timestamp: number } | null>(null);
  const manualReadingOverrideRef = useRef<Record<MeterId, { reading: number; timestamp: number } | null>>({ meter1: null, meter2: null });
  const deletedLogIdsRef = useRef<Set<string>>(new Set());

  const normaliseSnapshot = (data: DashboardSnapshot): DashboardSnapshot => ({
      ...data,
      changeover: { ...data.changeover, lastSwitchedAt: Number(data.changeover.lastSwitchedAt) },
      manualLogs: [...(data.manualLogs || [])].sort((a, b) => a.timestamp - b.timestamp),
    });

  const saveSnapshot = (data: DashboardSnapshot, savedAt = Date.now()) => {
    const stored = { snapshot: normaliseSnapshot(data), savedAt };
    cacheRef.current = stored;
    setLastSyncedAt(savedAt);
    void AsyncStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(stored)).catch(() => undefined);
  };

  const applySnapshot = (data: DashboardSnapshot, options: { persist?: boolean; clearError?: boolean } = {}) => {
    const next = normaliseSnapshot(data);
    // Filter out logs that were deleted locally (so polling doesn't re-add them)
    if (deletedLogIdsRef.current.size > 0 && next.manualLogs?.length) {
      next.manualLogs = next.manualLogs.filter((l) => !deletedLogIdsRef.current.has(l.id));
    }
    // Merge local lastMonthTotal override so it survives polling refreshes
    if (lastMonthTotalRef.current != null && (next.home?.lastMonthTotal == null || next.home.lastMonthTotal === 0)) {
      next.home = { ...next.home, lastMonthTotal: lastMonthTotalRef.current };
      if (next.home.vsLastMonthPercent == null && next.home.projectedMonthly != null && lastMonthTotalRef.current > 0) {
        next.home.vsLastMonthPercent = Math.max(-99, Math.min(99, Math.round(((next.home.projectedMonthly - lastMonthTotalRef.current) / lastMonthTotalRef.current) * 1000) / 10));
      }
    }
    // Merge active meter override so swaps survive polling refreshes
    if (activeMeterOverrideRef.current) {
      const override = activeMeterOverrideRef.current;
      if (next.changeover && next.changeover.lastSwitchedAt >= override.timestamp) {
        activeMeterOverrideRef.current = null;
        void AsyncStorage.removeItem(ACTIVE_METER_OVERRIDE_KEY).catch(() => undefined);
      } else if (next.activeMeter !== override.meterId) {
        const otherMeter: MeterId = override.meterId === "meter1" ? "meter2" : "meter1";
        next.activeMeter = override.meterId;
        next.changeover = { activeMeter: override.meterId, lastSwitchedAt: override.timestamp };
        if (next.meters) {
          next.meters = {
            ...next.meters,
            [override.meterId]: { ...next.meters[override.meterId], queueStatus: "ACTIVE" },
            [otherMeter]: { ...next.meters[otherMeter], queueStatus: "NEXT" },
          };
        }
      }
    }
    // Merge manual reading overrides so latest readings survive polling refreshes
    if (next.meters) {
      for (const meterId of ["meter1", "meter2"] as MeterId[]) {
        const override = manualReadingOverrideRef.current[meterId];
        if (override && next.meters[meterId]) {
          const meter = next.meters[meterId];
          // If we have received an update from the server that includes our manual log
          // (or a newer one), we can safely drop the local override.
          if (meter.lastLoggedAt && (meter.lastLoggedAt >= override.timestamp || meter.lastLoggedReading === override.reading)) {
            manualReadingOverrideRef.current[meterId] = null;
            void AsyncStorage.setItem(MANUAL_READINGS_OVERRIDE_KEY, JSON.stringify(manualReadingOverrideRef.current)).catch(() => undefined);
          } else {
            const baselineReading = meter.reading - (meter.cycleUsage || 0);
            const cycleUsage = Math.max(0, override.reading - baselineReading);
            next.meters = {
              ...next.meters,
              [meterId]: {
                ...meter,
                reading: override.reading,
                cycleUsage,
                remainingUnits: Math.max(0, meter.targetUnits - cycleUsage),
                lastLoggedAt: override.timestamp,
                lastLoggedReading: override.reading,
              },
            };
          }
        }
      }
    }
    setSnapshot(next);
    if (options.persist !== false) saveSnapshot(next);
    if (options.clearError !== false) {
      setIsOffline(false);
      setError(null);
    }
  };

  const readPendingOperations = async (): Promise<PendingOperation[]> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_OPERATIONS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is PendingOperation => Boolean(item?.id && item?.path && item?.body)) : [];
    } catch {
      return [];
    }
  };

  const savePendingOperations = async (operations: PendingOperation[]) => {
    setPendingSyncCount(operations.length);
    await AsyncStorage.setItem(PENDING_OPERATIONS_KEY, JSON.stringify(operations));
  };

  const enqueueOperation = async (operation: PendingOperation) => {
    const queued = await readPendingOperations();
    await savePendingOperations([...queued, operation].sort((a, b) => a.createdAt - b.createdAt));
  };

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Solar server request failed");
    return data;
  };

  const flushPendingOperations = async () => {
    if (queueSyncRef.current) return queueSyncRef.current;
    queueSyncRef.current = (async () => {
      const queued = await readPendingOperations();
      if (!queued.length) {
        setPendingSyncCount(0);
        return;
      }
      let remaining = queued;
      for (let index = 0; index < queued.length; index += 1) {
        const operation = queued[index];
        try {
          const data = await request(operation.path, { method: operation.method, body: JSON.stringify(operation.body) });
          applySnapshot(data);
          remaining = queued.slice(index + 1);
        } catch (cause) {
          setIsOffline(true);
          setError(cause instanceof Error ? cause.message : "Pending solar changes are waiting to sync");
          break;
        }
      }
      await savePendingOperations(remaining);
    })();
    try {
      await queueSyncRef.current;
    } finally {
      queueSyncRef.current = null;
    }
  };

  const showOfflineEstimate = (cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "Unable to reach solar server");
    setIsOffline(true);
    const cached = cacheRef.current;
    if (cached) applySnapshot(estimateOfflineDashboard(cached.snapshot, cached.savedAt), { persist: false, clearError: false });
  };

  const loadDashboard = async (refresh = true) => {
    try {
      const data = await request(`/dashboard?refresh=${refresh ? "true" : "false"}`);
      applySnapshot(data);
      await flushPendingOperations();
    } catch (cause) {
      showOfflineEstimate(cause);
      console.warn("[Solar Engine] dashboard fetch failed", cause);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try { setTomznHistory(await request("/tomzn/history")); } catch { /* dashboard remains usable */ }
  };

  const loadFlowHistory = async () => {
    try {
      const data = await request("/flow-history");
      if (Array.isArray(data)) setFlowHistory24h(data);
    } catch { /* flow history is optional — dashboard still works */ }
  };

  useEffect(() => {
    let disposed = false;
    const bootstrap = async () => {
      try {
        const rawLastMonth = await AsyncStorage.getItem(LAST_MONTH_TOTAL_KEY);
        if (rawLastMonth != null) lastMonthTotalRef.current = Number(rawLastMonth) || null;
        const rawActiveMeter = await AsyncStorage.getItem(ACTIVE_METER_OVERRIDE_KEY);
        if (rawActiveMeter) {
          const parsed = JSON.parse(rawActiveMeter);
          if (parsed?.meterId && Number.isFinite(parsed.timestamp)) activeMeterOverrideRef.current = parsed;
        }
        const rawManualReadings = await AsyncStorage.getItem(MANUAL_READINGS_OVERRIDE_KEY);
        if (rawManualReadings) {
          const parsed = JSON.parse(rawManualReadings);
          if (parsed && typeof parsed === "object") manualReadingOverrideRef.current = { meter1: parsed.meter1 ?? null, meter2: parsed.meter2 ?? null };
        }
        const raw = await AsyncStorage.getItem(DASHBOARD_CACHE_KEY);
        const cached = raw ? JSON.parse(raw) as StoredDashboard : null;
        if (!disposed && cached?.snapshot?.meters && Number.isFinite(cached.savedAt)) {
          cacheRef.current = { snapshot: normaliseSnapshot(cached.snapshot), savedAt: cached.savedAt };
          setLastSyncedAt(cached.savedAt);
          applySnapshot(estimateOfflineDashboard(cacheRef.current.snapshot, cached.savedAt), { persist: false, clearError: false });
          setIsOffline(true);
          setLoading(false);
        }
        const queued = await readPendingOperations();
        if (!disposed) setPendingSyncCount(queued.length);
      } catch {
        // A bad cache must never prevent the fresh server engine from loading.
      }
      if (!disposed) {
        // Cold start: force-refresh both TOMZN and inverter immediately (bypasses
        // backend 5s max-age guards) so the user sees fresh data right away.
        void refreshAll();
        void loadFlowHistory();
      }
    };
    void bootstrap();

    // Adaptive polling: 5s when app is foregrounded, 5s when backgrounded.
    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = (ms: number) => {
      if (interval) clearInterval(interval);
      interval = setInterval(() => loadDashboard(true), ms);
    };
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === "active") {
        // App came to foreground — force-refresh both TOMZN and inverter immediately
        // (bypasses backend 5s max-age guards), then switch to 5s polling.
        void refreshAll();
        void loadFlowHistory();
        startPolling(POLL_FOREGROUND_MS);
      } else {
        // App went to background — keep polling at 5s.
        startPolling(POLL_BACKGROUND_MS);
      }
    };
    const subscription = AppState.addEventListener("change", onAppStateChange);
    startPolling(POLL_FOREGROUND_MS);

    return () => {
      disposed = true;
      if (interval) clearInterval(interval);
      subscription.remove();
    };
  }, []);

  const activeMeter = snapshot?.activeMeter || "meter1";
  const meters = snapshot?.meters || EMPTY_METERS;
  const home = snapshot?.home || (error ? { ...EMPTY_HOME, explanation: error } : EMPTY_HOME);
  const live = snapshot?.live || EMPTY_LIVE;
  const tomznLive = snapshot?.tomznLive || EMPTY_TOMZN;
  const inverter = snapshot?.inverter
    ? { ...EMPTY_INVERTER, ...snapshot.inverter }
    : EMPTY_INVERTER;
  const weather = snapshot?.weather || EMPTY_WEATHER;
  const energyToday = snapshot?.energyToday || EMPTY_ENERGY_TODAY;
  // Prefer the dedicated 24h flow-history endpoint (fresh data even after offline period),
  // fall back to the dashboard's embedded flowHistory.
  const flowHistory = flowHistory24h.length > 0 ? flowHistory24h : (snapshot?.flowHistory || []);
  const manualLogs = snapshot?.manualLogs || [];
  const changeover: ChangeoverState = {
    activeMeter,
    lastSwitchedAt: new Date(snapshot?.changeover.lastSwitchedAt || Date.now()),
  };

  const history = useMemo(() => interpolateUsageHistory(manualLogs, period), [manualLogs, period]);
  const summary = useMemo(() => summarizeHistory(history), [history]);
  const recommendations = useMemo<Recommendation[]>(() => {
    if (!snapshot) return [];
    if (home.averageDaily === 0) return [{ id: "learning", title: "Learning TOMZN usage", description: "A daily forecast appears after the server has enough TOMZN intervals.", action: "Keep TOMZN online", priority: "low", trend: "flat" }];
    return [{ id: "server-forecast", title: "Server forecast active", description: home.explanation, action: "Review meter pace", priority: "low", trend: "flat" }];
  }, [snapshot, home.averageDaily, home.explanation]);
  const alerts = useMemo<AlertItem[]>(() => {
    const result: AlertItem[] = [];
    for (const meter of Object.values(meters)) {
      if (meter.remainingUnits <= 0) result.push({ id: `slab-${meter.id}`, title: `${meter.label} slab reached`, description: "Switch the active meter to keep the slab plan aligned.", severity: "critical", source: meter.label, createdAt: new Date() });
    }
    return result;
  }, [meters]);

  const submitOrQueue = async (
    operation: PendingOperation,
    optimistic: (current: DashboardSnapshot) => DashboardSnapshot,
  ) => {
    try {
      applySnapshot(await request(operation.path, { method: operation.method, body: JSON.stringify(operation.body) }));
    } catch (cause) {
      await enqueueOperation(operation);
      setIsOffline(true);
      setError("Saved on this phone. It will sync automatically when Voltix reconnects.");
      const base = snapshot || cacheRef.current?.snapshot;
      if (base) applySnapshot(optimistic(base), { clearError: false });
      console.warn("[Solar Engine] operation queued for sync", cause);
    }
  };

  const swapChangeover = async (target?: MeterId) => {
    const meterId = target || (activeMeter === "meter1" ? "meter2" : "meter1");
    const timestamp = Date.now();
    activeMeterOverrideRef.current = { meterId, timestamp };
    void AsyncStorage.setItem(ACTIVE_METER_OVERRIDE_KEY, JSON.stringify({ meterId, timestamp })).catch(() => undefined);
    await submitOrQueue(
      { id: `changeover-${timestamp}`, path: "/changeover", method: "POST", body: { meterId, timestamp }, createdAt: timestamp },
      (current) => applyOfflineChangeover(current, meterId, timestamp),
    );
  };

  const setManualBaseline = async (meterId: MeterId, reading: number, cycleStartTs: number) => {
    setManualBaselines((previous) => ({ ...previous, [meterId]: { reading, cycleStartTs } }));
    const timestamp = Date.now();
    await submitOrQueue(
      { id: `baseline-${meterId}-${timestamp}`, path: "/baselines", method: "POST", body: { meterId, reading, cycleStartTs, timestamp }, createdAt: timestamp },
      (current) => applyOfflineBaseline(current, meterId, reading),
    );
  };

  const setLastMonthTotal = async (total: number) => {
    lastMonthTotalRef.current = total;
    void AsyncStorage.setItem(LAST_MONTH_TOTAL_KEY, String(total)).catch(() => undefined);
    const timestamp = Date.now();
    await submitOrQueue(
      { id: `last-month-total-${timestamp}`, path: "/last-month-total", method: "POST", body: { total, timestamp }, createdAt: timestamp },
      (current) => ({ ...current, home: { ...current.home, lastMonthTotal: total } }),
    );
  };

  const addManualLog = async (meterId: MeterId, reading: number, timestamp: number, notes?: string) => {
    const entryTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
    manualReadingOverrideRef.current = {
      ...manualReadingOverrideRef.current,
      [meterId]: { reading, timestamp: entryTimestamp },
    };
    void AsyncStorage.setItem(MANUAL_READINGS_OVERRIDE_KEY, JSON.stringify(manualReadingOverrideRef.current)).catch(() => undefined);
    await submitOrQueue(
      { id: `manual-${meterId}-${entryTimestamp}`, path: "/manual-readings", method: "POST", body: { meterId, reading, timestamp: entryTimestamp, notes }, createdAt: entryTimestamp },
      (current) => applyOfflineManualReading(current, meterId, reading, entryTimestamp, notes),
    );
  };

  const editManualLog = async (id: string, reading: number, _timestamp: number, notes?: string) => {
    applySnapshot(await request(`/manual-readings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ reading, notes }) }));
  };

  const deleteManualLog = async (id: string) => {
    // Track the deleted ID so polling doesn't re-add it
    deletedLogIdsRef.current.add(id);
    // Find which meter this log belongs to and clear its override
    const log = snapshot?.manualLogs?.find((l) => l.id === id);
    if (log) {
      manualReadingOverrideRef.current = {
        ...manualReadingOverrideRef.current,
        [log.meterId]: null,
      };
      void AsyncStorage.setItem(MANUAL_READINGS_OVERRIDE_KEY, JSON.stringify(manualReadingOverrideRef.current)).catch(() => undefined);
    }
    // Optimistically remove the log from the local snapshot immediately
    if (snapshot) {
      const optimistic = {
        ...snapshot,
        manualLogs: snapshot.manualLogs.filter((l) => l.id !== id),
      };
      applySnapshot(optimistic);
    }
    // Only call the server for non-offline logs
    if (id && !id.startsWith("offline-")) {
      try {
        applySnapshot(await request(`/manual-readings/${encodeURIComponent(id)}`, { method: "DELETE" }));
        // Server confirmed deletion — remove from tracking set
        deletedLogIdsRef.current.delete(id);
      } catch {
        // Server unavailable — log stays deleted locally via tracking set
      }
    }
  };

  const refreshTomzn = async () => {
    const data = await request("/refresh", { method: "POST" });
    applySnapshot(data.dashboard);
    await loadHistory();
  };

  // Force-refresh both TOMZN and inverter (bypasses backend 5s max-age guards).
  // Used on app open, manual sync button press.
  const refreshAll = async () => {
    try {
      const data = await request("/refresh?force=true", { method: "POST" });
      applySnapshot(data.dashboard);
      await loadHistory();
    } catch (cause) {
      showOfflineEstimate(cause);
      console.warn("[Solar Engine] force refresh failed", cause);
    } finally {
      setLoading(false);
    }
  };

  // Force-refresh only TOMZN (bypasses live-cache guard).
  const refreshTomznForce = async () => {
    try {
      const data = await request("/refresh/tomzn?force=true", { method: "POST" });
      applySnapshot(data.dashboard);
      await loadHistory();
    } catch (cause) {
      showOfflineEstimate(cause);
      console.warn("[Solar Engine] tomzn force refresh failed", cause);
    } finally {
      setLoading(false);
    }
  };

  // Force-refresh only the inverter (bypasses max-age guard).
  const refreshInverterForce = async () => {
    try {
      const data = await request("/refresh/inverter?force=true", { method: "POST" });
      applySnapshot(data.dashboard);
    } catch (cause) {
      showOfflineEstimate(cause);
      console.warn("[Solar Engine] inverter force refresh failed", cause);
    } finally {
      setLoading(false);
    }
  };

  const value: EnergyContextValue = {
    live, tomznLive, inverter, weather, energyToday, flowHistory, home, meters, activeMeter, changeover, recommendations, alerts,
    history, manualLogs, learningProfiles: {}, manualBaselines, tomznHistory, meta: snapshot?.meta, ups: snapshot?.ups ?? null, summary,
    period, loading, isOffline, pendingSyncCount, lastSyncedAt, setPeriod, swapChangeover,
    calibrateMeter: (meterId, reading) => { void addManualLog(meterId, reading, Date.now(), "Manual calibration"); },
    setManualBaseline, setLastMonthTotal, addManualLog, editManualLog, deleteManualLog,
    clearAlerts: () => undefined,
    resetAllLogs: async () => { await loadDashboard(false); },
    refreshTomzn,
    refreshAll,
    refreshTomznForce,
    refreshInverterForce,
  };

  return <EnergyContext.Provider value={value}>{children}</EnergyContext.Provider>;
}

export function useEnergy() {
  const context = useContext(EnergyContext);
  if (!context) throw new Error("useEnergy must be used inside EnergyProvider");
  return context;
}
