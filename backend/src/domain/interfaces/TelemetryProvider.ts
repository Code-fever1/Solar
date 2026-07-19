export interface TelemetryProvider {
  fetchCurrentLoad(): Promise<number>;
  fetchCurrentConsumption(): Promise<number>;
  fetchCurrentVoltage(): Promise<number>;
  fetchCurrentCurrent(): Promise<number>;
  fetchOperatingMode(): Promise<string>;
  fetchFrequency(): Promise<number>;
  fetchTimestamp(): Promise<Date>;
}
