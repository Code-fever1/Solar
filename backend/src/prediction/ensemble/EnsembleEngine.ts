import { PredictionModel, PredictionResult } from '../models/PredictionModel';

export class EnsembleEngine {
  private models: Map<string, PredictionModel> = new Map();
  private weights: Map<string, number> = new Map();

  registerModel(model: PredictionModel, initialWeight: number = 1.0) {
    this.models.set(model.name, model);
    this.weights.set(model.name, initialWeight);
  }

  async evaluateEnsemble(
    currentTelemetry: any,
    historicalReadings: any[],
    meterProfile: any
  ): Promise<PredictionResult> {
    const predictions: Map<string, PredictionResult> = new Map();
    let totalWeight = 0;
    
    // Normalize weights
    Array.from(this.weights.values()).forEach(w => totalWeight += w);

    let weightedDraw = 0;
    let weightedSpeed = 0;
    let weightedReading = 0;
    let weightedConfidence = 0;

    for (const [name, model] of this.models.entries()) {
      const result = await model.predict(currentTelemetry, historicalReadings, meterProfile);
      predictions.set(name, result);

      const weight = (this.weights.get(name) || 0) / totalWeight;
      weightedDraw += result.currentDraw * weight;
      weightedSpeed += result.meterSpeed * weight;
      weightedReading += result.meterReading * weight;
      weightedConfidence += result.confidence * weight;
    }

    // Determine the dominant reasoning
    let dominantModelName = '';
    let highestWeight = -1;
    for (const [name, weight] of this.weights.entries()) {
      if (weight > highestWeight) {
        highestWeight = weight;
        dominantModelName = name;
      }
    }

    const dominantReasoning = predictions.get(dominantModelName)?.reasoning || 'Ensemble average';

    return {
      currentDraw: weightedDraw,
      meterSpeed: weightedSpeed,
      meterReading: weightedReading,
      confidence: weightedConfidence,
      reasoning: `Ensemble dominated by ${dominantModelName}: ${dominantReasoning}`,
      lowerBound: weightedReading * 0.95, // Simplified bound calculation
      upperBound: weightedReading * 1.05
    };
  }

  updateWeightsBasedOnAccuracy(modelAccuracies: Record<string, number>) {
    // In a real scenario, this would evaluate residual MAE from the Learning Engine
    // and adjust the weights in `this.weights` up or down.
    for (const [name, mae] of Object.entries(modelAccuracies)) {
      if (this.weights.has(name)) {
        const currentWeight = this.weights.get(name)!;
        // Inverse relationship: higher error -> lower weight
        const newWeight = Math.max(0.1, currentWeight * (1 / (mae + 0.1)));
        this.weights.set(name, newWeight);
      }
    }
  }
}
