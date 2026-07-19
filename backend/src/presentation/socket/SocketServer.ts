import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: SocketIOServer;

export function initializeSocket(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function broadcastPredictionUpdate(meterId: string, predictionData: any) {
  if (io) {
    io.emit(`meter:${meterId}:prediction`, predictionData);
  }
}

export function broadcastTelemetryUpdate(telemetryData: any) {
  if (io) {
    io.emit('telemetry:live', telemetryData);
  }
}
