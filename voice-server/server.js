import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5001;
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Render health check endpoint
app.get('/health', (req, res) => {
  const rooms = io.sockets.adapter.rooms;
  const connectedSockets = io.engine.clientsCount;
  res.json({
    status: 'healthy',
    service: 'proxispeak-dedicated-voice-server',
    uptime: Math.floor(process.uptime()),
    connectedClients: connectedSockets,
    activeRooms: rooms ? rooms.size : 0,
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'ProxiSpeak Dedicated Voice Transfer Server',
    status: 'running',
    service: 'dedicated-voice-relay',
    endpoints: {
      health: '/health',
      websocket: 'ws',
    },
  });
});

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
  // volatile ensures frames are never queued up during lag spikes
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
      const fetchMod = await import('node-fetch');
      await fetchMod.default(`${RENDER_EXTERNAL_URL}/health`);
      console.log(`[VoiceServer] Self-ping sent to ${RENDER_EXTERNAL_URL}/health`);
    } catch (_e) {
      // Ignored during spin-up
    }
  }, PING_INTERVAL_MS);
}

httpServer.listen(PORT, () => {
  console.log(`[VoiceServer] Running on port ${PORT}`);
});
