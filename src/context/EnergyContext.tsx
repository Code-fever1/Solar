import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

import {
    buildRecommendations,
    getReadingAt,
    getStartOfBillingCycle,
    interpolateUsageHistory,
    summarizeHistory
} from "@/utils/calculations";
import type {
    AlertItem,
    HistoryPoint,
    LiveTelemetry,
    ManualLog,
    MeterId,
    MeterState,
    HomeState,
    Recommendation,
} from "./energy-types";
import { AdaptivePredictor } from "../utils/AdaptivePredictor";

type ChangeoverState = {
  activeMeter: MeterId;
  lastSwitchedAt: Date;
};

export interface ManualBaseline {
  reading: number;
  cycleStartTs: number;
}

type EnergyContextValue = {
  live: LiveTelemetry;
  home: HomeState;
  meters: Record<MeterId, MeterState>;
  activeMeter: MeterId;
  changeover: ChangeoverState;
  recommendations: Recommendation[];
  alerts: AlertItem[];
  history: HistoryPoint[];
  manualLogs: ManualLog[];
  manualBaselines: Record<MeterId, ManualBaseline | null>;
  summary: ReturnType<typeof summarizeHistory>;
  period: "day" | "week" | "month" | "year";
  loading: boolean;
  setPeriod: (period: "day" | "week" | "month" | "year") => void;
  swapChangeover: (target?: MeterId) => void;
  calibrateMeter: (meterId: MeterId, manualReading: number) => void;
  setManualBaseline: (meterId: MeterId, reading: number, cycleStartTs: number) => Promise<void>;
  addManualLog: (
    meterId: MeterId,
    reading: number,
    timestamp: number,
    notes?: string,
  ) => Promise<void>;
  editManualLog: (
    id: string,
    reading: number,
    timestamp: number,
    notes?: string,
  ) => Promise<void>;
  deleteManualLog: (id: string) => Promise<void>;
  clearAlerts: () => void;
  resetAllLogs: () => Promise<void>;
};

const STORAGE_KEY_LOGS = "@solar_manual_logs";
const STORAGE_KEY_ACTIVE_METER = "@solar_active_meter";
const STORAGE_KEY_BASELINES = "@solar_manual_baselines";

const EnergyContext = createContext<EnergyContextValue | null>(null);

// User's Real Billing Cycle Logs from 28 Jun 2026 to 18 Jul 2026
const generateMockLogs = (): ManualLog[] => {
  const logs: ManualLog[] = [];

  // 1: 28 Jun (Cycle Start baseline)
  logs.push({
    id: "real-0a",
    timestamp: new Date(2026, 5, 28, 0, 0).getTime(),
    meterId: "meter1",
    reading: 59358.0,
    notes: "Billing Start Baseline",
  });
  logs.push({
    id: "real-0b",
    timestamp: new Date(2026, 5, 28, 0, 0).getTime(),
    meterId: "meter2",
    reading: 14881.0,
    notes: "Billing Start Baseline",
  });

  // 2: 8 Jul, 4:30 AM
  logs.push({
    id: "real-1a",
    timestamp: new Date(2026, 6, 8, 4, 30).getTime(),
    meterId: "meter1",
    reading: 59405.7,
    notes: "Log 8-Jul 04:30",
  });
  logs.push({
    id: "real-1b",
    timestamp: new Date(2026, 6, 8, 4, 30).getTime(),
    meterId: "meter2",
    reading: 14982.6,
    notes: "Log 8-Jul 04:30",
  });

  // 3: 10 Jul, 6:00 PM
  logs.push({
    id: "real-2a",
    timestamp: new Date(2026, 6, 10, 18, 0).getTime(),
    meterId: "meter1",
    reading: 59423.5,
    notes: "Log 10-Jul 18:00",
  });
  logs.push({
    id: "real-2b",
    timestamp: new Date(2026, 6, 10, 18, 0).getTime(),
    meterId: "meter2",
    reading: 14985.1,
    notes: "Log 10-Jul 18:00",
  });

  // 4: 11 Jul, 8:20 PM
  logs.push({
    id: "real-3a",
    timestamp: new Date(2026, 6, 11, 20, 20).getTime(),
    meterId: "meter1",
    reading: 59436.0,
    notes: "Log 11-Jul 20:20",
  });
  logs.push({
    id: "real-3b",
    timestamp: new Date(2026, 6, 11, 20, 20).getTime(),
    meterId: "meter2",
    reading: 15002.8,
    notes: "Log 11-Jul 20:20",
  });

  // 5: 13 Jul, 7:30 AM (Meter 2 is standby, keeps last reading 15002.8)
  logs.push({
    id: "real-4a",
    timestamp: new Date(2026, 6, 13, 7, 30).getTime(),
    meterId: "meter1",
    reading: 59445.0,
    notes: "Log 13-Jul 07:30",
  });

  // 6: 13 Jul, 6:30 PM
  logs.push({
    id: "real-5a",
    timestamp: new Date(2026, 6, 13, 18, 30).getTime(),
    meterId: "meter1",
    reading: 59446.0,
    notes: "Log 13-Jul 18:30",
  });
  logs.push({
    id: "real-5b",
    timestamp: new Date(2026, 6, 13, 18, 30).getTime(),
    meterId: "meter2",
    reading: 15002.9,
    notes: "Log 13-Jul 18:30",
  });

  // 7: 14 Jul, 9:10 AM
  logs.push({
    id: "real-6a",
    timestamp: new Date(2026, 6, 14, 9, 10).getTime(),
    meterId: "meter1",
    reading: 59447.0,
    notes: "Log 14-Jul 09:10",
  });
  logs.push({
    id: "real-6b",
    timestamp: new Date(2026, 6, 14, 9, 10).getTime(),
    meterId: "meter2",
    reading: 15009.4,
    notes: "Log 14-Jul 09:10",
  });

  // 8: 14 Jul, 4:12 PM
  logs.push({
    id: "real-7a",
    timestamp: new Date(2026, 6, 14, 16, 12).getTime(),
    meterId: "meter1",
    reading: 59447.0,
    notes: "Log 14-Jul 16:12",
  });
  logs.push({
    id: "real-7b",
    timestamp: new Date(2026, 6, 14, 16, 12).getTime(),
    meterId: "meter2",
    reading: 15009.4,
    notes: "Log 14-Jul 16:12",
  });

  // 9: 15 Jul, 10:30 AM
  logs.push({
    id: "real-8a",
    timestamp: new Date(2026, 6, 15, 10, 30).getTime(),
    meterId: "meter1",
    reading: 59452.0,
    notes: "Log 15-Jul 10:30",
  });
  logs.push({
    id: "real-8b",
    timestamp: new Date(2026, 6, 15, 10, 30).getTime(),
    meterId: "meter2",
    reading: 15017.4,
    notes: "Log 15-Jul 10:30",
  });

  // 10: 15 Jul, 6:30 PM (approximate time for later reading)
  logs.push({
    id: "real-9a",
    timestamp: new Date(2026, 6, 15, 18, 30).getTime(),
    meterId: "meter1",
    reading: 59453.0,
    notes: "Log 15-Jul Later",
  });
  logs.push({
    id: "real-9b",
    timestamp: new Date(2026, 6, 15, 18, 30).getTime(),
    meterId: "meter2",
    reading: 15025.8,
    notes: "Log 15-Jul Later",
  });

  // 11: 16 Jul, 9:00 AM
  logs.push({
    id: "real-10a",
    timestamp: new Date(2026, 6, 16, 9, 0).getTime(),
    meterId: "meter1",
    reading: 59457.0,
    notes: "Log 16-Jul 09:00",
  });
  logs.push({
    id: "real-10b",
    timestamp: new Date(2026, 6, 16, 9, 0).getTime(),
    meterId: "meter2",
    reading: 15025.8,
    notes: "Log 16-Jul 09:00 (standby)",
  });

  // 12: 16 Jul, 10:50 PM
  logs.push({
    id: "real-11a",
    timestamp: new Date(2026, 6, 16, 22, 50).getTime(),
    meterId: "meter1",
    reading: 59458.5,
    notes: "Log 16-Jul 22:50",
  });
  logs.push({
    id: "real-11b",
    timestamp: new Date(2026, 6, 16, 22, 50).getTime(),
    meterId: "meter2",
    reading: 15025.8,
    notes: "Log 16-Jul 22:50 (standby)",
  });

  // 13: 17 Jul, 9:20 AM
  logs.push({
    id: "real-12a",
    timestamp: new Date(2026, 6, 17, 9, 20).getTime(),
    meterId: "meter1",
    reading: 59458.5,
    notes: "Log 17-Jul 09:20 (standby)",
  });
  logs.push({
    id: "real-12b",
    timestamp: new Date(2026, 6, 17, 9, 20).getTime(),
    meterId: "meter2",
    reading: 15034.6,
    notes: "Log 17-Jul 09:20",
  });

  // 14: 17 Jul, 6:00 PM
  logs.push({
    id: "real-13a",
    timestamp: new Date(2026, 6, 17, 18, 0).getTime(),
    meterId: "meter1",
    reading: 59459.0,
    notes: "Log 17-Jul 18:00 (standby)",
  });
  logs.push({
    id: "real-13b",
    timestamp: new Date(2026, 6, 17, 18, 0).getTime(),
    meterId: "meter2",
    reading: 15034.6,
    notes: "Log 17-Jul 18:00",
  });

  // 15: 17 Jul, 10:22 PM
  logs.push({
    id: "real-14a",
    timestamp: new Date(2026, 6, 17, 22, 22).getTime(),
    meterId: "meter1",
    reading: 59460.6,
    notes: "Log 17-Jul 22:22 (standby)",
  });
  logs.push({
    id: "real-14b",
    timestamp: new Date(2026, 6, 17, 22, 22).getTime(),
    meterId: "meter2",
    reading: 15034.6,
    notes: "Log 17-Jul 22:22",
  });

  // 16: 18 Jul, 6:21 AM
  logs.push({
    id: "real-15a",
    timestamp: new Date(2026, 6, 18, 6, 21).getTime(),
    meterId: "meter1",
    reading: 59468.5,
    notes: "Log 18-Jul 06:21",
  });
  logs.push({
    id: "real-15b",
    timestamp: new Date(2026, 6, 18, 6, 21).getTime(),
    meterId: "meter2",
    reading: 15034.6,
    notes: "Log 18-Jul 06:21 (standby)",
  });

  // 17: 18 Jul, 5:00 PM
  logs.push({
    id: "real-16a",
    timestamp: new Date(2026, 6, 18, 17, 0).getTime(),
    meterId: "meter1",
    reading: 59470.0,
    notes: "Log 18-Jul 17:00",
  });
  logs.push({
    id: "real-16b",
    timestamp: new Date(2026, 6, 18, 17, 0).getTime(),
    meterId: "meter2",
    reading: 15034.6,
    notes: "Log 18-Jul 17:00 (standby)",
  });

  // 18: 18 Jul, 7:12 PM
  logs.push({
    id: "real-17a",
    timestamp: new Date(2026, 6, 18, 19, 12).getTime(),
    meterId: "meter1",
    reading: 59471.5,
    notes: "Log 18-Jul 19:12",
  });
  logs.push({
    id: "real-17b",
    timestamp: new Date(2026, 6, 18, 19, 12).getTime(),
    meterId: "meter2",
    reading: 15034.6,
    notes: "Log 18-Jul 19:12 (standby)",
  });

  return logs.sort((a, b) => a.timestamp - b.timestamp);
};

const buildManualAlerts = (
  logs: ManualLog[],
  metersData: Record<MeterId, MeterState>,
): AlertItem[] => {
  const alerts: AlertItem[] = [];
  const now = Date.now();

  const lastLogTime = Math.max(
    metersData.meter1.lastLoggedAt || 0,
    metersData.meter2.lastLoggedAt || 0,
  );

  if (lastLogTime > 0 && now - lastLogTime > 24 * 60 * 60 * 1000) {
    const hours = Math.round((now - lastLogTime) / (1000 * 60 * 60));
    alerts.push({
      id: "stale-logs",
      title: "Logs are stale",
      description: `It has been ${hours} hours since your last manual reading. Please enter current units.`,
      severity: "warning",
      source: "System",
      createdAt: new Date(lastLogTime),
    });
  }

  const checkSlabAlert = (id: "meter1" | "meter2", name: string) => {
    const meter = metersData[id];
    const consumed = meter.targetUnits - meter.remainingUnits;

    if (consumed > 170 && consumed < 200) {
      alerts.push({
        id: `slab-alert-${id}-200`,
        title: `${name} slab warning`,
        description: `Cumulative monthly usage is ${consumed.toFixed(1)} units, very close to the 200 unit slab limit. Consider switching active meter!`,
        severity: "warning",
        source: name,
        createdAt: new Date(),
      });
    } else if (consumed >= 200) {
      alerts.push({
        id: `slab-alert-${id}-exceeded`,
        title: `${name} slab exceeded`,
        description: `Cumulative monthly usage of ${consumed.toFixed(1)} units has exceeded the 200 unit slab limit. Flip active changeover!`,
        severity: "critical",
        source: name,
        createdAt: new Date(),
      });
    }
  };

  checkSlabAlert("meter1", "Meter 1 (Analog)");
  checkSlabAlert("meter2", "Meter 2 (Digital)");

  return alerts;
};

export function EnergyProvider({ children }: { children: ReactNode }) {
  const [manualLogs, setManualLogs] = useState<ManualLog[]>([]);
  const [manualBaselines, setManualBaselines] = useState<Record<MeterId, ManualBaseline | null>>({
    meter1: null,
    meter2: null,
  });
  const [activeMeter, setActiveMeter] = useState<MeterId>("meter1");
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">(
    "day",
  );
  const [loading, setLoading] = useState(true);
  const [lastSwitchedAt, setLastSwitchedAt] = useState<Date>(new Date());
  const [clearedAlerts, setClearedAlerts] = useState(false);
  const [tick, setTick] = useState(0);

  // Real-time ticking effect to drive live extrapolation refreshes (every 60 seconds)
  // AdaptivePredictor is heavy — no benefit running faster than a minute since
  // manual logs don't update more frequently than that.
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const storedLogs = await AsyncStorage.getItem(STORAGE_KEY_LOGS);
        const storedActiveMeter = await AsyncStorage.getItem(
          STORAGE_KEY_ACTIVE_METER,
        );

        let parsedLogs = storedLogs ? JSON.parse(storedLogs) : [];
        // Detect if the database contains the correct start baseline reading 59358.0
        const hasStartFreshLogs = parsedLogs.some(
          (l: any) => l.reading === 59358.0,
        );

        if (!storedLogs || !hasStartFreshLogs) {
          // Clear and initialize with the new official logs
          const demo = generateMockLogs();
          setManualLogs(demo);
          await AsyncStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(demo));
        } else {
          setManualLogs(parsedLogs);
        }

        const storedBaselines = await AsyncStorage.getItem(STORAGE_KEY_BASELINES);
        if (storedBaselines) {
          setManualBaselines(JSON.parse(storedBaselines));
        }

        if (storedActiveMeter) {
          setActiveMeter(storedActiveMeter as MeterId);
        }
      } catch (e) {
        console.error("Failed to load storage data", e);
      } finally {
        setLoading(false);
      }
    };
    loadStoredData();
  }, []);

  const saveLogs = async (newLogs: ManualLog[]) => {
    const sorted = [...newLogs].sort((a, b) => a.timestamp - b.timestamp);
    setManualLogs(sorted);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(sorted));
    } catch (e) {
      console.error("Failed to save manual logs", e);
    }
  };

  const saveActiveMeter = async (meter: MeterId) => {
    setActiveMeter(meter);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_ACTIVE_METER, meter);
    } catch (e) {
      console.error("Failed to save active meter", e);
    }
  };

  const setManualBaseline = async (meterId: MeterId, reading: number, cycleStartTs: number) => {
    const updated = {
      ...manualBaselines,
      [meterId]: { reading, cycleStartTs },
    };
    setManualBaselines(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_BASELINES, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save manual baselines", e);
    }
  };  // ─────────────────────────────────────────────────────────────────────────
  // ADAPTIVE PREDICTION ENGINE v4 — Unified Home Architecture
  // ─────────────────────────────────────────────────────────────────────────
  const { home, meters } = useMemo(() => {
    const m1Logs = manualLogs.filter((l) => l.meterId === 'meter1');
    const m2Logs = manualLogs.filter((l) => l.meterId === 'meter2');
    const now = Date.now();

    const predictor = new AdaptivePredictor(manualLogs, now, activeMeter);
    
    // 1. Calculate Unified Home State
    const homeState = predictor.predictHome();

    // 2. Predict individual meter readings
    const m1Pred = predictor.predictMeter('meter1', homeState.expectedDrawNow);
    const m2Pred = predictor.predictMeter('meter2', homeState.expectedDrawNow);

    const m1PredictedReading = m1Pred.predictedReading;
    const m2PredictedReading = m2Pred.predictedReading;

    const cycleStartTs = getStartOfBillingCycle(now);
    
    let m1StartReading = getReadingAt(m1Logs, cycleStartTs) || (m1Logs.length > 0 ? m1Logs[0].reading : 0);
    if (manualBaselines.meter1?.cycleStartTs === cycleStartTs) {
      m1StartReading = manualBaselines.meter1.reading;
    }

    let m2StartReading = getReadingAt(m2Logs, cycleStartTs) || (m2Logs.length > 0 ? m2Logs[0].reading : 0);
    if (manualBaselines.meter2?.cycleStartTs === cycleStartTs) {
      m2StartReading = manualBaselines.meter2.reading;
    }

    const m1MonthUsage = Math.max(0, m1PredictedReading - m1StartReading);
    const m2MonthUsage = Math.max(0, m2PredictedReading - m2StartReading);

    const m1Remaining = Math.max(0, 200 - m1MonthUsage);
    const m2Remaining = Math.max(0, 200 - m2MonthUsage);

    // Calculate raw consumption days needed based on the UNIFIED home average
    const effectiveAvg = homeState.averageDaily > 0 ? homeState.averageDaily : 5; // fallback to 5 units/day if avg is 0
    const m1DaysLeft = Math.floor(m1Remaining / effectiveAvg);
    const m2DaysLeft = Math.floor(m2Remaining / effectiveAvg);

    // 3. Sequential Simulation Engine
    const activeDaysLeft = activeMeter === 'meter1' ? m1DaysLeft : m2DaysLeft;
    const inactiveDaysLeft = activeMeter === 'meter1' ? m2DaysLeft : m1DaysLeft;

    const activeEndDate = now + (activeDaysLeft * 24 * 60 * 60 * 1000);
    const inactiveStartDate = activeEndDate;
    const inactiveEndDate = inactiveStartDate + (inactiveDaysLeft * 24 * 60 * 60 * 1000);

    // 4. Billing Cycle Expected Usage
    const daysPassedInCycle = (now - cycleStartTs) / (1000 * 60 * 60 * 24);
    const daysLeftInCycle = Math.max(0, 30 - daysPassedInCycle);
    
    // Override naive 30-day run-rate with true billing cycle projection
    homeState.projectedMonthly = m1MonthUsage + m2MonthUsage + (daysLeftInCycle * effectiveAvg);

    // Calculate per-meter projected monthly usage for the slab warnings
    const m1ActiveDaysInCycle = activeMeter === 'meter1' 
      ? Math.min(daysLeftInCycle, activeDaysLeft) 
      : Math.max(0, Math.min(daysLeftInCycle - activeDaysLeft, inactiveDaysLeft));
      
    const m2ActiveDaysInCycle = activeMeter === 'meter2' 
      ? Math.min(daysLeftInCycle, activeDaysLeft) 
      : Math.max(0, Math.min(daysLeftInCycle - activeDaysLeft, inactiveDaysLeft));

    const m1ProjectedMonthly = m1MonthUsage + (m1ActiveDaysInCycle * effectiveAvg);
    const m2ProjectedMonthly = m2MonthUsage + (m2ActiveDaysInCycle * effectiveAvg);

    return {
      home: homeState,
      meters: {
        meter1: {
          id: 'meter1',
          label: "Meter 1 (Analog)",
          reading: m1PredictedReading,
          remainingUnits: m1Remaining,
          targetUnits: 200,
          driftOffset: 0,
          averageError: 0,
          calibrationCount: m1Logs.length,
          lastLoggedAt: m1Logs.length > 0 ? m1Logs[m1Logs.length - 1].timestamp : undefined,
          
          queueStatus: activeMeter === 'meter1' ? 'ACTIVE' : 'NEXT',
          projectedDaysLeft: m1DaysLeft,
          projectedSlabDate: activeMeter === 'meter1' ? activeEndDate : inactiveEndDate,
          startsAfterDate: activeMeter === 'meter1' ? undefined : inactiveStartDate,
          projectedMonthly: m1ProjectedMonthly,
        },
        meter2: {
          id: 'meter2',
          label: "Meter 2 (Digital)",
          reading: m2PredictedReading,
          remainingUnits: m2Remaining,
          targetUnits: 200,
          driftOffset: 0,
          averageError: 0,
          calibrationCount: m2Logs.length,
          lastLoggedAt: m2Logs.length > 0 ? m2Logs[m2Logs.length - 1].timestamp : undefined,
          
          queueStatus: activeMeter === 'meter2' ? 'ACTIVE' : 'NEXT',
          projectedDaysLeft: m2DaysLeft,
          projectedSlabDate: activeMeter === 'meter2' ? activeEndDate : inactiveEndDate,
          startsAfterDate: activeMeter === 'meter2' ? undefined : inactiveStartDate,
          projectedMonthly: m2ProjectedMonthly,
        }
      }
    };
  }, [manualLogs, activeMeter, tick, manualBaselines]);

  const live = useMemo<LiveTelemetry>(() => {
    // Current draw rate uses the expected per-hour draw from the Unified Home State
    const activeRate = home.expectedDrawNow > 0 ? home.expectedDrawNow : (home.averageDaily / 24);
    // Stable voltage variance based on tick (avoids Math.random breaking memoization)
    const voltageVariance = ((tick % 7) - 3);

    return {
      gridKw: activeRate,
      currentAmp: Number(((activeRate * 1000) / 220).toFixed(1)),
      voltage: 220 + voltageVariance,
      frequency: 50,
      powerFactor: 0.98,
    };
  }, [home.expectedDrawNow, home.averageDaily, tick]);

  const changeover = useMemo(
    () => ({
      activeMeter,
      lastSwitchedAt,
    }),
    [activeMeter, lastSwitchedAt],
  );

  const recommendations = useMemo(
    () => buildRecommendations(live, activeMeter),
    [activeMeter, live],
  );

  const alerts = useMemo(() => {
    if (clearedAlerts) return [];
    return buildManualAlerts(manualLogs, meters);
  }, [manualLogs, meters, clearedAlerts]);

  const history = useMemo(
    () => interpolateUsageHistory(manualLogs, period),
    [manualLogs, period],
  );

  const summary = useMemo(() => summarizeHistory(history), [history]);

  const swapChangeover = (target?: MeterId) => {
    const next = target ?? (activeMeter === "meter1" ? "meter2" : "meter1");
    saveActiveMeter(next);
    setLastSwitchedAt(new Date());
  };

  const addManualLog = async (
    meterId: MeterId,
    reading: number,
    timestamp: number,
    notes?: string,
  ) => {
    const newLog: ManualLog = {
      id: `${meterId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      meterId,
      reading,
      notes,
    };
    const updated = [newLog, ...manualLogs];
    await saveLogs(updated);
    setClearedAlerts(false);
  };

  const editManualLog = async (
    id: string,
    reading: number,
    timestamp: number,
    notes?: string,
  ) => {
    const updated = manualLogs.map((log) => {
      if (log.id === id) {
        return { ...log, reading, timestamp, notes };
      }
      return log;
    });
    await saveLogs(updated);
  };

  const deleteManualLog = async (id: string) => {
    const updated = manualLogs.filter((log) => log.id !== id);
    await saveLogs(updated);
  };

  const calibrateMeter = (meterId: MeterId, manualReading: number) => {
    addManualLog(meterId, manualReading, Date.now(), "Manual Calibration");
  };

  const clearAlerts = () => setClearedAlerts(true);

  const resetAllLogs = async () => {
    const demo = generateMockLogs();
    await saveLogs(demo);
    setClearedAlerts(false);
  };

  const value: EnergyContextValue = {
    live,
    home,
    meters,
    activeMeter,
    changeover,
    recommendations,
    alerts,
    history,
    manualLogs,
    manualBaselines,
    summary,
    period,
    loading,
    setPeriod,
    swapChangeover,
    calibrateMeter,
    setManualBaseline,
    addManualLog,
    editManualLog,
    deleteManualLog,
    clearAlerts,
    resetAllLogs,
  };

  return (
    <EnergyContext.Provider value={value}>{children}</EnergyContext.Provider>
  );
}

export function useEnergy() {
  const value = useContext(EnergyContext);
  if (!value) {
    throw new Error("useEnergy must be used within EnergyProvider");
  }
  return value;
}

export type {
    AlertItem,
    HistoryPoint,
    LiveTelemetry,
    ManualLog,
    MeterId,
    MeterState,
    HomeState,
    Recommendation
} from "./energy-types";

