import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { EnsembleEngine } from '../../prediction/ensemble/EnsembleEngine';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();
const ensembleEngine = new EnsembleEngine(); // Will be registered with models later

export const predictionWorker = new Worker('prediction', async job => {
  if (job.name === 'run-prediction') {
    const { telemetryId } = job.data;
    
    try {
      const telemetry = await prisma.telemetryCache.findUnique({ where: { id: telemetryId } });
      if (!telemetry) return;

      const activeMeters = await prisma.meter.findMany({ where: { isActive: true }, include: { profile: true } });

      for (const meter of activeMeters) {
        // Retrieve recent readings to feed the model
        const historicalReadings = await prisma.meterReading.findMany({
          where: { meterId: meter.id },
          orderBy: { timestamp: 'desc' },
          take: 10
        });
        
        // Run ensemble prediction
        const prediction = await ensembleEngine.evaluateEnsemble(telemetry, historicalReadings, meter.profile);

        // Save prediction for the immediate 5-minute forecast
        await prisma.predictionHistory.create({
          data: {
            meterId: meter.id,
            targetTimestamp: new Date(Date.now() + 5 * 60000), // 5 mins ahead
            predictedReading: prediction.meterReading,
            predictedSpeed: prediction.meterSpeed,
            confidence: prediction.confidence,
            reasoning: prediction.reasoning
          }
        });

        // Emit real-time prediction update via Socket.IO (to be implemented)
      }
    } catch (error) {
      console.error('Error running prediction:', error);
    }
  }
}, { connection: redisConnection });
