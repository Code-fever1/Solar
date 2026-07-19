import { TelemetryProvider } from '../../domain/interfaces/TelemetryProvider';

export class InverterZoneProvider implements TelemetryProvider {
  private currentData: any = null;

  private async fetchSimulatedData() {
    const hour = new Date().getHours();
    const isDaytime = hour >= 7 && hour <= 18;
    
    const solarPowerWatts = isDaytime ? Math.random() * 3000 + 500 : 0;
    const houseLoadWatts = Math.random() * 1000 + 300;
    const gridConsumption = Math.max(0, houseLoadWatts - solarPowerWatts);

    this.currentData = {
      houseLoadWatts,
      gridConsumption,
      pvVoltage: isDaytime ? 350 + Math.random() * 20 : 0,
      pvCurrent: isDaytime ? Math.random() * 8 : 0,
      mode: isDaytime ? 'solar+grid' : 'grid-only',
      frequency: 50.0 + (Math.random() * 0.2 - 0.1), // 50Hz grid
      timestamp: new Date()
    };
  }

  async fetchCurrentLoad(): Promise<number> {
    await this.fetchSimulatedData();
    return this.currentData.houseLoadWatts;
  }

  async fetchCurrentConsumption(): Promise<number> {
    if (!this.currentData) await this.fetchSimulatedData();
    return this.currentData.gridConsumption;
  }

  async fetchCurrentVoltage(): Promise<number> {
    if (!this.currentData) await this.fetchSimulatedData();
    return this.currentData.pvVoltage;
  }

  async fetchCurrentCurrent(): Promise<number> {
    if (!this.currentData) await this.fetchSimulatedData();
    return this.currentData.pvCurrent;
  }

  async fetchOperatingMode(): Promise<string> {
    if (!this.currentData) await this.fetchSimulatedData();
    return this.currentData.mode;
  }

  async fetchFrequency(): Promise<number> {
    if (!this.currentData) await this.fetchSimulatedData();
    return this.currentData.frequency;
  }

  async fetchTimestamp(): Promise<Date> {
    if (!this.currentData) await this.fetchSimulatedData();
    return this.currentData.timestamp;
  }
}
