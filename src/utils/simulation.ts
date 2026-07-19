import { clamp } from "./calculations";

export type SimulationInputs = {
  minuteOfDay: number;
  activeMeter: "meter1" | "meter2";
  meterReadings: Record<"meter1" | "meter2", number>;
  meterDailyUsage: Record<"meter1" | "meter2", number>;
};

export type SimulationOutput = {
  live: {
    solarKw: number;
    loadKw: number;
    gridKw: number;
    currentAmp: number;
    voltage: number;
    frequency: number;
    powerFactor: number;
    exportedKw: number;
  };
  minuteOfDay: number;
  meterReadings: Record<"meter1" | "meter2", number>;
  meterDailyUsage: Record<"meter1" | "meter2", number>;
};

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function solarCurve(minuteOfDay: number) {
  const hour = minuteOfDay / 60;
  const daylight = clamp((hour - 6) / 13, 0, 1);
  const peak = Math.sin(Math.PI * daylight);
  return Math.max(0, peak * 7.8 + randomRange(-0.15, 0.2));
}

function loadCurve(minuteOfDay: number) {
  const hour = minuteOfDay / 60;
  const base = 1.35 + Math.sin(((hour - 14) / 24) * Math.PI * 2) * 0.35;
  const afternoon = Math.max(0, 1.35 - Math.abs(hour - 17.5) / 4) * 2.2;
  const evening = Math.max(0, 1.15 - Math.abs(hour - 20.5) / 3.5) * 2.5;
  return Math.max(0.7, base + afternoon + evening + randomRange(-0.2, 0.3));
}

export function simulateTelemetry(inputs: SimulationInputs): SimulationOutput {
  const solarKw = solarCurve(inputs.minuteOfDay);
  const loadKw = loadCurve(inputs.minuteOfDay);
  const gridKw = Math.max(0, loadKw - solarKw * 0.92 + randomRange(-0.1, 0.3));
  const exportedKw = Math.max(
    0,
    solarKw - loadKw * 0.95 + randomRange(-0.08, 0.12),
  );

  const voltageBase =
    220 + Math.sin((inputs.minuteOfDay / 60 / 24) * Math.PI * 2) * 4;
  const voltageSpike =
    Math.random() < 0.07 ? randomRange(-28, 28) : randomRange(-8, 8);
  const voltage = clamp(voltageBase + voltageSpike, 188, 248);

  const frequency = clamp(50 + randomRange(-0.35, 0.35), 49.4, 50.6);
  const powerFactor = clamp(0.92 + randomRange(-0.03, 0.04), 0.86, 0.99);
  const currentAmp = clamp((gridKw * 1000) / Math.max(voltage, 1), 0.3, 32);

  const intervalHours = 2.5 / 60 / 60;
  const importedUnits = gridKw * intervalHours;

  const meterReadings = {
    meter1:
      inputs.meterReadings.meter1 +
      (inputs.activeMeter === "meter1" ? importedUnits : 0) +
      randomRange(-0.02, 0.03),
    meter2:
      inputs.meterReadings.meter2 +
      (inputs.activeMeter === "meter2" ? importedUnits : 0) +
      randomRange(-0.02, 0.03),
  };

  const meterDailyUsage = {
    meter1:
      inputs.meterDailyUsage.meter1 +
      (inputs.activeMeter === "meter1" ? importedUnits : 0),
    meter2:
      inputs.meterDailyUsage.meter2 +
      (inputs.activeMeter === "meter2" ? importedUnits : 0),
  };

  return {
    live: {
      solarKw,
      loadKw,
      gridKw,
      currentAmp,
      voltage,
      frequency,
      powerFactor,
      exportedKw,
    },
    minuteOfDay: (inputs.minuteOfDay + 15) % (24 * 60),
    meterReadings,
    meterDailyUsage,
  };
}
