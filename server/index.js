import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { connectDB } from './db.js';
import User from './models/User.js';
import Account from './models/Account.js';
import Room from './models/Room.js';

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'proxispeak_jwt_secret_dev_key_2026';

// ── Allowed origins ────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://proxi-speak-geospatial-proximity-au-kappa.vercel.app',
  process.env.CLIENT_URL,
  process.env.NGROK_URL,
].filter(Boolean);

// ── Express + HTTP + Socket.io ────────────────────────────────────────────────
const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 10000,
});

// ── In-memory room state ──────────────────────────────────────────────────────
const rooms = new Map();

function getRoomUsers(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

// Predefined official workspaces
const DEFAULT_ROOMS = [
  {
    roomId: 'main-office',
    name: 'Corporate Office',
    theme: 'office',
    description: 'Executive suites, conference tables, and open team desks.',
    createdBy: 'system',
    isPublic: true,
  },
  {
    roomId: 'conference-hall',
    name: 'Conference & Breakout Center',
    theme: 'conference',
    description: 'Keynote stage, presentation hall, and discussion breakouts.',
    createdBy: 'system',
    isPublic: true,
  },
  {
    roomId: 'rooftop-lounge',
    name: 'Rooftop Social Lounge',
    theme: 'lounge',
    description: 'Casual coffee bar, sofa booths, and open air terrace.',
    createdBy: 'system',
    isPublic: true,
  },
];

// ── Auth Endpoints ────────────────────────────────────────────────────────────

// Register a new account
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, avatarColor = '#3b82f6' } = req.body;

    if (!username || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters long' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    const existingUser = await Account.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }],
    });

    if (existingUser) {
      if (existingUser.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const passwordHash = await Account.hashPassword(password);
    const account = await Account.create({
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      avatarColor,
    });

    const token = jwt.sign(
      { id: account._id, username: account.username, email: account.email },
      JWT_SECRET,
      { expiresIn: '14d' }
    );

    res.status(201).json({
      token,
      user: {
        id: account._id,
        username: account.username,
        email: account.email,
        avatarColor: account.avatarColor,
      },
    });
  } catch (err) {
    console.error('[Register]', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please enter your username/email and password' });
    }

    const clean = identifier.trim();
    const account = await Account.findOne({
      $or: [{ username: clean }, { email: clean.toLowerCase() }],
    });

    if (!account) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    const isValid = await account.verifyPassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password. Please try again.' });
    }

    const token = jwt.sign(
      { id: account._id, username: account.username, email: account.email },
      JWT_SECRET,
      { expiresIn: '14d' }
    );

    res.json({
      token,
      user: {
        id: account._id,
        username: account.username,
        email: account.email,
        avatarColor: account.avatarColor,
      },
    });
  } catch (err) {
    console.error('[Login]', err);
    res.status(500).json({ error: 'Server error during login. Please try again.' });
  }
});

// Current user profile verification
app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized. Token required.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const account = await Account.findById(decoded.id).select('-passwordHash');
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({
      user: {
        id: account._id,
        username: account.username,
        email: account.email,
        avatarColor: account.avatarColor,
      },
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ── Rooms Endpoints ───────────────────────────────────────────────────────────

// List all active and public rooms
app.get('/api/rooms', async (_req, res) => {
  try {
    const dbRooms = await Room.find({ isPublic: true }).sort({ createdAt: -1 }).lean().catch(() => []);

    const allRooms = [...DEFAULT_ROOMS];
    for (const r of dbRooms) {
      if (!allRooms.some(x => x.roomId === r.roomId)) {
        allRooms.push({
          roomId: r.roomId,
          name: r.name,
          theme: r.theme,
          description: `Hosted by ${r.createdBy}`,
          createdBy: r.createdBy,
          isPublic: r.isPublic,
        });
      }
    }

    // Attach real-time user count to each room
    const result = allRooms.map(r => ({
      ...r,
      activeUsers: getRoomUsers(r.roomId).size,
    }));

    res.json(result);
  } catch (err) {
    console.error('[get-rooms]', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Create a new meeting room
app.post('/api/rooms', async (req, res) => {
  try {
    const { name, theme = 'office', createdBy = 'Anonymous' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Meeting name is required' });
    }

    // Generate unique human-friendly room code (e.g. sync-7k2p)
    const code = `${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 12)}-${Math.random().toString(36).substring(2, 6)}`;

    const room = await Room.create({
      roomId: code,
      name: name.trim(),
      theme: ['office', 'conference', 'lounge'].includes(theme) ? theme : 'office',
      createdBy,
      isPublic: true,
    });

    res.status(201).json({
      roomId: room.roomId,
      name: room.name,
      theme: room.theme,
      createdBy: room.createdBy,
      activeUsers: 0,
    });
  } catch (err) {
    console.error('[create-room]', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Get specific room details
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const defaultRoom = DEFAULT_ROOMS.find(r => r.roomId === roomId);
    if (defaultRoom) {
      return res.json({
        ...defaultRoom,
        activeUsers: getRoomUsers(roomId).size,
      });
    }

    const dbRoom = await Room.findOne({ roomId }).lean();
    if (dbRoom) {
      return res.json({
        roomId: dbRoom.roomId,
        name: dbRoom.name,
        theme: dbRoom.theme,
        createdBy: dbRoom.createdBy,
        activeUsers: getRoomUsers(roomId).size,
      });
    }

    // Fallback room object for ad-hoc custom shared links
    res.json({
      roomId,
      name: roomId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      theme: 'office',
      createdBy: 'custom',
      activeUsers: getRoomUsers(roomId).size,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch room' });
  }
});

// Health check
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', ts: Date.now(), rooms: rooms.size })
);

app.get('/api/room/:roomId/users', (req, res) => {
  const users = getRoomUsers(req.params.roomId);
  res.json([...users.entries()].map(([id, u]) => ({ id, ...u })));
});

// ── Socket.io events ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] connected  : ${socket.id}`);

  // ── join-room ───────────────────────────────────────────────────────────────
  socket.on('join-room', async ({ username, avatarColor, roomId = 'main-office' }) => {
    try {
      // Randomised spawn so players don't stack on top of each other
      const spawnX = 560 + Math.floor(Math.random() * 120);
      const spawnY = 340 + Math.floor(Math.random() * 100);

      // In-memory state
      const roomUsers = getRoomUsers(roomId);
      roomUsers.set(socket.id, { username, avatarColor, x: spawnX, y: spawnY, isMuted: false });

      socket.join(roomId);
      socket.data.roomId  = roomId;
      socket.data.username = username;

      // Send the new user the full room state (so they see everyone already there)
      socket.emit('room-state', {
        selfId: socket.id,
        users: [...roomUsers.entries()].map(([id, u]) => ({
          id,
          username:    u.username,
          avatarColor: u.avatarColor,
          x: u.x,
          y: u.y,
          isMuted:     u.isMuted ?? false,
        })),
      });

      // Tell everyone else about the new arrival
      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        username,
        avatarColor,
        x: spawnX,
        y: spawnY,
        isMuted: false,
      });

      console.log(`[Room] "${username}" joined "${roomId}" | online: ${roomUsers.size}`);

      // Persist to MongoDB Atlas (fire-and-forget — never blocks the join)
      User.findOneAndUpdate(
        { socketId: socket.id },
        {
          socketId: socket.id,
          username,
          avatarColor,
          roomId,
          x: spawnX,
          y: spawnY,
          location: [spawnX, spawnY],
          lastSeen: new Date(),
        },
        { upsert: true, returnDocument: 'after' }
      ).catch(err => console.error('[DB join]', err.message));

    } catch (err) {
      console.error('[join-room]', err);
    }
  });

  // ── move ────────────────────────────────────────────────────────────────────
  socket.on('move', ({ x, y, roomId = 'main-office' }) => {
    // Update in-memory position first (zero-latency for broadcast)
    const user = getRoomUsers(roomId).get(socket.id);
    if (user) { user.x = x; user.y = y; }

    // Broadcast movement to every other user in the room
    socket.to(roomId).emit('user-moved', { id: socket.id, x, y });

    // Async Atlas update — never blocks broadcast
    User.findOneAndUpdate(
      { socketId: socket.id },
      {
        x,
        y,
        location: [x, y],
        lastSeen: new Date(),
      }
    ).catch(err => console.error('[DB move]', err.message));
  });

  // ── WebRTC Signaling Relay ──────────────────────────────────────────────────
  socket.on('webrtc-offer', ({ to, offer }) => {
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // ── Microphone Mute Status ──────────────────────────────────────────────────
  socket.on('user-mute-status', ({ isMuted, roomId = 'main-office' }) => {
    const roomUsers = getRoomUsers(roomId);
    const user = roomUsers.get(socket.id);
    if (user) {
      user.isMuted = isMuted;
    }
    socket.to(roomId).emit('user-mute-status', { id: socket.id, isMuted });
  });

  // ── leave-room (End Call) ───────────────────────────────────────────────────
  socket.on('leave-room', async ({ roomId } = {}) => {
    try {
      const rId = roomId || socket.data.roomId;
      const username = socket.data.username;
      if (rId) {
        const roomUsers = getRoomUsers(rId);
        roomUsers.delete(socket.id);
        socket.leave(rId);
        io.to(rId).emit('user-left', { id: socket.id });
        console.log(`[Room] "${username}" left room "${rId}" | online: ${roomUsers.size}`);
        socket.data.roomId = null;
      }
      await User.findOneAndDelete({ socketId: socket.id }).catch(() => {});
    } catch (err) {
      console.error('[leave-room]', err);
    }
  });

  // ── disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    try {
      const { roomId, username } = socket.data;
      if (roomId) {
        const roomUsers = getRoomUsers(roomId);
        roomUsers.delete(socket.id);
        io.to(roomId).emit('user-left', { id: socket.id });
        console.log(`[Room] "${username}" left "${roomId}" | online: ${roomUsers.size}`);
      }
      await User.findOneAndDelete({ socketId: socket.id });
    } catch (err) {
      console.error('[disconnect]', err);
    }
  });
});

// ── Keep-Alive Self-Ping (Prevents Render Free Tier from Sleeping) ───────────
const PING_INTERVAL_MS = 2.5 * 60 * 1000; // 2.5 minutes

function startKeepAlive() {
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SERVER_URL;
  if (!selfUrl) {
    console.log('[Keep-Alive] No external URL set (RENDER_EXTERNAL_URL or SERVER_URL). Skipping self-ping in local environment.');
    return;
  }

  console.log(`[Keep-Alive] Service active — self-ping scheduled every 2.5 mins to ${selfUrl}/health`);

  setInterval(async () => {
    try {
      const pingUrl = `${selfUrl}/health`;
      const res = await fetch(pingUrl);
      console.log(`[Keep-Alive] Self-ping sent to ${pingUrl} (HTTP ${res.status})`);
    } catch (err) {
      console.warn('[Keep-Alive] Ping failed:', err.message);
    }
  }, PING_INTERVAL_MS);
}

// ── Boot ───────────────────────────────────────────────────────────────────────
connectDB()
  .then(() => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ ProxiSpeak server running:`);
      console.log(`   Local  : http://localhost:${PORT}`);
      console.log(`   Health : http://localhost:${PORT}/health`);
      console.log(`   Allowed: ${ALLOWED_ORIGINS.join(', ')}\n`);
      startKeepAlive();
    });
  })
  .catch(err => {
    console.error('[DB] Atlas connection failed — starting without DB:', err.message);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n⚠️  ProxiSpeak server running (NO DB) on http://localhost:${PORT}\n`);
      startKeepAlive();
    });
  });
