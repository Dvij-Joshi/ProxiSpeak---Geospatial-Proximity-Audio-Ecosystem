import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import proximityRoutes from './routes/proximity.js';
import { initSignalingServer } from './socket/signalingServer.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Connect to MongoDB
await connectDB();

// Initialize Express app
const app = express();
const httpServer = http.createServer(app);

// Initialize Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

// REST Routes
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: 'connected',
  });
});

app.use('/api/proximity', proximityRoutes);

// Socket.io Signaling Server
initSignalingServer(io);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 ProxiSpeak server running on http://localhost:${PORT}`);
});

export default app;
