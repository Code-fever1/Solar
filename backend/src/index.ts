import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { startInverterPoller } from './services/InverterPoller';
import { router as meterRoutes } from './routes/meterRoutes';

const app = express();
const port = process.env.PORT || 3001;

export const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.use('/api/meters', meterRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

app.listen(port, () => {
  console.log(`Backend server listening on port ${port}`);
  
  // Start the background worker
  startInverterPoller();
});
