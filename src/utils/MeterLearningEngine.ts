// src/utils/MeterLearningEngine.ts

export interface MeterContext {
  isDaytime: boolean;
  timeOfDay: 'Morning' | 'Afternoon' | 'Evening' | 'Night';
  loadLevel: 'Low' | 'Medium' | 'High';
}

export interface MeterProfile {
  meterId: string;
  overallBias: number; 
  contextBiases: {
    Morning: number;
    Afternoon: number;
    Evening: number;
    Night: number;
    LowLoad: number;
    MediumLoad: number;
    HighLoad: number;
  };
  confidences: {
    overall: number; 
    Morning: number;
    Afternoon: number;
    Evening: number;
    Night: number;
    LowLoad: number;
    MediumLoad: number;
    HighLoad: number;
  };
  observationsCount: number;
  lastUpdated: number;
}

export class MeterLearningEngine {
  private profiles: Record<string, MeterProfile> = {};

  constructor(savedProfiles?: Record<string, MeterProfile>) {
    if (savedProfiles) {
      this.profiles = savedProfiles;
    }
  }

  public getProfiles(): Record<string, MeterProfile> {
    return this.profiles;
  }

  public getProfile(meterId: string): MeterProfile | null {
    return this.profiles[meterId] || null;
  }

  private initProfile(meterId: string): MeterProfile {
    return {
      meterId,
      overallBias: 0,
      contextBiases: {
        Morning: 0, Afternoon: 0, Evening: 0, Night: 0, LowLoad: 0, MediumLoad: 0, HighLoad: 0
      },
      confidences: {
        overall: 0, Morning: 0, Afternoon: 0, Evening: 0, Night: 0, LowLoad: 0, MediumLoad: 0, HighLoad: 0
      },
      observationsCount: 0,
      lastUpdated: Date.now()
    };
  }

  public determineContext(targetTime: number, loadDrawKw: number): MeterContext {
    const d = new Date(targetTime);
    const hour = d.getHours();
    
    let timeOfDay: 'Morning' | 'Afternoon' | 'Evening' | 'Night' = 'Night';
    if (hour >= 6 && hour < 12) timeOfDay = 'Morning';
    else if (hour >= 12 && hour < 17) timeOfDay = 'Afternoon';
    else if (hour >= 17 && hour < 21) timeOfDay = 'Evening';

    let loadLevel: 'Low' | 'Medium' | 'High' = 'Low';
    if (loadDrawKw > 3.0) loadLevel = 'High';
    else if (loadDrawKw > 1.0) loadLevel = 'Medium';

    return {
      isDaytime: hour >= 6 && hour < 18,
      timeOfDay,
      loadLevel
    };
  }

  /**
   * Called when the user enters a manual log.
   * Compares what the AI predicted vs what physically happened.
   */
  public observe(
    meterId: string, 
    expectedReading: number, 
    actualReading: number, 
    previousReading: number, 
    targetTime: number, 
    averageDrawKw: number
  ) {
    if (!this.profiles[meterId]) {
      this.profiles[meterId] = this.initProfile(meterId);
    }
    
    const profile = this.profiles[meterId];
    
    const expectedConsumed = expectedReading - previousReading;
    const actualConsumed = actualReading - previousReading;
    
    // Fail-safe: We only learn if the meter actually moved a significant amount.
    if (expectedConsumed <= 0.1 || actualConsumed < 0) {
      return; 
    }

    // Calculate Bias. Positive bias = meter is faster than house prediction.
    // Negative bias = meter is slower than house prediction.
    const bias = (actualConsumed - expectedConsumed) / expectedConsumed;
    
    // Clip bias to prevent absurd corrections (max 30% difference assumed plausible)
    const clippedBias = Math.max(-0.30, Math.min(0.30, bias));

    const context = this.determineContext(targetTime, averageDrawKw);

    // Learning Rate depends on confidence. Starts fast, slows down.
    const alpha = profile.observationsCount < 5 ? 0.3 : 0.1;

    // Update Overall
    profile.overallBias = (profile.overallBias * (1 - alpha)) + (clippedBias * alpha);
    profile.confidences.overall = Math.min(1.0, profile.confidences.overall + 0.10);

    // Update Context: Time of Day
    const todKey = context.timeOfDay;
    profile.contextBiases[todKey] = (profile.contextBiases[todKey] * (1 - alpha)) + (clippedBias * alpha);
    profile.confidences[todKey] = Math.min(1.0, profile.confidences[todKey] + 0.10);

    // Update Context: Load Level
    const loadKey = context.loadLevel === 'Low' ? 'LowLoad' : context.loadLevel === 'High' ? 'HighLoad' : 'MediumLoad';
    profile.contextBiases[loadKey] = (profile.contextBiases[loadKey] * (1 - alpha)) + (clippedBias * alpha);
    profile.confidences[loadKey] = Math.min(1.0, profile.confidences[loadKey] + 0.10);

    profile.observationsCount += 1;
    profile.lastUpdated = Date.now();
  }

  /**
   * Predicts the true speed of a meter based on the raw home draw and its learned personality.
   */
  public estimateSpeed(meterId: string, rawHomeDraw: number, targetTime: number): number {
    if (!this.profiles[meterId]) {
      return rawHomeDraw; // Fail-safe: No data = no correction
    }

    const profile = this.profiles[meterId];
    if (profile.observationsCount === 0 || profile.confidences.overall < 0.1) {
      return rawHomeDraw; // Fail-safe: Low confidence = neutral
    }

    const context = this.determineContext(targetTime, rawHomeDraw);

    // Blend biases based on confidence
    let totalBias = 0;
    let totalWeight = 0;

    // Base overall bias
    totalBias += profile.overallBias * profile.confidences.overall;
    totalWeight += profile.confidences.overall;

    // TOD bias
    const todKey = context.timeOfDay;
    totalBias += profile.contextBiases[todKey] * profile.confidences[todKey];
    totalWeight += profile.confidences[todKey];

    // Load bias
    const loadKey = context.loadLevel === 'Low' ? 'LowLoad' : context.loadLevel === 'High' ? 'HighLoad' : 'MediumLoad';
    totalBias += profile.contextBiases[loadKey] * profile.confidences[loadKey];
    totalWeight += profile.confidences[loadKey];

    if (totalWeight === 0) return rawHomeDraw;

    const blendedBias = totalBias / totalWeight;

    return Math.max(0, rawHomeDraw * (1 + blendedBias));
  }
}
