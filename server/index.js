import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { connectDB } from './db.js';
import User from './models/User.js';

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ── Express + HTTP + Socket.io ───────────────────────────────────────────────
const app = express();
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
});

// ── REST endpoints ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Return all users currently in a room (for reconnect / initial load)
app.get('/api/room/:roomId/users', async (req, res) => {
  try {
    const users = await User.find({ roomId: req.params.roomId });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Socket.io events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] connected: ${socket.id}`);

  // ── join-room ─────────────────────────────────────────────────────────────
  socket.on('join-room', async ({ username, avatarColor, roomId = 'main-office' }) => {
    try {
      // Upsert: create or replace user document for this socket
      const user = await User.findOneAndUpdate(
        { socketId: socket.id },
        {
          socketId: socket.id,
          username,
          avatarColor,
          roomId,
          location: { type: 'Point', coordinates: [620, 390] },
          lastSeen: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      socket.join(roomId);

      // Send this user their own ID + all existing users in the room
      const roomUsers = await User.find({ roomId });
      socket.emit('room-state', {
        selfId: socket.id,
        users: roomUsers.map(u => ({
          id: u.socketId,
          username: u.username,
          avatarColor: u.avatarColor,
          x: u.location.coordinates[0],
          y: u.location.coordinates[1],
        })),
      });

      // Notify others in the room
      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        username,
        avatarColor,
        x: 620,
        y: 390,
      });

      console.log(`[Room] ${username} (${socket.id}) joined ${roomId}`);
    } catch (err) {
      console.error('[join-room] error:', err);
    }
  });

  // ── move ─────────────────────────────────────────────────────────────────
  socket.on('move', async ({ x, y, roomId = 'main-office' }) => {
    try {
      // Persist to MongoDB
      await User.findOneAndUpdate(
        { socketId: socket.id },
        {
          location: { type: 'Point', coordinates: [x, y] },
          lastSeen: new Date(),
        }
      );

      // Broadcast to everyone else in the room
      socket.to(roomId).emit('user-moved', { id: socket.id, x, y });
    } catch (err) {
      console.error('[move] error:', err);
    }
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      const user = await User.findOneAndDelete({ socketId: socket.id });
      if (user) {
        io.to(user.roomId).emit('user-left', { id: socket.id });
        console.log(`[Room] ${user.username} (${socket.id}) left ${user.roomId}`);
      }
    } catch (err) {
      console.error('[disconnect] error:', err);
    }
  });
});

// ── Boot ─────────────────────────────────────────────────────────────────────
connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`[Server] ProxiSpeak running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('[DB] Connection failed:', err);
  process.exit(1);
});
