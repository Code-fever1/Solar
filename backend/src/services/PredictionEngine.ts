import { prisma } from '../index';
import { MeterReading } from '@prisma/client';

export class PredictionEngine {
  private meterId: string;

  constructor(meterId: string) {
    this.meterId = meterId;
  }

  /**
   * Generates forecasted meter readings for different time horizons.
   * This is where the ensemble models execute.
   */
  async generateForecasts() {
    const latestReading = await prisma.meterReading.findFirst({
      where: { meterId: this.meterId },
      orderBy: { timestamp: 'desc' }
    });

    if (!latestReading) {
      throw new Error('No baseline reading available for this meter.');
    }

    const latestTelemetry = await prisma.inverterTelemetry.findFirst({
      orderBy: { timestamp: 'desc' }
    });

    // 1. Time-Of-Day (TOD) Model Simulation
    // In a full implementation, this aggregates historical logs by hour.
    const todRate = 0.5; // Stub: 0.5 kWh/h

    // 2. Solar-Adjusted Base Model
    // Estimated Grid = House Load - Solar
    let solarAdjustedRate = 0;
    if (latestTelemetry) {
      solarAdjustedRate = latestTelemetry.gridImportWatts / 1000.0; // Convert to kW
    }

    // 3. Holt-Winters (Trend)
    const holtWintersRate = 0.8; // Stub: 0.8 kWh/h based on recent trend

    // 4. Retrieve Ensemble Weights (Self-Learning state)
    // Normally we'd fetch the latest weights from the database or calculate them.
    // For now, we use a simple heuristic:
    let weights = { tod: 0.2, solar: 0.7, holtWinters: 0.1 };
    
    // Day vs Night Mode
    const isSolarActive = latestTelemetry && latestTelemetry.solarPowerWatts > 50;
    if (!isSolarActive) {
      // Night mode: ignore solar model, rely heavily on TOD and Holt-Winters
      weights = { tod: 0.6, solar: 0.0, holtWinters: 0.4 };
    }

    const finalRateKwH = 
      (todRate * weights.tod) + 
      (solarAdjustedRate * weights.solar) + 
      (holtWintersRate * weights.holtWinters);

    const now = Date.now();
    const elapsedHours = (now - latestReading.timestamp.getTime()) / (1000 * 60 * 60);
    const currentPredictedReading = latestReading.reading + (elapsedHours * finalRateKwH);

    // Calculate future horizons
    const horizons = [
      { label: '5 min', hours: 5 / 60 },
      { label: '30 min', hours: 0.5 },
      { label: '1 hour', hours: 1 },
      { label: '6 hour', hours: 6 },
      { label: '24 hour', hours: 24 }
    ];

    const forecasts = horizons.map(h => ({
      horizon: h.label,
      predictedReading: currentPredictedReading + (h.hours * finalRateKwH),
      lowerBound: currentPredictedReading + (h.hours * finalRateKwH * 0.9),
      upperBound: currentPredictedReading + (h.hours * finalRateKwH * 1.1)
    }));

    return {
      currentPredictedReading,
      expectedRateKwH: finalRateKwH,
      mode: isSolarActive ? 'Day Mode' : 'Night Mode',
      confidence: 85.0, // Placeholder
      forecasts,
      weightsUsed: weights
    };
  }

  /**
   * The Self-Learning Loop.
   * Runs whenever a new actual reading is provided.
   * Calculates the error of previous predictions and adjusts weights/drift.
   */
  async runLearningLoop(actualReading: MeterReading) {
    console.log(`[Self-Learning] Processing new reading for ${this.meterId}: ${actualReading.reading}`);

    // Find the most recent prediction made BEFORE this reading was logged
    const lastPrediction = await prisma.predictionLog.findFirst({
      where: { 
        meterId: this.meterId,
        targetTimestamp: { lte: actualReading.timestamp }
      },
      orderBy: { targetTimestamp: 'desc' }
    });

    if (lastPrediction) {
      const absoluteError = Math.abs(lastPrediction.predictedReading - actualReading.reading);
      const mape = (absoluteError / actualReading.reading) * 100;

      // Update the prediction log with the actual result
      await prisma.predictionLog.update({
        where: { id: lastPrediction.id },
        data: {
          actualReading: actualReading.reading,
          absoluteError,
          mape
        }
      });

      console.log(`[Self-Learning] Error evaluated: ${absoluteError.toFixed(2)} units (MAPE: ${mape.toFixed(2)}%)`);

      // Here is where we would update the dynamic weights in the database
      // based on which sub-model performed best.
      
      // We also update the MeterPersonality drift
      let personality = await prisma.meterPersonality.findUnique({
        where: { meterId: this.meterId }
      });

      if (!personality) {
        personality = await prisma.meterPersonality.create({
          data: { meterId: this.meterId }
        });
      }

      // Simple Error Correction: If predicted was higher than actual, meter is slower than we thought.
      const residual = actualReading.reading - lastPrediction.predictedReading;
      const newDriftMultiplier = personality.driftMultiplier + (residual * 0.01); // Slowly adapt

      await prisma.meterPersonality.update({
        where: { meterId: this.meterId },
        data: { driftMultiplier: newDriftMultiplier }
      });
    }

    // Generate and store a new prediction for 1 hour from now for future evaluation
    const currentForecasts = await this.generateForecasts();
    
    await prisma.predictionLog.create({
      data: {
        meterId: this.meterId,
        targetTimestamp: new Date(Date.now() + 60 * 60 * 1000), // Target 1 hr ahead
        predictedReading: currentForecasts.forecasts.find(f => f.horizon === '1 hour')?.predictedReading || 0,
        confidence: currentForecasts.confidence,
        ensembleWeights: JSON.stringify(currentForecasts.weightsUsed)
      }
    });
  }
}
