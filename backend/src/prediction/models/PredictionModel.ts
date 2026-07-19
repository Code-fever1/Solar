export interface PredictionResult {
  currentDraw: number;
  meterSpeed: number;
  meterReading: number;
  confidence: number;
  reasoning: string;
  lowerBound?: number;
  upperBound?: number;
}

export abstract class PredictionModel {
  abstract readonly name: string;
  
  /**
   * Generates a prediction based on historical data and current telemetry
   * @param currentTelemetry The latest telemetry reading from the provider
   * @param historicalReadings Past confirmed meter readings
   * @param meterProfile The learned personality of the meter
   */
  abstract predict(
    currentTelemetry: any, 
    historicalReadings: any[], 
    meterProfile: any
  ): Promise<PredictionResult>;
}
