import type { ManualLog, HomeState } from '../context/energy-types';
import { MeterLearningEngine, type MeterProfile } from './MeterLearningEngine';

interface ActiveInterval {
  rate: number;
  midTs: number;
  startTs: number;
  endTs: number;
  durationHours: number;
  isWeekend: boolean;
  isSolar: boolean;
  midHour: number;
}

export class AdaptivePredictor {
  private allLogs: ManualLog[];
  private targetTime: number;
  private activeMeterId: string;
  private m1Logs: ManualLog[];
  private m2Logs: ManualLog[];
  private learningEngine: MeterLearningEngine;

  constructor(allLogs: ManualLog[], targetTime: number, activeMeterId: string, learningProfiles: Record<string, MeterProfile> = {}) {
    this.allLogs = [...allLogs].sort((a, b) => a.timestamp - b.timestamp);
    this.m1Logs = this.allLogs.filter(l => l.meterId === 'meter1');
    this.m2Logs = this.allLogs.filter(l => l.meterId === 'meter2');
    this.targetTime = targetTime;
    this.activeMeterId = activeMeterId;
    this.learningEngine = new MeterLearningEngine(learningProfiles);
  }

  private getInterpolatedReading(logs: ManualLog[], time: number): number | null {
    if (logs.length === 0) return null;
    if (time <= logs[0].timestamp) return logs[0].reading;
    if (time >= logs[logs.length - 1].timestamp) return logs[logs.length - 1].reading;

    for (let i = 0; i < logs.length - 1; i++) {
      if (time >= logs[i].timestamp && time <= logs[i + 1].timestamp) {
        const span = logs[i + 1].timestamp - logs[i].timestamp;
        if (span === 0) return logs[i].reading;
        const progress = (time - logs[i].timestamp) / span;
        const diff = logs[i + 1].reading - logs[i].reading;
        return logs[i].reading + (diff * progress);
      }
    }
    return null;
  }

  private getHouseVirtualReading(time: number): number | null {
    const r1 = this.getInterpolatedReading(this.m1Logs, time) ?? (this.m1Logs[0]?.reading || 0);
    const r2 = this.getInterpolatedReading(this.m2Logs, time) ?? (this.m2Logs[0]?.reading || 0);
    if (this.m1Logs.length === 0 && this.m2Logs.length === 0) return null;
    return r1 + r2;
  }

  private buildVirtualHouseIntervals(): ActiveInterval[] {
    const intervals: ActiveInterval[] = [];
    if (this.allLogs.length < 2) return intervals;

    // Get unique timestamps from all logs
    const timestamps = Array.from(new Set(this.allLogs.map(l => l.timestamp))).sort((a, b) => a - b);

    for (let i = 1; i < timestamps.length; i++) {
      const prevTs = timestamps[i - 1];
      const currTs = timestamps[i];
      const durationHours = (currTs - prevTs) / (1000 * 60 * 60);

      if (durationHours < 0.1) continue;

      const prevReading = this.getHouseVirtualReading(prevTs);
      const currReading = this.getHouseVirtualReading(currTs);

      if (prevReading === null || currReading === null) continue;

      const diff = currReading - prevReading;
      if (diff <= 0) continue;

      const rate = diff / durationHours;
      if (rate < 0.01) continue;

      const midTs = (prevTs + currTs) / 2;
      const midDate = new Date(midTs);
      const midHour = midDate.getHours();

      intervals.push({
        rate,
        startTs: prevTs,
        endTs: currTs,
        midTs,
        durationHours,
        midHour,
        isWeekend: midDate.getDay() === 0 || midDate.getDay() === 6,
        isSolar: midHour >= 7 && midHour < 18,
      });
    }

    return this.removeAnomalies(intervals);
  }

  private removeAnomalies(intervals: ActiveInterval[]): ActiveInterval[] {
    if (intervals.length < 5) return intervals;
    
    const sorted = [...intervals].sort((a, b) => a.rate - b.rate);
    const q1 = sorted[Math.floor(sorted.length * 0.25)].rate;
    const q2 = sorted[Math.floor(sorted.length * 0.50)].rate;
    const q3 = sorted[Math.floor(sorted.length * 0.75)].rate;
    const iqr = q3 - q1;
    const upperLimit = q3 + 2.0 * iqr; 
    
    const hardLimit = 8.0; // Max domestic house load kW
    const lowerLimit = q2 * 0.20;
    
    return intervals.filter(iv => iv.rate <= Math.min(upperLimit, hardLimit) && iv.rate >= lowerLimit);
  }

  public predictHome(): HomeState {
    if (this.allLogs.length === 0) {
      return this.fallbackEmpty();
    }

    const intervals = this.buildVirtualHouseIntervals();
    if (intervals.length === 0) {
      return this.fallbackDefault();
    }

    // --- ENSEMBLE MODELS ON VIRTUAL HOUSE ---

    // 1. Recency Baseline (EMA)
    const cutoff48h = this.targetTime - (48 * 60 * 60 * 1000);
    const recentIntervals48h = intervals.filter(iv => iv.midTs >= cutoff48h);
    const olderIntervals = intervals.filter(iv => iv.midTs < cutoff48h);
    
    const avgRate = (arr: ActiveInterval[]) => arr.reduce((sum, iv) => sum + iv.rate, 0) / arr.length;
    
    let ema = intervals[intervals.length - 1].rate;
    if (recentIntervals48h.length > 0 && olderIntervals.length > 0) {
      ema = 0.85 * avgRate(recentIntervals48h) + 0.15 * avgRate(olderIntervals);
    } else if (recentIntervals48h.length > 0) {
      ema = avgRate(recentIntervals48h);
    } else if (olderIntervals.length > 0) {
      ema = avgRate(olderIntervals);
    }

    // 2. Time-Of-Day Model (Gaussian matched to target time)
    const targetHour = new Date(this.targetTime).getHours();
    let todWeightSum = 0;
    let todRateSum = 0;
    
    intervals.forEach(iv => {
      const hourDiff = Math.min(Math.abs(iv.midHour - targetHour), 24 - Math.abs(iv.midHour - targetHour));
      const timeWeight = Math.exp(-(hourDiff * hourDiff) / (2 * 3 * 3));
      
      const daysOld = (this.targetTime - iv.midTs) / (1000 * 60 * 60 * 24);
      const recencyWeight = Math.exp(-daysOld * Math.log(2) / 10); 
      
      const w = timeWeight * recencyWeight;
      if (w > 0.01) {
        todRateSum += iv.rate * w;
        todWeightSum += w;
      }
    });
    const todRate = todWeightSum > 0 ? todRateSum / todWeightSum : ema;

    // 3. Linear Trend
    const recentDays = 7;
    const trendCutoff = this.targetTime - (recentDays * 24 * 60 * 60 * 1000);
    const trendIntervals = intervals.filter(iv => iv.midTs >= trendCutoff);
    let trendMultiplier = 1.0;
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';

    if (trendIntervals.length >= 3) {
      const first = trendIntervals[0].rate;
      const last = trendIntervals[trendIntervals.length - 1].rate;
      const change = (last - first) / first;
      
      if (change > 0.15) {
        trendMultiplier = 1.1;
        trend = 'increasing';
      } else if (change < -0.15) {
        trendMultiplier = 0.9;
        trend = 'decreasing';
      }
    }

    // Stable Recent Daily Avg (last 5 days) for the Whole House
    const cutoff5Days = this.targetTime - (5 * 24 * 60 * 60 * 1000);
    const recentHouseTimestamps = Array.from(new Set(this.allLogs.filter(l => l.timestamp >= cutoff5Days).map(l => l.timestamp))).sort((a,b)=>a-b);
    
    let recentDailyAvg = ema * 24;
    if (recentHouseTimestamps.length >= 2) {
      const spanHours = (recentHouseTimestamps[recentHouseTimestamps.length - 1] - recentHouseTimestamps[0]) / (1000 * 60 * 60);
      const startReading = this.getHouseVirtualReading(recentHouseTimestamps[0]) || 0;
      const endReading = this.getHouseVirtualReading(recentHouseTimestamps[recentHouseTimestamps.length - 1]) || 0;
      const totalKwh = endReading - startReading;
      
      if (spanHours >= 0.5 && totalKwh > 0) {
        recentDailyAvg = Math.min(100, Math.max(0.1, (totalKwh / spanHours) * 24));
      }
    }

    // Ensemble Blend
    let ensembleRate = todRate;
    if (todWeightSum > 0) {
      ensembleRate = (todRate * 0.90) + (ema * 0.10);
    }
    const finalExpectedRate = Math.min(8.0, Math.max(0.01, ensembleRate * trendMultiplier));

    // Today's Usage (Midnight to Midnight Extrapolation)
    const startOfToday = new Date(this.targetTime);
    startOfToday.setHours(0, 0, 0, 0);
    const midnightTs = startOfToday.getTime();
    
    const m1Midnight = this.predictMeterForTime('meter1', midnightTs, finalExpectedRate);
    const m2Midnight = this.predictMeterForTime('meter2', midnightTs, finalExpectedRate);
    const m1Current = this.predictMeterForTime('meter1', this.targetTime, finalExpectedRate);
    const m2Current = this.predictMeterForTime('meter2', this.targetTime, finalExpectedRate);
    
    const todayUsage = Math.max(0, (m1Current + m2Current) - (m1Midnight + m2Midnight));

    // Confidence
    const predictions = [ema, todRate];
    const meanPred = predictions.reduce((a, b) => a + b, 0) / 2;
    const variance = predictions.reduce((sum, val) => sum + Math.pow(val - meanPred, 2), 0) / 2;
    const stdDev = Math.sqrt(variance);
    
    const cv = stdDev / meanPred; 
    let confidencePercent = Math.round(100 - (cv * 100));
    confidencePercent = Math.min(99, Math.max(40, confidencePercent));
    if (intervals.length < 5) confidencePercent -= 20;

    // Pattern matching
    const isSolar = targetHour >= 7 && targetHour < 18;
    let primaryPattern: HomeState['primaryPattern'] = 'transition';
    if (isSolar && finalExpectedRate < ema * 0.8) {
      primaryPattern = 'solar';
    } else if (!isSolar && finalExpectedRate > ema * 1.2) {
      primaryPattern = 'high-load';
    } else if (isSolar) {
      primaryPattern = 'grid-only';
    } else {
      primaryPattern = 'night';
    }

    // Explanation
    let explanation = `Unified Home prediction running ${intervals.length} combined historical intervals.`;
    if (primaryPattern === 'solar') {
      explanation = 'High confidence: Home shows strong match with past solar generation hours, reducing grid draw.';
    } else if (primaryPattern === 'high-load') {
      explanation = 'Expected peak home usage detected. Predicting higher draw based on historical night/AC load.';
    } else if (trend === 'increasing') {
      explanation = 'Recent 7-day home trend shows increasing consumption. Adjusted prediction upward.';
    } else if (trend === 'decreasing') {
      explanation = 'Recent 7-day home trend shows decreasing consumption. Adjusted prediction downward.';
    } else if (confidencePercent > 85) {
      explanation = 'Highly stable unified home usage pattern detected.';
    } else {
      explanation = 'Varying home usage detected. Prediction range widened for safety.';
    }

    return {
      todayUsage,
      averageDaily: recentDailyAvg,
      expectedDrawNow: finalExpectedRate,
      projectedMonthly: recentDailyAvg * 30,
      confidencePercent,
      trend,
      primaryPattern,
      explanation,
    };
  }

  // Gets the exact live projected reading of a meter at `targetTime`
  public predictMeter(meterId: string, homeDrawNow: number): { predictedReading: number } {
    return { predictedReading: this.predictMeterForTime(meterId, this.targetTime, homeDrawNow) };
  }

  private static lastSmoothedHealth: Record<string, number> = {};

  // Calculates independent multi-factor health telemetry for a specific meter
  public predictMeterTelemetry(
    meterId: string,
    homeDrawNow: number,
    targetUnits = 200,
    billingStartTs = Date.now() - 15 * 86400000,
    billingEndTs = Date.now() + 15 * 86400000,
    startReading = 0,
    projectedMonthly = 180,
    projectedSlabDate = billingEndTs
  ): {
    currentDaily: number;
    targetDaily: number;
    averageLast3Days: number;
    paceRatio: number;
    trendStatus: 'improving' | 'worsening' | 'stable';
    predictionConfidence: number;
    healthScore: number;
    consumptionSpeedScore: number;
  } {
    const logs = meterId === 'meter1' ? this.m1Logs : this.m2Logs;
    const isActive = meterId === this.activeMeterId;
    const now = this.targetTime;

    // 1. Current reading and total usage in this billing cycle
    const currentReading = this.predictMeterForTime(meterId, now, homeDrawNow);
    const cycleUsage = Math.max(0, currentReading - startReading);
    const remainingUnits = Math.max(0, targetUnits - cycleUsage);

    // 2. Calculate currentDaily (recent daily consumption rate)
    const daysPassedInCycle = Math.max(0.1, (now - billingStartTs) / (1000 * 60 * 60 * 24));
    let currentDaily = cycleUsage / daysPassedInCycle;
    if (isActive && homeDrawNow > 0) {
      currentDaily = (currentDaily * 0.7) + (homeDrawNow * 24 * 0.3);
    } else if (!isActive && cycleUsage === 0) {
      currentDaily = 0;
    }

    // 2. Exponential Moving Average for last 3 days
    let day1Usage = currentDaily;
    let day2Usage = currentDaily;
    let day3Usage = currentDaily;

    const rNow = this.predictMeterForTime(meterId, now, homeDrawNow);
    const r1d = this.getInterpolatedReading(logs, now - 86400000) || (rNow - currentDaily);
    const r2d = this.getInterpolatedReading(logs, now - 2 * 86400000) || (r1d - currentDaily);
    const r3d = this.getInterpolatedReading(logs, now - 3 * 86400000) || (r2d - currentDaily);

    day1Usage = Math.max(0, rNow - r1d);
    day2Usage = Math.max(0, r1d - r2d);
    day3Usage = Math.max(0, r2d - r3d);

    let averageLast3Days = day1Usage;
    if (now - billingStartTs >= 3 * 86400000) {
      averageLast3Days = 0.5 * day1Usage + 0.3 * day2Usage + 0.2 * day3Usage;
    } else if (now - billingStartTs >= 2 * 86400000) {
      averageLast3Days = 0.6 * day1Usage + 0.4 * day2Usage;
    }

    if (averageLast3Days <= 0 && currentDaily > 0) {
      averageLast3Days = currentDaily;
    }

    // 3. Determine trend compared to previous 3 days
    let trendStatus: 'improving' | 'worsening' | 'stable' = 'stable';
    if (currentDaily > 0.2 && averageLast3Days > 0.2) {
      if (currentDaily < averageLast3Days * 0.93) {
        trendStatus = 'improving';
      } else if (currentDaily > averageLast3Days * 1.07) {
        trendStatus = 'worsening';
      }
    }

    // 4. Target daily rate and pace ratio
    const remainingCycleDays = Math.max(0.5, (billingEndTs - now) / (1000 * 60 * 60 * 24));
    const targetDaily = remainingUnits / remainingCycleDays;
    const paceRatio = targetDaily > 0 ? currentDaily / targetDaily : (currentDaily > 0 ? 2.0 : 0);

    // 5. Prediction confidence (%)
    let predictionConfidence = 95;
    if (logs.length < 2) {
      predictionConfidence = 58;
    } else if (logs.length < 4) {
      predictionConfidence = 78;
    } else if (logs.length >= 6) {
      predictionConfidence = Math.min(98, 88 + (logs.length * 1.5));
    }
    if (!isActive) {
      predictionConfidence = Math.min(96, predictionConfidence + 4);
    }

    // 6. Multi-factor Consumption Health Score (0 - 100) — used for the MONTHLY STATUS tag
    const baseScore = 50;

    // - 45% Current Daily Pace vs target (paceRatio)
    let paceModifier = 0;
    if (paceRatio < 1.0) {
      paceModifier = (1.0 - paceRatio) * 20;
    } else if (paceRatio > 1.0) {
      paceModifier = -(paceRatio - 1.0) * 45 * 1.5;
    }

    // - Spike Penalty (Current usage vs recent average)
    let spikePenalty = 0;
    if (currentDaily > 0.5 && averageLast3Days > 0.5) {
      const spikeRatio = currentDaily / averageLast3Days;
      if (spikeRatio > 2.0) {
        spikePenalty = -(spikeRatio - 1.0) * 15;
      }
    }

    // - 25% Monthly Projection vs target
    const monthlyRatio = targetUnits > 0 ? projectedMonthly / targetUnits : 0;
    let monthlyModifier = 0;
    if (monthlyRatio < 1.0) {
      monthlyModifier = (1.0 - monthlyRatio) * 20;
    } else if (monthlyRatio > 1.0) {
      monthlyModifier = -(monthlyRatio - 1.0) * 25 * 2.0;
    }

    // - 20% Trend vs 3-day average
    let trendModifier = 0;
    if (trendStatus === 'improving') trendModifier = 10;
    if (trendStatus === 'worsening') trendModifier = -15;

    // - 10% Remaining days safety (predictedEndDate vs billingEndDate)
    const safetyDays = (projectedSlabDate - billingEndTs) / (1000 * 60 * 60 * 24);
    let safetyModifier = 0;
    if (safetyDays >= 0) {
      safetyModifier = Math.min(10, safetyDays * 1.5);
    } else {
      safetyModifier = Math.max(-25, safetyDays * 4);
    }

    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);
    const rawHealth = clamp(baseScore + paceModifier + spikePenalty + monthlyModifier + trendModifier + safetyModifier, 0, 100);

    // Light EMA smoothing for health (used for tag — doesn't need to be super reactive)
    const prevSmoothed = AdaptivePredictor.lastSmoothedHealth[meterId];
    const smoothedHealth = prevSmoothed !== undefined
      ? 0.5 * prevSmoothed + 0.5 * rawHealth
      : rawHealth;
    AdaptivePredictor.lastSmoothedHealth[meterId] = smoothedHealth;
    const healthScore = clamp(Math.round(smoothedHealth), 0, 100);

    // 7. Consumption Speed Score (0 - 100) — used for the OUTER RING color
    // Smooth 50/50 blend of: (A) current pace vs target, (B) remaining units position
    // Both use linear interpolation for seamless color gradients

    // --- Component A: Pace Score (50%) ---
    // paceRatio=0 idle → 90, paceRatio=1.0 on-target → 50, paceRatio=2.0 → 10
    const paceScore = clamp(50 + (1.0 - paceRatio) * 40, 0, 95);

    // --- Component B: Remaining Units Position Score (50%) ---
    // Compares where your remaining units ARE vs where they SHOULD be at this point in the cycle
    const totalCycleDays = Math.max(1, daysPassedInCycle + remainingCycleDays);
    const expectedRemainingFraction = remainingCycleDays / totalCycleDays;
    const actualRemainingFraction = remainingUnits / (targetUnits > 0 ? targetUnits : 200);
    // delta > 0 means you have MORE remaining than expected (good)
    // delta < 0 means you have LESS remaining than expected (bad)
    const remainingDelta = actualRemainingFraction - expectedRemainingFraction;
    // Map: delta +0.3 → 95, delta 0 → 50, delta -0.3 → 5
    const remainingScore = clamp(50 + remainingDelta * 150, 0, 95);

    // --- Blend 80/20 (Fast / Reactive) ---
    const consumptionSpeedScore = clamp(Math.round(0.8 * paceScore + 0.2 * remainingScore), 0, 100);

    return {
      currentDaily,
      targetDaily,
      averageLast3Days,
      paceRatio,
      trendStatus,
      predictionConfidence: Math.round(predictionConfidence),
      healthScore,
      consumptionSpeedScore,
    };
  }

  private predictMeterForTime(meterId: string, time: number, homeDrawNow: number): number {
    const logs = meterId === 'meter1' ? this.m1Logs : this.m2Logs;
    if (logs.length === 0) return 0;
    
    if (time <= logs[logs.length - 1].timestamp) {
      return this.getInterpolatedReading(logs, time) || logs[logs.length - 1].reading;
    }
    
    const latestLog = logs[logs.length - 1];
    
    if (meterId === this.activeMeterId) {
      const elapsedHours = Math.max(0, time - latestLog.timestamp) / (1000 * 60 * 60);
      const learnedSpeed = this.learningEngine.estimateSpeed(meterId, homeDrawNow, time);
      return latestLog.reading + (elapsedHours * learnedSpeed);
    }
    
    return latestLog.reading;
  }

  private fallbackEmpty(): HomeState {
    return {
      todayUsage: 0,
      averageDaily: 0,
      expectedDrawNow: 0,
      projectedMonthly: 0,
      confidencePercent: 0,
      trend: 'stable',
      primaryPattern: 'grid-only',
      explanation: 'No home data available. Please log readings.',
    };
  }

  private fallbackDefault(): HomeState {
    return {
      todayUsage: 0,
      averageDaily: 5.0,
      expectedDrawNow: 0.2,
      projectedMonthly: 150,
      confidencePercent: 10,
      trend: 'stable',
      primaryPattern: 'grid-only',
      explanation: 'Insufficient data to build home profile. Using flat baseline.',
    };
  }
}
