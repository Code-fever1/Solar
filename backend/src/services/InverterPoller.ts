import { prisma } from '../index';

const POLL_INTERVAL_MS = 60000; // Poll every 1 minute

export function startInverterPoller() {
  console.log('Starting InverterPoller service...');
  
  setInterval(async () => {
    try {
      await fetchAndStoreInverterData();
    } catch (error) {
      console.error('Error polling inverter data:', error);
    }
  }, POLL_INTERVAL_MS);
  
  // Run immediately on start
  fetchAndStoreInverterData();
}

async function fetchAndStoreInverterData() {
  // TODO: Replace this simulated fetch with actual reverse-engineered API requests 
  // to InverterZone or direct Modbus TCP integration if local.
  // URL provided: https://inverterzone.com/device/500291B991A9
  
  const hour = new Date().getHours();
  const isDaytime = hour >= 7 && hour <= 18;
  
  const simulatedData = {
    solarPowerWatts: isDaytime ? Math.random() * 3000 + 500 : 0,
    houseLoadWatts: Math.random() * 1000 + 300,
    pvVoltage: isDaytime ? 350 + Math.random() * 20 : 0,
    pvCurrent: isDaytime ? Math.random() * 8 : 0,
    mode: isDaytime ? 'solar+grid' : 'grid-only',
    dailyYieldKwh: isDaytime ? (hour - 7) * 1.2 : 0
  };

  // Grid import is roughly Load - Solar (clamped to 0) + battery charging (ignored here for simplicity)
  const gridImportWatts = Math.max(0, simulatedData.houseLoadWatts - simulatedData.solarPowerWatts);

  await prisma.inverterTelemetry.create({
    data: {
      timestamp: new Date(),
      solarPowerWatts: simulatedData.solarPowerWatts,
      gridImportWatts,
      houseLoadWatts: simulatedData.houseLoadWatts,
      pvVoltage: simulatedData.pvVoltage,
      pvCurrent: simulatedData.pvCurrent,
      mode: simulatedData.mode,
      dailyYieldKwh: simulatedData.dailyYieldKwh
    }
  });
  
  // console.log(`Logged inverter data: Solar=${simulatedData.solarPowerWatts.toFixed(0)}W, Grid=${gridImportWatts.toFixed(0)}W`);
}
