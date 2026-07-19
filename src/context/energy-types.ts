export type MeterId = "meter1" | "meter2";

export type LiveTelemetry = {
  gridKw: number;
  currentAmp: number;
  voltage: number;
  frequency: number;
  powerFactor: number;
};

export type MeterState = {
  id: MeterId;
  label: string;
  reading: number;
  todayUsage: number;
  remainingUnits: number;
  targetUnits: number;
  driftOffset: number;
  averageError: number;
  calibrationCount: number;
  averageDaily: number;       // full-history weighted rate × 24 (used for prediction fallback)
  recentDailyAvg: number;     // last 1-2 days actual kWh/day (displayed to user)
  expectedDrawNow: number;    // expected kWh/h at the current hour from learned time-slot patterns
  minLikelyReading: number;
  maxLikelyReading: number;
  confidencePercent: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  primaryPattern: 'solar' | 'night' | 'weekend' | 'transition' | 'grid-only' | 'high-load';
  explanation: string;
  projectedMonthly: number;
  lastLoggedAt?: number; // timestamp ms
};

export type Recommendation = {
  id: string;
  title: string;
  description: string;
  action: string;
  priority: "low" | "medium" | "high";
  trend: "up" | "down" | "flat";
};

export interface ManualBaseline {
  reading: number;
  cycleStartTs: number;
}



export type AlertItem = {
  id: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  source: string;
  createdAt: Date;
};

export type HistoryPoint = {
  time: string;
  meter1: number;
  meter2: number;
  voltage: number;
};

export type ManualLog = {
  id: string;
  timestamp: number; // epoch ms
  meterId: MeterId;
  reading: number;
  notes?: string;
};
