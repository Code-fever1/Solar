import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { InverterZoneProvider } from '../telemetry/InverterZoneProvider';
import { predictionQueue } from './WorkerSetup';
import { PrismaClient } from '@prisma/client';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();
const provider = new InverterZoneProvider();

export const telemetryWorker = new Worker('telemetry', async job => {
  if (job.name === 'poll-inverter') {
    try {
      const load = await provider.fetchCurrentLoad();
      const consumption = await provider.fetchCurrentConsumption();
      const voltage = await provider.fetchCurrentVoltage();
      const current = await provider.fetchCurrentCurrent();
      const mode = await provider.fetchOperatingMode();
      const frequency = await provider.fetchFrequency();
      const timestamp = await provider.fetchTimestamp();

      const telemetry = await prisma.telemetryCache.create({
        data: {
          currentLoad: load,
          gridConsumption: consumption,
          voltage,
          current,
          frequency,
          operatingMode: mode,
          timestamp
        }
      });

      // Trigger the prediction engine using the latest telemetry
      await predictionQueue.add('run-prediction', { telemetryId: telemetry.id });

    } catch (err) {
      console.error('Failed to poll telemetry:', err);
    }
  }
}, { connection: redisConnection });
