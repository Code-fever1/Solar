import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

export const learningWorker = new Worker('learning', async job => {
  if (job.name === 'process-manual-reading') {
    const { meterId, readingId, actualReading, timestamp } = job.data;
    
    try {
      // 1. Find the closest prediction that was made for this timestamp
      // We look for a prediction targetTimestamp that falls within +/- 15 mins of this actual reading.
      const closestPrediction = await prisma.predictionHistory.findFirst({
        where: {
          meterId: meterId,
          targetTimestamp: {
            gte: new Date(new Date(timestamp).getTime() - 15 * 60000),
            lte: new Date(new Date(timestamp).getTime() + 15 * 60000),
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (closestPrediction) {
        // 2. Calculate the residual (error)
        const residual = closestPrediction.predictedReading - actualReading;
        const absoluteError = Math.abs(residual);
        
        // 3. Update the prediction record with the actual outcome
        await prisma.predictionHistory.update({
          where: { id: closestPrediction.id },
          data: {
            actualReading,
            absoluteError
          }
        });

        // 4. Save to learning history
        await prisma.learningHistory.create({
          data: {
            readingId,
            residual,
            adjustments: {
              targetTimestamp: closestPrediction.targetTimestamp,
              predictedReading: closestPrediction.predictedReading
            }
          }
        });

        // 5. Here we would trigger CalibrationEngine to adjust MeterProfile drift/inertia
        // and tell the EnsembleEngine to update weights.
        console.log(`Learning iteration complete for meter ${meterId}. Residual: ${residual}`);
      }
    } catch (error) {
      console.error('Error during self-learning execution:', error);
    }
  }
}, { connection: redisConnection });
