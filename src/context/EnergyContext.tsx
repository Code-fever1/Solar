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
  path: "/changeover" | "/manual-readings" | "/baselines";
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
  addManualLog: (meterId: MeterId, reading: number, timestamp: number, notes?: string) => Promise<void>;
  editManualLog: (id: string, reading: number, timestamp: number, notes?: string) => Promise<void>;
  deleteManualLog: (id: string) => Promise<void>;
  clearAlerts: () => void;
  resetAllLogs: () => Promise<void>;
  refreshTomzn: () => Promise<void>;
};

const API_URL = "http://104.43.56.204:3001/api/solar";
const POLL_INTERVAL_MS = 5_000;
const DASHBOARD_CACHE_KEY = "voltx.solar.dashboard.v1";
const PENDING_OPERATIONS_KEY = "voltx.solar.pending-operations.v1";

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
const EMPTY_INVERTER: InverterTelemetry = { solarW: 0, solarV: 0, solarA: 0, gridW: 0, gridV: 0, gridHz: 0, gridConnected: false, gridDirection: "import", loadW: 0, loadVa: 0, loadPercent: 0, inverterMode: "unknown", inverterFault: "UNKNOWN", temperatureC: 0, ratedOutputW: 0, signal: null, fetchedAt: "", isLive: false };
const EMPTY_WEATHER: WeatherState = { code: 0, isDay: true, cloudCover: 0, precipitation: 0, temperatureC: 0, fetchedAt: "", isLive: false };
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
  const [manualBaselines, setManualBaselines] = useState<Record<MeterId, ManualBaseline | null>>({ meter1: null, meter2: null });
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const cacheRef = useRef<StoredDashboard | null>(null);
  const queueSyncRef = useRef<Promise<void> | null>(null);

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

  useEffect(() => {
    let disposed = false;
    const bootstrap = async () => {
      try {
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
        void loadDashboard(true);
        void loadHistory();
      }
    };
    void bootstrap();
    const interval = setInterval(() => loadDashboard(true), POLL_INTERVAL_MS);
    return () => { disposed = true; clearInterval(interval); };
  }, []);

  const activeMeter = snapshot?.activeMeter || "meter1";
  const meters = snapshot?.meters || EMPTY_METERS;
  const home = snapshot?.home || (error ? { ...EMPTY_HOME, explanation: error } : EMPTY_HOME);
  const live = snapshot?.live || EMPTY_LIVE;
  const tomznLive = snapshot?.tomznLive || EMPTY_TOMZN;
  const inverter = snapshot?.inverter || EMPTY_INVERTER;
  const weather = snapshot?.weather || EMPTY_WEATHER;
  const energyToday = snapshot?.energyToday || EMPTY_ENERGY_TODAY;
  const flowHistory = snapshot?.flowHistory || [];
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

  const addManualLog = async (meterId: MeterId, reading: number, timestamp: number, notes?: string) => {
    const entryTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
    await submitOrQueue(
      { id: `manual-${meterId}-${entryTimestamp}`, path: "/manual-readings", method: "POST", body: { meterId, reading, timestamp: entryTimestamp, notes }, createdAt: entryTimestamp },
      (current) => applyOfflineManualReading(current, meterId, reading, entryTimestamp, notes),
    );
  };

  const editManualLog = async (id: string, reading: number, _timestamp: number, notes?: string) => {
    applySnapshot(await request(`/manual-readings/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ reading, notes }) }));
  };

  const deleteManualLog = async (id: string) => {
    applySnapshot(await request(`/manual-readings/${encodeURIComponent(id)}`, { method: "DELETE" }));
  };

  const refreshTomzn = async () => {
    const data = await request("/refresh", { method: "POST" });
    applySnapshot(data.dashboard);
    await loadHistory();
  };

  const value: EnergyContextValue = {
    live, tomznLive, inverter, weather, energyToday, flowHistory, home, meters, activeMeter, changeover, recommendations, alerts,
    history, manualLogs, learningProfiles: {}, manualBaselines, tomznHistory, summary,
    period, loading, isOffline, pendingSyncCount, lastSyncedAt, setPeriod, swapChangeover,
    calibrateMeter: (meterId, reading) => { void addManualLog(meterId, reading, Date.now(), "Manual calibration"); },
    setManualBaseline, addManualLog, editManualLog, deleteManualLog,
    clearAlerts: () => undefined,
    resetAllLogs: async () => { await loadDashboard(false); },
    refreshTomzn,
  };

  return <EnergyContext.Provider value={value}>{children}</EnergyContext.Provider>;
}

export function useEnergy() {
  const context = useContext(EnergyContext);
  if (!context) throw new Error("useEnergy must be used inside EnergyProvider");
  return context;
}
