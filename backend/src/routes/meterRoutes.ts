import { Router } from 'express';
import { prisma } from '../index';
import { PredictionEngine } from '../services/PredictionEngine';

export const router = Router();

// Get recent manual readings
router.get('/', async (req, res) => {
  const readings = await prisma.meterReading.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50
  });
  res.json(readings);
});

// Post a new manual reading
router.post('/', async (req, res) => {
  const { meterId, reading, isCalibration } = req.body;
  
  if (!meterId || reading === undefined) {
    return res.status(400).json({ error: 'meterId and reading are required' });
  }

  const newReading = await prisma.meterReading.create({
    data: {
      meterId,
      reading,
      timestamp: new Date(),
      isCalibration: !!isCalibration
    }
  });

  // Trigger self-learning loop based on new actual data
  try {
    const engine = new PredictionEngine(meterId);
    await engine.runLearningLoop(newReading);
  } catch (err) {
    console.error('Error running learning loop:', err);
  }

  res.json(newReading);
});

// Get predictions for a meter
router.get('/:meterId/predictions', async (req, res) => {
  const { meterId } = req.params;
  try {
    const engine = new PredictionEngine(meterId);
    const predictions = await engine.generateForecasts();
    res.json(predictions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
