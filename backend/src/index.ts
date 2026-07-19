import express from 'express';
import cors from 'cors';
import http from 'http';
import { initializeSocket } from './presentation/socket/SocketServer';
import { setupWorkers } from './infrastructure/workers/WorkerSetup';

// Initialize Express
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server for both Express and Socket.IO
const server = http.createServer(app);

// Initialize Socket.IO Realtime Layer
initializeSocket(server);

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Start Server
server.listen(port, () => {
  console.log(`GridWise AI Backend listening on port ${port}`);
  
  // Initialize Background Workers
  setupWorkers();
});
