import { Queue, Worker, QueueScheduler } from 'bullmq';
import IORedis from 'ioredis';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

export const telemetryQueue = new Queue('telemetry', { connection: redisConnection });
export const predictionQueue = new Queue('prediction', { connection: redisConnection });
export const learningQueue = new Queue('learning', { connection: redisConnection });

export function setupWorkers() {
  console.log('BullMQ queues initialized.');
  
  // Setup repeating jobs
  telemetryQueue.add('poll-inverter', {}, {
    repeat: {
      every: 30000 // Every 30 seconds
    }
  });
}
