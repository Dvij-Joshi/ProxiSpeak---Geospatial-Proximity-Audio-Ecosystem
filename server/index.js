import dotenv from 'dotenv';
dotenv.config();
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: 'atlas-credentials.env' });
}

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
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

// ── Dual Layer Storage (MongoDB + In-Memory Fallback) ─────────────────────────
const rooms = new Map();
const memoryAccounts = new Map(); // cleanUsernameLower -> account object
const memoryRooms = new Map();    // roomId -> room object

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

// roomId → Map<roomKey, boolean> (true = open, false = closed)
const roomDoors = new Map();

// Room bounding box definitions matching client layout
const ROOM_AREAS = {
  'meeting-room':   { x1: 18,  y1: 18,  x2: 320,  y2: 268, name: 'Meeting Room' },
  'manager-office': { x1: 350, y1: 18,  x2: 590,  y2: 235, name: "Manager's Office" },
  'tech-server':    { x1: 860, y1: 18,  x2: 1182, y2: 245, name: 'Tech / Server' },
  'lounge-break':   { x1: 18,  y1: 485, x2: 300,  y2: 670, name: 'Lounge & Break' },
  'print-copy':     { x1: 935, y1: 480, x2: 1182, y2: 670, name: 'Print / Copy' },
};

function getRoomKeyAt(x, y) {
  if (x == null || y == null) return null;
  for (const [key, area] of Object.entries(ROOM_AREAS)) {
    if (x >= area.x1 && x <= area.x2 && y >= area.y1 && y <= area.y2) {
      return key;
    }
  }
  return null;
}

// roomId -> Map<doorKey, Map<visitorSocketId, { visitorId, visitorName, doorKey, timestamp }>>
const pendingKnocks = new Map();

// roomId -> Map<doorKey, Map<visitorSocketId, { visitorName, expiresAt }>>
const entryPermissions = new Map();

function getPendingKnocks(roomId, doorKey) {
  if (!pendingKnocks.has(roomId)) pendingKnocks.set(roomId, new Map());
  const rKnocks = pendingKnocks.get(roomId);
  if (!rKnocks.has(doorKey)) rKnocks.set(doorKey, new Map());
  return rKnocks.get(doorKey);
}

function getEntryPermissions(roomId, doorKey) {
  if (!entryPermissions.has(roomId)) entryPermissions.set(roomId, new Map());
  const rPerms = entryPermissions.get(roomId);
  if (!rPerms.has(doorKey)) rPerms.set(doorKey, new Map());
  return rPerms.get(doorKey);
}

function hasValidPermission(roomId, doorKey, socketId) {
  const perms = getEntryPermissions(roomId, doorKey);
  const perm = perms.get(socketId);
  if (!perm) return false;
  if (Date.now() > perm.expiresAt) {
    perms.delete(socketId);
    return false;
  }
  return true;
}

function getOccupantsInRoomArea(roomId, roomKey) {
  const users = getRoomUsers(roomId);
  const occupants = [];
  for (const [socketId, user] of users.entries()) {
    if (getRoomKeyAt(user.x, user.y) === roomKey) {
      occupants.push({ socketId, username: user.username, x: user.x, y: user.y });
    }
  }
  return occupants;
}

function getRoomUsers(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function getRoomDoors(roomId) {
  if (!roomDoors.has(roomId)) {
    roomDoors.set(roomId, new Map([
      ['meeting-room', { isOpen: true, accessed: false, changedBy: 'System' }],
      ['manager-office', { isOpen: true, accessed: false, changedBy: 'System' }],
      ['tech-server', { isOpen: true, accessed: false, changedBy: 'System' }],
      ['lounge-break', { isOpen: true, accessed: false, changedBy: 'System' }],
      ['print-copy', { isOpen: true, accessed: false, changedBy: 'System' }],
    ]));
  }
  return roomDoors.get(roomId);
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

// Initialize default rooms in memory
for (const r of DEFAULT_ROOMS) {
  memoryRooms.set(r.roomId, r);
}

// ── Health Diagnostics ───────────────────────────────────────────────────────
const healthHandler = (_req, res) => {
  const dbConnected = isDbConnected();
  res.json({
    status: 'ok',
    service: 'ProxiSpeak API Server',
    database: dbConnected ? 'connected (MongoDB Atlas)' : 'in-memory mode (Atlas unavailable)',
    dbReadyState: mongoose.connection.readyState,
    registeredAccountsInMemory: memoryAccounts.size,
    activeRoomCount: rooms.size,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

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

    // Check existing in memory
    for (const acc of memoryAccounts.values()) {
      if (acc.username.toLowerCase() === cleanUsername.toLowerCase()) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
      if (acc.email.toLowerCase() === cleanEmail) {
        return res.status(400).json({ error: 'Email is already registered' });
      }
    }

    // Check existing in MongoDB if connected
    if (isDbConnected()) {
      try {
        const existingUser = await Account.findOne({
          $or: [{ username: cleanUsername }, { email: cleanEmail }],
        });
        if (existingUser) {
          if (existingUser.username.toLowerCase() === cleanUsername.toLowerCase()) {
            return res.status(400).json({ error: 'Username is already taken' });
          }
          return res.status(400).json({ error: 'Email is already registered' });
        }
      } catch (dbErr) {
        console.warn('[Register] DB lookup failed, falling back to memory:', dbErr.message);
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    let userId = 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    // Save to DB if connected
    if (isDbConnected()) {
      try {
        const account = await Account.create({
          username: cleanUsername,
          email: cleanEmail,
          passwordHash,
          avatarColor,
        });
        userId = account._id.toString();
      } catch (dbErr) {
        console.warn('[Register] DB save failed, persisting to memory cache:', dbErr.message);
      }
    }

    // Always mirror to memory store for zero-latency retrieval & fallback
    memoryAccounts.set(cleanUsername.toLowerCase(), {
      id: userId,
      username: cleanUsername,
      email: cleanEmail,
      passwordHash,
      avatarColor,
    });

    const token = jwt.sign(
      { id: userId, username: cleanUsername, email: cleanEmail },
      JWT_SECRET,
      { expiresIn: '14d' }
    );

    res.status(201).json({
      token,
      user: {
        id: userId,
        username: cleanUsername,
        email: cleanEmail,
        avatarColor,
      },
    });
  } catch (err) {
    console.error('[Register Error]', err);
    res.status(500).json({ error: 'Failed to create account: ' + (err.message || 'Server error') });
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
    let account = null;

    // Check DB first if connected
    if (isDbConnected()) {
      try {
        account = await Account.findOne({
          $or: [{ username: clean }, { email: clean.toLowerCase() }],
        });
      } catch (dbErr) {
        console.warn('[Login] DB lookup failed, checking memory store:', dbErr.message);
      }
    }

    // Check memory store if not found in DB
    if (!account) {
      const cleanLower = clean.toLowerCase();
      for (const acc of memoryAccounts.values()) {
        if (acc.username.toLowerCase() === cleanLower || acc.email.toLowerCase() === cleanLower) {
          account = acc;
          break;
        }
      }
    }

    if (!account) {
      return res.status(401).json({ error: 'Invalid credentials. User not found.' });
    }

    const passwordHash = account.passwordHash;
    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password. Please try again.' });
    }

    const userId = account._id ? account._id.toString() : account.id;
    const token = jwt.sign(
      { id: userId, username: account.username, email: account.email },
      JWT_SECRET,
      { expiresIn: '14d' }
    );

    res.json({
      token,
      user: {
        id: userId,
        username: account.username,
        email: account.email,
        avatarColor: account.avatarColor,
      },
    });
  } catch (err) {
    console.error('[Login Error]', err);
    res.status(500).json({ error: 'Server error during login: ' + (err.message || 'Unknown error') });
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

    let account = null;
    if (isDbConnected()) {
      try {
        account = await Account.findById(decoded.id).select('-passwordHash');
      } catch (_e) {}
    }

    if (!account) {
      for (const acc of memoryAccounts.values()) {
        if (acc.id === decoded.id || acc.username.toLowerCase() === decoded.username.toLowerCase()) {
          account = acc;
          break;
        }
      }
    }

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({
      user: {
        id: account._id ? account._id.toString() : account.id,
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
    let dbRooms = [];
    if (isDbConnected()) {
      try {
        dbRooms = await Room.find({ isPublic: true }).sort({ createdAt: -1 }).lean();
      } catch (dbErr) {
        console.warn('[get-rooms] DB query failed, using memory rooms:', dbErr.message);
      }
    }

    const allRoomsMap = new Map();

    // 1. Defaults
    for (const r of DEFAULT_ROOMS) {
      allRoomsMap.set(r.roomId, { ...r });
    }

    // 2. Memory rooms
    for (const r of memoryRooms.values()) {
      allRoomsMap.set(r.roomId, { ...r });
    }

    // 3. DB rooms
    for (const r of dbRooms) {
      allRoomsMap.set(r.roomId, {
        roomId: r.roomId,
        name: r.name,
        theme: r.theme,
        description: `Hosted by ${r.createdBy}`,
        createdBy: r.createdBy,
        isPublic: r.isPublic,
      });
    }

    // Attach real-time user count to each room
    const result = Array.from(allRoomsMap.values()).map(r => ({
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

    const validTheme = ['office', 'conference', 'lounge'].includes(theme) ? theme : 'office';
    const code = `${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 12)}-${Math.random().toString(36).substring(2, 6)}`;

    const roomData = {
      roomId: code,
      name: name.trim(),
      theme: validTheme,
      createdBy,
      isPublic: true,
      activeUsers: 0,
    };

    // Save in memory
    memoryRooms.set(code, roomData);

    // Save in DB if connected
    if (isDbConnected()) {
      try {
        await Room.create(roomData);
      } catch (dbErr) {
        console.warn('[create-room] DB save failed, retained in memory:', dbErr.message);
      }
    }

    res.status(201).json(roomData);
  } catch (err) {
    console.error('[create-room]', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Get specific room details
app.get('/api/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    // Check memory rooms (includes defaults)
    if (memoryRooms.has(roomId)) {
      const room = memoryRooms.get(roomId);
      return res.json({
        ...room,
        activeUsers: getRoomUsers(roomId).size,
      });
    }

    // Check DB if connected
    if (isDbConnected()) {
      try {
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
      } catch (_e) {}
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

app.get('/api/room/:roomId/users', (req, res) => {
  const users = getRoomUsers(req.params.roomId);
  res.json([...users.entries()].map(([id, u]) => ({ id, ...u })));
});

// ── Socket.io events ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] connected  : ${socket.id}`);

  // ── join-room ───────────────────────────────────────────────────────────────
  socket.on('join-room', async ({ username, avatarColor, roomId = 'main-office', isMuted = true }) => {
    try {
      // Randomised spawn so players don't stack on top of each other
      const spawnX = 560 + Math.floor(Math.random() * 120);
      const spawnY = 340 + Math.floor(Math.random() * 100);

      // In-memory state
      const roomUsers = getRoomUsers(roomId);
      roomUsers.set(socket.id, { username, avatarColor, x: spawnX, y: spawnY, isMuted });

      socket.join(roomId);
      socket.data.roomId  = roomId;
      socket.data.username = username;
      socket.data.x = spawnX;
      socket.data.y = spawnY;

      // Send the new user the full room state & door states
      socket.emit('room-state', {
        selfId: socket.id,
        users: [...roomUsers.entries()].map(([id, u]) => ({
          id,
          username:    u.username,
          avatarColor: u.avatarColor,
          x: u.x,
          y: u.y,
          isMuted:     u.isMuted ?? true,
        })),
        doors: Object.fromEntries(getRoomDoors(roomId)),
      });

      // Tell everyone else about the new arrival
      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        username,
        avatarColor,
        x: spawnX,
        y: spawnY,
        isMuted,
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
    socket.data.x = x;
    socket.data.y = y;
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

  // ── Toggle Room Door (Open / Close) with Unauthorized Entry Prevention ──────
  socket.on('toggle-door', ({ roomKey, doorKey, isOpen, roomId = 'main-office' }) => {
    const key = doorKey || roomKey;
    if (!key) return;

    const username = socket.data.username || 'A member';
    const user = getRoomUsers(roomId).get(socket.id);
    const userX = user?.x ?? socket.data.x;
    const userY = user?.y ?? socket.data.y;
    const userRoom = getRoomKeyAt(userX, userY);
    const occupants = getOccupantsInRoomArea(roomId, key);
    const isUserInside = userRoom === key;

    // Rule 6: Prevent Unauthorized Entry into occupied rooms
    // If the room is occupied and an outside member attempts to open the door without permission:
    if (!isUserInside && isOpen && occupants.length > 0) {
      const permitted = hasValidPermission(roomId, key, socket.id);
      if (!permitted) {
        socket.emit('door-action-denied', {
          doorKey: key,
          roomName: ROOM_AREAS[key]?.name || key,
          reason: 'This room is currently occupied. You must knock and be welcomed in by an occupant before entering.'
        });
        console.log(`[Door BLOCKED] Unauthorized attempt by outside user "${username}" to open occupied room "${key}"`);
        return;
      }
    }

    const doors = getRoomDoors(roomId);
    const updated = {
      isOpen: Boolean(isOpen),
      accessed: true,
      changedBy: username,
    };
    doors.set(key, updated);

    // Consume entry permission once used to open the door from outside
    if (!isUserInside && isOpen) {
      const perms = getEntryPermissions(roomId, key);
      perms.delete(socket.id);
    }

    io.to(roomId).emit('door-state-changed', {
      doorKey: key,
      roomKey: key,
      isOpen: updated.isOpen,
      accessed: updated.accessed,
      changedBy: username,
    });
    console.log(`[Door] "${username}" ${isOpen ? 'OPENED' : 'CLOSED'} door of "${key}" in "${roomId}"`);
  });

  // ── Knock on Door (Knock-to-Enter System) ────────────────────────────────────
  socket.on('knock-door', ({ roomKey, doorKey, roomId = 'main-office' }) => {
    const key = doorKey || roomKey;
    if (!key) return;
    const username = socket.data.username || 'A member';
    const roomName = ROOM_AREAS[key]?.name || key;
    const occupants = getOccupantsInRoomArea(roomId, key);

    // Rule 1: If room is empty, notify visitor that they can enter directly
    if (occupants.length === 0) {
      socket.emit('knock-status', {
        doorKey: key,
        status: 'room-empty',
        message: `${roomName} is currently empty. You can open the door and enter directly!`
      });
      return;
    }

    // Register pending knock
    const knocks = getPendingKnocks(roomId, key);
    knocks.set(socket.id, {
      visitorId: socket.id,
      visitorName: username,
      doorKey: key,
      timestamp: Date.now(),
    });

    // Notify the visitor that knock was sent and they are waiting
    socket.emit('knock-status', {
      doorKey: key,
      status: 'waiting',
      message: `You knocked on the ${roomName} door. Waiting for occupants to welcome you in...`
    });

    const pendingList = [...knocks.values()];

    // Rule 3: Notify only the members currently inside the room
    for (const occ of occupants) {
      io.to(occ.socketId).emit('visitor-knocked', {
        doorKey: key,
        roomName,
        visitorId: socket.id,
        visitorName: username,
        pendingKnocks: pendingList,
      });
    }

    // Audio chime broadcast to office so occupants hear knock sound
    io.to(roomId).emit('door-knocked', {
      doorKey: key,
      roomKey: key,
      knockedBy: username,
      fromUsername: username,
      fromId: socket.id,
      targetRoomKey: key,
    });

    console.log(`[Door] "${username}" knocked on door of "${key}" (occupants: ${occupants.length})`);
  });

  // ── Welcome Visitor (Approve Entry) ─────────────────────────────────────────
  socket.on('welcome-visitor', ({ roomKey, doorKey, visitorId, roomId = 'main-office' }) => {
    const key = doorKey || roomKey;
    if (!key || !visitorId) return;

    const username = socket.data.username || 'An occupant';
    const roomName = ROOM_AREAS[key]?.name || key;

    // Rule 4: Only members currently inside the room can welcome visitors
    const user = getRoomUsers(roomId).get(socket.id);
    const userX = user?.x ?? socket.data.x;
    const userY = user?.y ?? socket.data.y;
    const userRoom = getRoomKeyAt(userX, userY);

    if (userRoom !== key) {
      socket.emit('door-action-denied', {
        doorKey: key,
        reason: 'Only members currently inside the room can welcome visitors.'
      });
      return;
    }

    // Remove visitor from pending knocks
    const knocks = getPendingKnocks(roomId, key);
    const visitorRecord = knocks.get(visitorId);
    const visitorName = visitorRecord?.visitorName || 'Visitor';
    knocks.delete(visitorId);

    // Rule 5: Grant entry permission (valid for 45s)
    const perms = getEntryPermissions(roomId, key);
    perms.set(visitorId, {
      visitorName,
      expiresAt: Date.now() + 45000,
    });

    // Automatically open the door so the welcomed visitor can enter!
    const doors = getRoomDoors(roomId);
    const updated = {
      isOpen: true,
      accessed: true,
      changedBy: `${username} welcomed ${visitorName}`,
    };
    doors.set(key, updated);

    // Broadcast door opening to the entire office
    io.to(roomId).emit('door-state-changed', {
      doorKey: key,
      roomKey: key,
      isOpen: true,
      accessed: true,
      changedBy: updated.changedBy,
    });

    // Notify the visitor that they were welcomed in
    io.to(visitorId).emit('visitor-welcomed', {
      doorKey: key,
      roomName,
      welcomedBy: username,
      expiresIn: 45,
    });

    // Update remaining pending knocks for all room occupants
    const occupants = getOccupantsInRoomArea(roomId, key);
    const remainingKnocks = [...knocks.values()];
    for (const occ of occupants) {
      io.to(occ.socketId).emit('pending-knocks-updated', {
        doorKey: key,
        pendingKnocks: remainingKnocks,
      });
    }

    console.log(`[Door] "${username}" welcomed "${visitorName}" into "${key}"`);
  });

  // ── Decline Visitor ─────────────────────────────────────────────────────────
  socket.on('decline-visitor', ({ roomKey, doorKey, visitorId, roomId = 'main-office' }) => {
    const key = doorKey || roomKey;
    if (!key || !visitorId) return;

    const username = socket.data.username || 'An occupant';
    const roomName = ROOM_AREAS[key]?.name || key;

    // Security: Only members inside the room can decline visitors
    const user = getRoomUsers(roomId).get(socket.id);
    const userX = user?.x ?? socket.data.x;
    const userY = user?.y ?? socket.data.y;
    const userRoom = getRoomKeyAt(userX, userY);

    if (userRoom !== key) {
      return;
    }

    // Remove from pending knocks
    const knocks = getPendingKnocks(roomId, key);
    const visitorRecord = knocks.get(visitorId);
    const visitorName = visitorRecord?.visitorName || 'Visitor';
    knocks.delete(visitorId);

    // Notify the visitor that their request was declined
    io.to(visitorId).emit('visitor-declined', {
      doorKey: key,
      roomName,
      declinedBy: username,
      reason: 'The room occupants are in a private meeting and declined entry.',
    });

    // Update remaining knocks for occupants
    const occupants = getOccupantsInRoomArea(roomId, key);
    const remainingKnocks = [...knocks.values()];
    for (const occ of occupants) {
      io.to(occ.socketId).emit('pending-knocks-updated', {
        doorKey: key,
        pendingKnocks: remainingKnocks,
      });
    }

    console.log(`[Door] "${username}" declined entry for "${visitorName}" into "${key}"`);
  });

  // ── Cancel Knock ────────────────────────────────────────────────────────────
  socket.on('cancel-knock', ({ roomKey, doorKey, roomId = 'main-office' }) => {
    const key = doorKey || roomKey;
    if (!key) return;
    const knocks = getPendingKnocks(roomId, key);
    knocks.delete(socket.id);

    const occupants = getOccupantsInRoomArea(roomId, key);
    const remainingKnocks = [...knocks.values()];
    for (const occ of occupants) {
      io.to(occ.socketId).emit('pending-knocks-updated', {
        pendingKnocks: remainingKnocks,
      });
    }
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

        // Clean up pending knocks and permissions for disconnected user
        for (const [, rKnocks] of pendingKnocks) {
          for (const [doorKey, doorKnocks] of rKnocks) {
            if (doorKnocks.has(socket.id)) {
              doorKnocks.delete(socket.id);
              const occupants = getOccupantsInRoomArea(roomId, doorKey);
              const remainingKnocks = [...doorKnocks.values()];
              for (const occ of occupants) {
                io.to(occ.socketId).emit('pending-knocks-updated', {
                  doorKey,
                  pendingKnocks: remainingKnocks,
                });
              }
            }
          }
        }
        for (const [, rPerms] of entryPermissions) {
          for (const [, doorPerms] of rPerms) {
            doorPerms.delete(socket.id);
          }
        }
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
