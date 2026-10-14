import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { connectDB } from './db.js';
import User from './models/User.js';

const PORT = process.env.PORT || 5000;

// ── Express + HTTP + Socket.io ───────────────────────────────────────────────
const app = express();

// Allow all origins so network members (other IPs) can connect
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',         // allow any IP on the local network
    methods: ['GET', 'POST'],
  },
  // Allow both websocket and polling fallback
  transports: ['websocket', 'polling'],
});

// ── In-memory room state (fast, no DB latency for joins) ────────────────────
// roomId → Map<socketId, { username, avatarColor, x, y }>
const rooms = new Map();

function getRoomUsers(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

// ── REST endpoints ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.get('/api/room/:roomId/users', (req, res) => {
  const users = getRoomUsers(req.params.roomId);
  res.json([...users.entries()].map(([id, u]) => ({ id, ...u })));
});

// ── Socket.io events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] connected: ${socket.id}`);

  // ── join-room ─────────────────────────────────────────────────────────────
  socket.on('join-room', async ({ username, avatarColor, roomId = 'main-office' }) => {
    try {
      // Default spawn position — randomise slightly so users don't stack
      const spawnX = 580 + Math.floor(Math.random() * 80);
      const spawnY = 360 + Math.floor(Math.random() * 60);

      // Store in in-memory room
      const roomUsers = getRoomUsers(roomId);
      roomUsers.set(socket.id, { username, avatarColor, x: spawnX, y: spawnY });

      // Join socket room
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.username = username;

      // Send this user the full current room state
      socket.emit('room-state', {
        selfId: socket.id,
        users: [...roomUsers.entries()].map(([id, u]) => ({
          id,
          username: u.username,
          avatarColor: u.avatarColor,
          x: u.x,
          y: u.y,
        })),
      });

      // Notify everyone else in the room about the new joiner
      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        username,
        avatarColor,
        x: spawnX,
        y: spawnY,
      });

      console.log(`[Room] "${username}" (${socket.id}) joined "${roomId}" | total: ${roomUsers.size}`);

      // Persist to MongoDB (fire and forget — don't block join)
      User.findOneAndUpdate(
        { socketId: socket.id },
        {
          socketId: socket.id,
          username,
          avatarColor,
          roomId,
          location: { type: 'Point', coordinates: [spawnX, spawnY] },
          lastSeen: new Date(),
        },
        { upsert: true, new: true }
      ).catch(err => console.error('[DB join]', err));

    } catch (err) {
      console.error('[join-room] error:', err);
    }
  });

  // ── move ─────────────────────────────────────────────────────────────────
  socket.on('move', ({ x, y, roomId = 'main-office' }) => {
    // Update in-memory position immediately (low latency)
    const roomUsers = getRoomUsers(roomId);
    const user = roomUsers.get(socket.id);
    if (user) {
      user.x = x;
      user.y = y;
    }

    // Broadcast to everyone else in the room
    socket.to(roomId).emit('user-moved', { id: socket.id, x, y });

    // Persist to MongoDB (fire and forget)
    User.findOneAndUpdate(
      { socketId: socket.id },
      { location: { type: 'Point', coordinates: [x, y] }, lastSeen: new Date() }
    ).catch(err => console.error('[DB move]', err));
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      const roomId = socket.data.roomId;
      const username = socket.data.username;

      if (roomId) {
        const roomUsers = getRoomUsers(roomId);
        roomUsers.delete(socket.id);

        // Notify remaining users
        io.to(roomId).emit('user-left', { id: socket.id });
        console.log(`[Room] "${username}" (${socket.id}) left "${roomId}" | remaining: ${roomUsers.size}`);
      }

      // Remove from DB
      await User.findOneAndDelete({ socketId: socket.id });
    } catch (err) {
      console.error('[disconnect] error:', err);
    }
  });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ ProxiSpeak server running:`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Network: http://<your-ip>:${PORT}`);
    console.log(`   Health:  http://localhost:${PORT}/health\n`);
  });
}).catch(err => {
  console.error('[DB] Connection failed — starting server without DB:', err.message);
  // Start server even if DB fails so multiplayer still works via in-memory state
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`\n⚠️  ProxiSpeak server running (NO DB) on http://localhost:${PORT}\n`);
  });
});
