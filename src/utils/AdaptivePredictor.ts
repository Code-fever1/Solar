import type { ManualLog } from '../context/energy-types';

export interface PredictionResult {
  predictedReading: number;
  expectedRateKwH: number;
  recentDailyAvg: number;
  minLikelyReading: number;
  maxLikelyReading: number;
  confidencePercent: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  primaryPattern: 'solar' | 'night' | 'weekend' | 'transition' | 'grid-only' | 'high-load';
  explanation: string;
}

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
  private targetMeterId: string;
  private logs: ManualLog[];
  private targetTime: number;
  private isActive: boolean;
  private isStandbyThreshold = 0.015;

  constructor(targetMeterId: string, allLogs: ManualLog[], targetTime: number, isActive: boolean) {
    this.targetMeterId = targetMeterId;
    this.allLogs = [...allLogs].sort((a, b) => a.timestamp - b.timestamp);
    this.logs = this.allLogs.filter(l => l.meterId === targetMeterId);
    this.targetTime = targetTime;
    this.isActive = isActive;
  }

  private getMedianRate(meterId: string): number {
    const meterLogs = this.allLogs.filter(l => l.meterId === meterId);
    const rates: number[] = [];
    for (let i = 1; i < meterLogs.length; i++) {
      const duration = (meterLogs[i].timestamp - meterLogs[i - 1].timestamp) / (1000 * 60 * 60);
      const diff = meterLogs[i].reading - meterLogs[i - 1].reading;
      if (duration > 0.1 && diff > 0) {
        rates.push(diff / duration);
      }
    }
    if (rates.length === 0) return 1.0; // fallback 1.0 kWh/h
    rates.sort((a, b) => a - b);
    return Math.max(0.2, rates[Math.floor(rates.length / 2)]); // Ensure we don't divide by near-zero
  }

  private buildIntervals(): ActiveInterval[] {
    const intervals: ActiveInterval[] = [];
    if (this.logs.length < 2) return intervals;

    const otherMeterId = this.targetMeterId === 'meter1' ? 'meter2' : 'meter1';
    const otherMedianRate = this.getMedianRate(otherMeterId);

    for (let i = 1; i < this.logs.length; i++) {
      const prev = this.logs[i - 1];
      const curr = this.logs[i];
      const durationHours = (curr.timestamp - prev.timestamp) / (1000 * 60 * 60);
      const diff = curr.reading - prev.reading;

      if (durationHours < 0.1 || diff <= 0) continue;

      let effectiveDuration = durationHours;

      // EXCLUSIVE CHANGEOVER FIX:
      // If BOTH meters ran during this logged window, we must subtract the time the OTHER meter was active.
      // Because Meter 2 might be "fast", we use its own historical median rate to estimate its active hours.
      const otherConsumption = this.getOtherMeterConsumption(prev.timestamp, curr.timestamp);
      if (otherConsumption > 0.1) {
        const otherActiveHours = otherConsumption / otherMedianRate;
        effectiveDuration = Math.max(0.5, durationHours - otherActiveHours);
      }

      const rate = diff / effectiveDuration;
      if (rate < this.isStandbyThreshold) continue;

      const midTs = (prev.timestamp + curr.timestamp) / 2;
      const midDate = new Date(midTs);
      const midHour = midDate.getHours();
      
      intervals.push({
        rate,
        startTs: prev.timestamp,
        endTs: curr.timestamp,
        midTs,
        durationHours: effectiveDuration, // Store the corrected duration
        midHour,
        isWeekend: midDate.getDay() === 0 || midDate.getDay() === 6,
        isSolar: midHour >= 7 && midHour < 18,
      });
    }

    return this.removeAnomalies(intervals);
  }

  private getOtherMeterConsumption(t1: number, t2: number): number {
    const otherLogs = this.allLogs.filter(l => l.meterId !== this.targetMeterId);
    if (otherLogs.length === 0) return 0;

    const r1 = this.getInterpolatedReading(otherLogs, t1);
    const r2 = this.getInterpolatedReading(otherLogs, t2);

    if (r1 !== null && r2 !== null) {
      return Math.max(0, r2 - r1);
    }
    return 0;
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

  private removeAnomalies(intervals: ActiveInterval[]): ActiveInterval[] {
    if (intervals.length < 5) return intervals;
    
    // Calculate IQR to remove extreme outliers (anomalies/typos)
    const sorted = [...intervals].sort((a, b) => a.rate - b.rate);
    const q1 = sorted[Math.floor(sorted.length * 0.25)].rate;
    const q2 = sorted[Math.floor(sorted.length * 0.50)].rate; // median
    const q3 = sorted[Math.floor(sorted.length * 0.75)].rate;
    const iqr = q3 - q1;
    const upperLimit = q3 + 2.0 * iqr; // Be a bit generous for peak AC loads
    
    // Also hard limit realistic max per hour for a domestic meter (e.g. 5kW)
    const hardLimit = 5.0; 

    // Lower bound: if a rate is less than 30% of the median, it's artificially low (meter was mostly off)
    const lowerLimit = q2 * 0.30;
    
    return intervals.filter(iv => iv.rate <= Math.min(upperLimit, hardLimit) && iv.rate >= lowerLimit);
  }

  public predict(): PredictionResult {
    if (this.logs.length === 0) {
      return this.fallbackEmpty();
    }
    const latestLog = this.logs[this.logs.length - 1];
    
    if (!this.isActive) {
      return {
        predictedReading: latestLog.reading,
        expectedRateKwH: 0,
        recentDailyAvg: 0,
        minLikelyReading: latestLog.reading,
        maxLikelyReading: latestLog.reading,
        confidencePercent: 100,
        trend: 'stable',
        primaryPattern: 'grid-only',
        explanation: 'Meter is in standby mode. Consumption is exactly zero.',
      };
    }

    const intervals = this.buildIntervals();
    if (intervals.length === 0) {
      return this.fallbackDefault(latestLog.reading);
    }

    // --- ENSEMBLE MODELS ---

    // 1. Recency Baseline (85% Last 48h / 15% Older)
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
      
      // Decaying old intervals
      const daysOld = (this.targetTime - iv.midTs) / (1000 * 60 * 60 * 24);
      const recencyWeight = Math.exp(-daysOld * Math.log(2) / 10); 
      
      const w = timeWeight * recencyWeight;
      if (w > 0.01) {
        todRateSum += iv.rate * w;
        todWeightSum += w;
      }
    });
    const todRate = todWeightSum > 0 ? todRateSum / todWeightSum : ema;

    // 3. Day-of-Week Model (Weekend vs Weekday)
    const targetIsWeekend = new Date(this.targetTime).getDay() === 0 || new Date(this.targetTime).getDay() === 6;
    const dowIntervals = intervals.filter(iv => iv.isWeekend === targetIsWeekend);
    let dowRate = ema;
    if (dowIntervals.length > 0) {
      // average of last 3 matching day-types
      const recentDow = dowIntervals.slice(-3);
      dowRate = recentDow.reduce((sum, iv) => sum + iv.rate, 0) / recentDow.length;
    }

    // 4. Linear Trend (Recent direction)
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

    // Stable Recent Daily Avg (last 5 days, as requested)
    const cutoff5Days = this.targetTime - (5 * 24 * 60 * 60 * 1000);
    const recentLogs = this.logs.filter(l => l.timestamp >= cutoff5Days);
    let recentDailyAvg = ema * 24;
    if (recentLogs.length >= 2) {
      const spanHours = (recentLogs[recentLogs.length - 1].timestamp - recentLogs[0].timestamp) / (1000 * 60 * 60);
      let totalKwh = 0;
      for (let i = 1; i < recentLogs.length; i++) {
        const diff = recentLogs[i].reading - recentLogs[i - 1].reading;
        if (diff > 0) totalKwh += diff;
      }
      if (spanHours >= 0.5 && totalKwh > 0) {
        recentDailyAvg = Math.min(60, Math.max(0.1, (totalKwh / spanHours) * 24));
      }
    }

    // --- ENSEMBLE COMBINATION ---
    // For live instantaneous expected rate, Time-of-Day (TOD) must be the primary driver.
    // Blending in 24-hour EMA or DOW average drags the rate up during solar hours 
    // because it mixes night and day readings.
    // TOD automatically falls back to EMA if there's no historical data for this hour.
    let ensembleRate = todRate;
    
    // We can lightly blend in the recency EMA (10%) just to account for sudden base-load shifts,
    // but 90% weight goes to what historically happens at this exact time of day.
    if (todWeightSum > 0) {
      ensembleRate = (todRate * 0.90) + (ema * 0.10);
    }
    
    const finalExpectedRate = Math.min(5.0, Math.max(0.01, ensembleRate * trendMultiplier));

    // Calculate Variance & Confidence
    const predictions = [ema, todRate, dowRate];
    const meanPred = predictions.reduce((a, b) => a + b, 0) / 3;
    const variance = predictions.reduce((sum, val) => sum + Math.pow(val - meanPred, 2), 0) / 3;
    const stdDev = Math.sqrt(variance);
    
    // Lower variance = higher confidence. Clamp between 40% and 99%.
    const cv = stdDev / meanPred; // Coefficient of variation
    let confidencePercent = Math.round(100 - (cv * 100));
    confidencePercent = Math.min(99, Math.max(40, confidencePercent));

    if (intervals.length < 5) confidencePercent -= 20;

    // Prediction bounds
    const elapsedHours = Math.max(0, this.targetTime - latestLog.timestamp) / (1000 * 60 * 60);
    const predictedDelta = elapsedHours * ema; // Use standard EMA for cumulative reading so it doesn't jump!
    
    // Widen bounds if confidence is low
    const marginOfError = predictedDelta * (1 - (confidencePercent / 100)) * 1.5; 

    // Pattern matching identification
    const isSolar = targetHour >= 7 && targetHour < 18;
    let primaryPattern: PredictionResult['primaryPattern'] = 'transition';
    if (isSolar && finalExpectedRate < ema * 0.8) {
      primaryPattern = 'solar';
    } else if (!isSolar && finalExpectedRate > ema * 1.2) {
      primaryPattern = 'high-load';
    } else if (isSolar) {
      primaryPattern = 'grid-only';
    } else {
      primaryPattern = 'night';
    }

    if (targetIsWeekend && confidencePercent > 70) {
      primaryPattern = 'weekend';
    }

    // Generate Explanation
    let explanation = `Ensemble prediction running ${intervals.length} valid historical intervals.`;
    if (primaryPattern === 'solar') {
      explanation = 'High confidence: Strong match with past solar generation hours showing reduced grid draw.';
    } else if (primaryPattern === 'high-load') {
      explanation = 'Expected peak usage detected. Predicting higher draw based on historical night/AC load.';
    } else if (trend === 'increasing') {
      explanation = 'Recent 7-day trend shows increasing consumption. Adjusted prediction upward.';
    } else if (trend === 'decreasing') {
      explanation = 'Recent 7-day trend shows decreasing consumption. Adjusted prediction downward.';
    } else if (confidencePercent > 85) {
      explanation = 'Highly stable usage pattern detected. Tight prediction bounds applied.';
    } else {
      explanation = 'Varying usage detected. Prediction range widened for safety.';
    }

    return {
      predictedReading: latestLog.reading + predictedDelta,
      expectedRateKwH: finalExpectedRate,
      recentDailyAvg,
      minLikelyReading: latestLog.reading + Math.max(0, predictedDelta - marginOfError),
      maxLikelyReading: latestLog.reading + predictedDelta + marginOfError,
      confidencePercent,
      trend,
      primaryPattern,
      explanation,
    };
  }

  private fallbackEmpty(): PredictionResult {
    return {
      predictedReading: 0,
      expectedRateKwH: 0,
      recentDailyAvg: 0,
      minLikelyReading: 0,
      maxLikelyReading: 0,
      confidencePercent: 0,
      trend: 'stable',
      primaryPattern: 'grid-only',
      explanation: 'No data available. Please log a reading.',
    };
  }

  private fallbackDefault(lastReading: number): PredictionResult {
    return {
      predictedReading: lastReading,
      expectedRateKwH: 0.20,
      recentDailyAvg: 4.8,
      minLikelyReading: lastReading,
      maxLikelyReading: lastReading,
      confidencePercent: 10,
      trend: 'stable',
      primaryPattern: 'grid-only',
      explanation: 'Insufficient data for pattern matching. Using flat baseline.',
    };
  }
}
