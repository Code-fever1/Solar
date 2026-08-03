export type MeterId = "meter1" | "meter2";

export type LiveTelemetry = {
  gridKw: number;
  currentAmp: number;
  voltage: number;
  frequency: number;
  powerFactor: number;
};

export type HomeState = {
  todayUsage: number;
  averageDaily: number;
  expectedDrawNow: number;
  projectedMonthly: number;
  confidencePercent: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  primaryPattern: 'solar' | 'night' | 'weekend' | 'transition' | 'grid-only' | 'high-load';
  explanation: string;
  yesterdayUsage?: number;
  usageChangePercent?: number | null;
  dailyUsage?: Array<{ timestamp: number; label: string; usage: number }>;
  hourlyUsage?: Array<{ timestamp: number; usage: number }>;
  periodDay?: number;
  periodNight?: number;
  periodMorningEvening?: number;
  usageTrendPercent?: number | null;
  usageTrendDelta?: number | null;   // absolute units/day vs rolling prior-day avg
  normalDrawKw?: number;
  loadStatus?: 'Low' | 'Normal' | 'High';
  paceStatus?: 'CRITICAL' | 'AVERAGE' | 'ON PACE' | 'GOOD' | 'EXCELLENT';
  outerRingScore?: number;
  combinedDaysLeft?: number;
  daysBuffer?: number;
  combinedTarget?: number;
};

export type QueueStatus = 'ACTIVE' | 'NEXT' | 'QUEUED';

export type MeterState = {
  id: MeterId;
  label: string;
  reading: number;
  remainingUnits: number;
  cycleUsage?: number;
  targetUnits: number;
  driftOffset: number;
  averageError: number;
  calibrationCount: number;
  calibrationFactor?: number;
  calibrationConfidence?: number;
  
  // Sequential Forecasting Fields
  queueStatus: QueueStatus;
  projectedDaysLeft: number; // Consumption days
  projectedSlabDate: number; // Calendar date it hits target
  startsAfterDate?: number;  // Calendar date it becomes active (if NEXT or QUEUED)
  projectedMonthly: number;  // Projected usage for this meter's billing cycle
  
  lastLoggedAt?: number; // timestamp ms
  lastLoggedReading?: number;

  // Independent Telemetry & Health Indicator Fields
  averageDaily: number;
  averageLast3Days: number;
  currentDaily: number;
  targetDaily: number;
  paceRatio: number;
  trendStatus: 'improving' | 'worsening' | 'stable';
  predictionConfidence: number;
  healthScore: number;
  healthColor: string;
  consumptionSpeedScore: number;
  consumptionSpeedColor: string;
  remainingColor: string;

  // Ensemble AI Insight fields (used across detailed cards)
  todayUsage: number;
  recentDailyAvg: number;
  expectedDrawNow: number;
  explanation: string;
  confidencePercent: number;
  minLikelyReading: number;
  maxLikelyReading: number;
  trend: 'increasing' | 'decreasing' | 'stable';
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
