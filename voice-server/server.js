import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

// Port 10000 is Render's standard default
const PORT = process.env.PORT || 10000;
const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 2e6, // 2MB buffer for high-throughput audio packets
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Render health check endpoint — always returns 200 immediately
app.get('/health', (_req, res) => {
  try {
    const activeRooms = io?.sockets?.adapter?.rooms ? io.sockets.adapter.rooms.size : 0;
    const connectedClients = io?.engine ? io.engine.clientsCount : 0;
    res.status(200).json({
      status: 'ok',
      service: 'proxispeak-dedicated-voice-server',
      uptime: Math.floor(process.uptime()),
      connectedClients,
      activeRooms,
      timestamp: new Date().toISOString(),
    });
  } catch (_e) {
    res.status(200).json({ status: 'ok', uptime: Math.floor(process.uptime()) });
  }
});

app.get('/', (_req, res) => {
  res.status(200).json({
    name: 'ProxiSpeak Dedicated Voice Transfer Server',
    status: 'running',
    service: 'dedicated-voice-relay',
    endpoints: {
      health: '/health',
      websocket: 'ws',
    },
  });
});

// Map of socketId -> { socketId, userId, username, roomId, isMuted, joinedAt }
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log(`[VoiceServer] New connection: ${socket.id}`);

  // Join a dedicated voice room
  socket.on('join-voice', ({ roomId = 'test-room', username = 'Anonymous', userId = socket.id }) => {
    socket.join(roomId);

    const userInfo = {
      socketId: socket.id,
      userId,
      username,
      roomId,
      isMuted: false,
      joinedAt: Date.now(),
    };

    connectedUsers.set(socket.id, userInfo);

    // Get all existing participants in this room (excluding current user)
    const roomSockets = io.sockets.adapter.rooms.get(roomId) || new Set();
    const existingPeers = [];

    for (const sId of roomSockets) {
      if (sId !== socket.id && connectedUsers.has(sId)) {
        existingPeers.push(connectedUsers.get(sId));
      }
    }

    // Send the list of existing room peers back to the new joiner
    socket.emit('room-peers', {
      roomId,
      peers: existingPeers,
    });

    // Notify other room members that this user joined
    socket.to(roomId).emit('peer-joined', userInfo);

    console.log(`[VoiceServer] ${username} (${socket.id}) joined room "${roomId}". Room count: ${roomSockets.size}`);
  });

  // 1. Direct WebRTC Signaling Relay through Dedicated Voice Server
  socket.on('webrtc-signal', ({ targetSocketId, signal }) => {
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('webrtc-signal', {
      senderSocketId: socket.id,
      senderUser: connectedUsers.get(socket.id),
      signal,
    });
  });

  // 2. Real-time PCM / Binary Audio Chunk Relay over WebSocket
  socket.on('voice-pcm-chunk', (payload) => {
    const user = connectedUsers.get(socket.id);
    if (!user || user.isMuted) return;

    socket.to(user.roomId).volatile.emit('peer-pcm-chunk', {
      socketId: socket.id,
      userId: user.userId,
      username: user.username,
      pcmData: payload.pcmData, // Float32Array or Int16Array audio buffer
      sampleRate: payload.sampleRate || 44100,
      timestamp: Date.now(),
    });
  });

  // Mute toggle notification
  socket.on('set-mute', ({ isMuted }) => {
    const user = connectedUsers.get(socket.id);
    if (!user) return;

    user.isMuted = !!isMuted;
    socket.to(user.roomId).emit('peer-mute-changed', {
      socketId: socket.id,
      userId: user.userId,
      isMuted: user.isMuted,
    });
  });

  // Leave room
  socket.on('leave-voice', () => {
    handleUserLeave(socket);
  });

  // Disconnect
  socket.on('disconnect', () => {
    handleUserLeave(socket);
    console.log(`[VoiceServer] Disconnected: ${socket.id}`);
  });
});

function handleUserLeave(socket) {
  const user = connectedUsers.get(socket.id);
  if (!user) return;

  const { roomId, userId, username } = user;
  socket.leave(roomId);
  connectedUsers.delete(socket.id);

  socket.to(roomId).emit('peer-left', {
    socketId: socket.id,
    userId,
    username,
  });

  console.log(`[VoiceServer] ${username} left room "${roomId}"`);
}

// Automatic keep-alive ping for Render free tier instances
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_EXTERNAL_URL) {
  const PING_INTERVAL_MS = 2.5 * 60 * 1000;
  setInterval(async () => {
    try {
      const pingUrl = `${RENDER_EXTERNAL_URL}/health`;
      const res = await fetch(pingUrl);
      console.log(`[VoiceServer] Self-ping sent to ${pingUrl} (HTTP ${res.status})`);
    } catch (_e) {
      // Ignored during spin-up
    }
  }, PING_INTERVAL_MS);
}

// Global process error loggers for diagnostic visibility on Render
process.on('uncaughtException', (err) => {
  console.error('[VoiceServer] Fatal Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[VoiceServer] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Explicitly bind to 0.0.0.0 for Render container routing
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[VoiceServer] Dedicated Voice Server listening on 0.0.0.0:${PORT}`);
});
