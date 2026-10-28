import dotenv from 'dotenv';
dotenv.config();
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: 'atlas-credentials.env' });
}

import fs from 'fs';
import path from 'path';
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
import {
  generalApiLimiter,
  authLimiter,
  roomCreationLimiter,
  securityHeadersMiddleware,
  socketConnectionLimiter,
  createSocketEventThrottler,
} from './security.js';

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

// Disable x-powered-by header (prevents backend fingerprinting)
app.disable('x-powered-by');

// Trust first proxy (Render, Vercel, Cloudflare, Nginx) so client IP detection is accurate
app.set('trust proxy', 1);

// Security headers (Anti-Clickjacking, Anti-Sniffing, XSS filtering)
app.use(securityHeadersMiddleware);

app.use(cors({
  origin: true,
  credentials: true,
}));

// Payload size limit to prevent memory exhaustion / DoS attacks
app.use(express.json({ limit: '25kb' }));

// Apply general API rate limiting to all /api/ endpoints
app.use('/api/', generalApiLimiter);

const httpServer = createServer(app);

// Slowloris attack defense: drop stale / hanging HTTP sockets
httpServer.headersTimeout = 20000;
httpServer.requestTimeout = 30000;
httpServer.keepAliveTimeout = 5000;

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 10000,
  maxHttpBufferSize: 32 * 1024, // 32 KB maximum payload size per packet
});

// Socket connection concurrency limiter (prevents connection exhaustion)
io.use(socketConnectionLimiter);

// ── Dual Layer Storage (MongoDB + Persistent Disk Cache + In-Memory Fallback) ─
const rooms = new Map();
const memoryAccounts = new Map(); // cleanUsernameLower -> account object
const memoryRooms = new Map();    // roomId -> room object

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

// Initialize persistent cache from disk
function loadCachedAccounts() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const raw = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const acc of list) {
          if (acc && acc.username) {
            memoryAccounts.set(acc.username.toLowerCase(), acc);
          }
        }
        console.log(`[Cache] Loaded ${memoryAccounts.size} persistent account(s) from disk cache.`);
      }
    }
  } catch (err) {
    console.warn('[Cache] Failed to load accounts disk cache:', err.message);
  }
}

function saveAccountToCache(account) {
  try {
    const key = account.username.toLowerCase();
    memoryAccounts.set(key, account);
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const all = Array.from(memoryAccounts.values());
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(all, null, 2), 'utf8');
  } catch (err) {
    console.warn('[Cache] Failed to persist account to disk:', err.message);
  }
}

async function syncCachedAccountsToDb() {
  if (!isDbConnected() || memoryAccounts.size === 0) return;
  let synced = 0;
  let failed = 0;
  for (const acc of memoryAccounts.values()) {
    try {
      // Skip accounts already confirmed in MongoDB with a real ObjectId
      if (acc.savedInDb && acc._id && !String(acc._id).startsWith('acc_')) continue;
      const existing = await Account.findByCredentials(acc.username);
      if (!existing) {
        const created = await Account.create({
          username: acc.username,
          usernameLower: acc.username.toLowerCase(),
          email: acc.email,
          passwordHash: acc.passwordHash,
          avatarColor: acc.avatarColor,
        });
        acc._id = created._id;
        acc.id = created._id.toString();
        acc.savedInDb = true;
        synced++;
        console.log(`[Sync] Backfilled cached user "${acc.username}" into MongoDB [ID: ${acc.id}]`);
      } else {
        // Update cache entry with the real MongoDB ID
        acc._id = existing._id;
        acc.id = existing._id.toString();
        acc.savedInDb = true;
      }
    } catch (syncErr) {
      failed++;
      console.warn(`[Sync] Failed to backfill "${acc.username}": ${syncErr.message}`);
    }
  }
  // Persist updated IDs back to disk cache
  if (synced > 0) {
    try {
      const all = Array.from(memoryAccounts.values());
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(all, null, 2), 'utf8');
    } catch (_e) {}
    console.log(`[Sync] Complete: ${synced} backfilled, ${failed} failed out of ${memoryAccounts.size} cached accounts.`);
  }
}

loadCachedAccounts();

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
    database: dbConnected ? 'connected (MongoDB)' : 'in-memory/file mode (MongoDB offline)',
    dbReadyState: mongoose.connection.readyState,
    registeredAccountsInMemory: memoryAccounts.size,
    activeRoomCount: rooms.size,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// ── WebRTC ICE Servers Configuration (STUN / TURN) ────────────────────────────
let _meteredCache = { iceServers: null, fetchedAt: 0 };
const METERED_CACHE_TTL = 12 * 60 * 60 * 1000;

async function fetchMeteredIceServers() {
  const apiKey = process.env.METERED_API_KEY;
  if (!apiKey) return null;

  if (_meteredCache.iceServers && (Date.now() - _meteredCache.fetchedAt) < METERED_CACHE_TTL) {
    return _meteredCache.iceServers;
  }

  try {
    const rawDomain = (process.env.METERED_DOMAIN || 'proxispeak').trim();
    const cleanDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const appDomain = cleanDomain.includes('.metered.live') ? cleanDomain : `${cleanDomain}.metered.live`;
    const url = `https://${appDomain}/api/v1/turn/credentials?apiKey=${apiKey.trim()}`;

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[ICE] Metered API returned ${res.status}: ${body}`);
      return _meteredCache.iceServers;
    }
    const credentials = await res.json();
    if (Array.isArray(credentials) && credentials.length > 0) {
      _meteredCache = { iceServers: credentials, fetchedAt: Date.now() };
      console.log(`[ICE] Metered TURN credentials refreshed (${credentials.length} servers)`);
      return credentials;
    }
  } catch (err) {
    console.error('[ICE] Failed to fetch Metered TURN credentials:', err.message);
  }
  return _meteredCache.iceServers;
}

app.get('/api/ice-servers', async (_req, res) => {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: ['stun:stun.cloudflare.com:3478'] },
  ];

  if (process.env.METERED_API_KEY) {
    const meteredServers = await fetchMeteredIceServers();
    if (meteredServers && meteredServers.length > 0) {
      iceServers.push(...meteredServers);
      return res.json({ iceServers });
    }
  }

  if (process.env.TURN_SERVER) {
    const turnConfig = {
      urls: process.env.TURN_SERVER.split(',').map((s) => s.trim()),
    };
    if (process.env.TURN_USERNAME) turnConfig.username = process.env.TURN_USERNAME;
    if (process.env.TURN_CREDENTIAL) turnConfig.credential = process.env.TURN_CREDENTIAL;
    iceServers.push(turnConfig);
    return res.json({ iceServers });
  }

  res.json({ iceServers });
});

// ── Auth Endpoints (Protected by Auth Rate Limiter) ───────────────────────────

// Register a new account
app.post('/api/auth/register', authLimiter, async (req, res) => {
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
    const cleanUsernameLower = cleanUsername.toLowerCase();

    // 1. Check existing in MongoDB if connected
    if (isDbConnected()) {
      try {
        const existingUser = await Account.findByCredentials(cleanUsernameLower);
        const existingEmail = await Account.findByCredentials(cleanEmail);
        const match = existingUser || existingEmail;
        if (match) {
          if (match.usernameLower === cleanUsernameLower || match.username?.toLowerCase() === cleanUsernameLower) {
            return res.status(400).json({ error: 'Username is already taken. Please choose another username.' });
          }
          return res.status(400).json({ error: 'Email is already registered. Please sign in instead.' });
        }
      } catch (dbErr) {
        console.warn('[Register] DB duplicate lookup error:', dbErr.message);
      }
    }

    // 2. Check existing in cache / persistent store
    for (const acc of memoryAccounts.values()) {
      if (acc.username.toLowerCase() === cleanUsernameLower) {
        return res.status(400).json({ error: 'Username is already taken. Please choose another username.' });
      }
      if (acc.email.toLowerCase() === cleanEmail) {
        return res.status(400).json({ error: 'Email is already registered. Please sign in instead.' });
      }
    }

    // 3. Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let userId = null;
    let savedInDb = false;

    // 4. Save to MongoDB if connected
    if (isDbConnected()) {
      try {
        const account = await Account.create({
          username: cleanUsername,
          usernameLower: cleanUsernameLower,
          email: cleanEmail,
          passwordHash,
          avatarColor,
        });
        userId = account._id.toString();
        savedInDb = true;
        console.log(`[Register] Account registered successfully in MongoDB for "${cleanUsername}" (${cleanEmail}) [ID: ${userId}]`);
      } catch (dbErr) {
        console.error('[Register] MongoDB save error:', dbErr.message);
        if (dbErr.code === 11000) {
          const keyPattern = dbErr.keyPattern || {};
          if (keyPattern.username || keyPattern.usernameLower || dbErr.message?.includes('username')) {
            return res.status(400).json({ error: 'Username is already taken. Please choose another username.' });
          }
          if (keyPattern.email || dbErr.message?.includes('email')) {
            return res.status(400).json({ error: 'Email is already registered. Please sign in instead.' });
          }
        }
        console.warn('[Register] Transient MongoDB write issue, falling back to persistent cache:', dbErr.message);
      }
    }

    // 5. Fallback if DB was unavailable
    if (!userId) {
      userId = 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      console.warn(`[Register] MongoDB not connected — persisting account "${cleanUsername}" to disk cache.`);
    }

    const accountObj = {
      id: userId,
      _id: userId,
      username: cleanUsername,
      usernameLower: cleanUsernameLower,
      email: cleanEmail,
      passwordHash,
      avatarColor,
      savedInDb,
      createdAt: new Date().toISOString(),
    };

    saveAccountToCache(accountObj);

    const token = jwt.sign(
      { id: userId, username: cleanUsername, email: cleanEmail },
      JWT_SECRET,
      { expiresIn: '14d' }
    );

    return res.status(201).json({
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
    return res.status(500).json({ error: 'Failed to create account: ' + (err.message || 'Server error') });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please enter your username/email and password' });
    }

    const clean = identifier.trim();
    const cleanLower = clean.toLowerCase();
    let account = null;

    // 1. Lookup in MongoDB first if connected
    if (isDbConnected()) {
      try {
        account = await Account.findByCredentials(clean);
        if (account) {
          console.log(`[Login] Found account in MongoDB for "${clean}" -> ${account.username} (${account.email})`);
        }
      } catch (dbErr) {
        console.warn('[Login] DB lookup error:', dbErr.message);
      }
    }

    // 2. Lookup in memory / disk cache if not found in DB
    if (!account) {
      for (const acc of memoryAccounts.values()) {
        if (
          acc.username.toLowerCase() === cleanLower ||
          acc.email.toLowerCase() === cleanLower ||
          acc.usernameLower === cleanLower
        ) {
          account = acc;
          console.log(`[Login] Found account in disk cache for "${clean}" -> ${account.username}`);
          break;
        }
      }
    }

    // 3. If account not found:
    if (!account) {
      return res.status(404).json({
        error: 'No account found with this username or email. Please check your spelling or click Create Account to register.',
      });
    }

    // 4. Verify password
    const passwordHash = account.passwordHash;
    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      console.warn(`[Login] Password mismatch for "${account.username}"`);
      return res.status(401).json({ error: 'Incorrect password. Please verify your password and try again.' });
    }

    // 5. If account was only in cache and MongoDB is now connected, backfill into MongoDB!
    if (isDbConnected() && (!account._id || (typeof account._id === 'string' && account._id.startsWith('acc_')))) {
      try {
        const existingInDb = await Account.findByCredentials(clean);
        if (!existingInDb) {
          const newDoc = await Account.create({
            username: account.username,
            usernameLower: account.username.toLowerCase(),
            email: account.email,
            passwordHash: account.passwordHash,
            avatarColor: account.avatarColor,
          });
          account._id = newDoc._id;
          account.id = newDoc._id.toString();
          account.savedInDb = true;
          saveAccountToCache(account);
          console.log(`[Login] Successfully backfilled "${account.username}" into MongoDB [ID: ${account.id}]`);
        }
      } catch (syncErr) {
        console.warn('[Login] Sync cached account notice:', syncErr.message);
      }
    }

    const userId = account._id ? account._id.toString() : account.id;
    const token = jwt.sign(
      { id: userId, username: account.username, email: account.email },
      JWT_SECRET,
      { expiresIn: '14d' }
    );

    return res.json({
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
    return res.status(500).json({ error: 'Server error during login: ' + (err.message || 'Unknown error') });
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
        if (mongoose.Types.ObjectId.isValid(decoded.id)) {
          account = await Account.findById(decoded.id).select('-passwordHash');
        }
        if (!account && decoded.username) {
          account = await Account.findByCredentials(decoded.username).select('-passwordHash');
        }
      } catch (_e) {}
    }

    if (!account) {
      for (const acc of memoryAccounts.values()) {
        if (
          acc.id === decoded.id ||
          acc.username.toLowerCase() === decoded.username?.toLowerCase() ||
          acc.email?.toLowerCase() === decoded.email?.toLowerCase()
        ) {
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

// Create a new meeting room (Protected by room creation rate limiter)
app.post('/api/rooms', roomCreationLimiter, async (req, res) => {
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
  const checkThrottle = createSocketEventThrottler();

  // ── join-room (Anti-Spam Throttled) ─────────────────────────────────────────
  socket.on('join-room', async ({ username, avatarColor, roomId = 'main-office', isMuted = true }) => {
    try {
      if (!checkThrottle('join-room', 4, 5000)) {
        console.warn(`[Anti-Spam] Throttled join-room from socket ${socket.id}`);
        return;
      }

      const spawnX = 560 + Math.floor(Math.random() * 120);
      const spawnY = 340 + Math.floor(Math.random() * 100);
      const userMuted = typeof isMuted === 'boolean' ? isMuted : true;

      const roomUsers = getRoomUsers(roomId);
      roomUsers.set(socket.id, { username, avatarColor, x: spawnX, y: spawnY, isMuted: userMuted });

      socket.join(roomId);
      socket.data.roomId  = roomId;
      socket.data.username = username;
      socket.data.x = spawnX;
      socket.data.y = spawnY;

      socket.emit('room-state', {
        selfId: socket.id,
        users: [...roomUsers.entries()].map(([id, u]) => ({
          id,
          username:    u.username,
          avatarColor: u.avatarColor,
          x: u.x,
          y: u.y,
          isMuted:     typeof u.isMuted === 'boolean' ? u.isMuted : true,
        })),
        doors: Object.fromEntries(getRoomDoors(roomId)),
      });

      socket.to(roomId).emit('user-joined', {
        id: socket.id,
        username,
        avatarColor,
        x: spawnX,
        y: spawnY,
        isMuted: userMuted,
      });

      console.log(`[Room] "${username}" joined "${roomId}" (muted: ${userMuted}) | online: ${roomUsers.size}`);

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

  // ── move (Anti-Spam Throttled at 45/sec) ─────────────────────────────────────
  socket.on('move', ({ x, y, roomId = 'main-office' }) => {
    if (!checkThrottle('move', 45, 1000)) {
      return; // Discard movement packets beyond 45/sec
    }

    socket.data.x = x;
    socket.data.y = y;
    const user = getRoomUsers(roomId).get(socket.id);
    if (user) { user.x = x; user.y = y; }

    socket.to(roomId).emit('user-moved', { id: socket.id, x, y });

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

  // ── WebRTC Signaling Relay (Anti-Spam Throttled) ─────────────────────────────
  socket.on('webrtc-offer', ({ to, offer }) => {
    if (!checkThrottle('webrtc', 40, 5000)) return;
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    if (!checkThrottle('webrtc', 40, 5000)) return;
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    if (!checkThrottle('webrtc', 40, 5000)) return;
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // ── Microphone Mute Status (Anti-Spam Throttled) ────────────────────────────
  socket.on('user-mute-status', ({ isMuted, roomId }) => {
    if (!checkThrottle('user-mute-status', 6, 2000)) return;

    const targetRoomId = (roomId && roomId !== 'main-office') ? roomId : (socket.data.roomId || roomId || 'main-office');
    const roomUsers = getRoomUsers(targetRoomId);
    const user = roomUsers.get(socket.id);
    const mutedBool = Boolean(isMuted);
    if (user) {
      user.isMuted = mutedBool;
    }
    socket.to(targetRoomId).emit('user-mute-status', { id: socket.id, isMuted: mutedBool });
    console.log(`[Mute] "${socket.data.username || socket.id}" in "${targetRoomId}" is now ${mutedBool ? 'MUTED' : 'UNMUTED'}`);
  });

  // ── Toggle Room Door (Anti-Spam Throttled & Unauthorized Entry Prevention) ──
  socket.on('toggle-door', ({ roomKey, doorKey, isOpen, roomId = 'main-office' }) => {
    const key = doorKey || roomKey;
    if (!key) return;

    if (!checkThrottle('toggle-door', 3, 2000)) return;

    const username = socket.data.username || 'A member';
    const user = getRoomUsers(roomId).get(socket.id);
    const userX = user?.x ?? socket.data.x;
    const userY = user?.y ?? socket.data.y;
    const userRoom = getRoomKeyAt(userX, userY);
    const occupants = getOccupantsInRoomArea(roomId, key);
    const isUserInside = userRoom === key;

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

  // ── Knock on Door (Anti-Spam Cooldown & Knock-to-Enter System) ──────────────
  socket.on('knock-door', ({ roomKey, doorKey, roomId = 'main-office' }) => {
    const key = doorKey || roomKey;
    if (!key) return;

    // Anti-Spam: Max 1 knock every 3 seconds per door per socket
    if (!checkThrottle(`knock-door-${key}`, 1, 3000)) {
      socket.emit('knock-status', {
        doorKey: key,
        status: 'throttled',
        message: 'Please wait a moment before knocking again.',
      });
      return;
    }

    const username = socket.data.username || 'A member';
    const roomName = ROOM_AREAS[key]?.name || key;
    const occupants = getOccupantsInRoomArea(roomId, key);

    if (occupants.length === 0) {
      socket.emit('knock-status', {
        doorKey: key,
        status: 'room-empty',
        message: `${roomName} is currently empty. You can open the door and enter directly!`
      });
      return;
    }

    const knocks = getPendingKnocks(roomId, key);
    knocks.set(socket.id, {
      visitorId: socket.id,
      visitorName: username,
      doorKey: key,
      timestamp: Date.now(),
    });

    socket.emit('knock-status', {
      doorKey: key,
      status: 'waiting',
      message: `You knocked on the ${roomName} door. Waiting for occupants to welcome you in...`
    });

    const pendingList = [...knocks.values()];

    for (const occ of occupants) {
      io.to(occ.socketId).emit('visitor-knocked', {
        doorKey: key,
        roomName,
        visitorId: socket.id,
        visitorName: username,
        pendingKnocks: pendingList,
      });
    }

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

    const knocks = getPendingKnocks(roomId, key);
    const visitorRecord = knocks.get(visitorId);
    const visitorName = visitorRecord?.visitorName || 'Visitor';
    knocks.delete(visitorId);

    const perms = getEntryPermissions(roomId, key);
    perms.set(visitorId, {
      visitorName,
      expiresAt: Date.now() + 45000,
    });

    const doors = getRoomDoors(roomId);
    const updated = {
      isOpen: true,
      accessed: true,
      changedBy: `${username} welcomed ${visitorName}`,
    };
    doors.set(key, updated);

    io.to(roomId).emit('door-state-changed', {
      doorKey: key,
      roomKey: key,
      isOpen: true,
      accessed: true,
      changedBy: updated.changedBy,
    });

    io.to(visitorId).emit('visitor-welcomed', {
      doorKey: key,
      roomName,
      welcomedBy: username,
      expiresIn: 45,
    });

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

    const user = getRoomUsers(roomId).get(socket.id);
    const userX = user?.x ?? socket.data.x;
    const userY = user?.y ?? socket.data.y;
    const userRoom = getRoomKeyAt(userX, userY);

    if (userRoom !== key) {
      return;
    }

    const knocks = getPendingKnocks(roomId, key);
    const visitorRecord = knocks.get(visitorId);
    const visitorName = visitorRecord?.visitorName || 'Visitor';
    knocks.delete(visitorId);

    io.to(visitorId).emit('visitor-declined', {
      doorKey: key,
      roomName,
      declinedBy: username,
      reason: 'The room occupants are in a private meeting and declined entry.',
    });

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
        doorKey: key,
        pendingKnocks: remainingKnocks,
      });
    }
  });


  // ── Room Chat (Anti-Spam Throttled) ─────────────────────────────────────────
  socket.on('room:chat:send', ({ roomId: chatRoomId, message }) => {
    if (!checkThrottle('room:chat:send', 10, 5000)) {
      console.warn(`[Anti-Spam] Throttled chat from socket ${socket.id}`);
      return;
    }
    const rId = chatRoomId || socket.data.roomId;
    if (!rId || !message || typeof message !== 'string') return;
    const trimmed = message.trim().slice(0, 500); // cap at 500 chars
    if (!trimmed) return;
    const sender = socket.data.username || 'Anonymous';
    const senderColor = (getRoomUsers(rId).get(socket.id) || {}).avatarColor || '#3b82f6';
    const payload = {
      from: socket.id,
      username: sender,
      avatarColor: senderColor,
      message: trimmed,
      timestamp: Date.now(),
    };
    // Echo back to sender + broadcast to room
    io.to(rId).emit('room:chat:message', payload);
    console.log(`[Chat] "${sender}" in "${rId}": ${trimmed.slice(0, 60)}`);
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
  .then(async () => {
    await syncCachedAccountsToDb();
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ ProxiSpeak server running (Anti-DDoS & Rate Limiting Active):`);
      console.log(`   Local  : http://localhost:${PORT}`);
      console.log(`   Health : http://localhost:${PORT}/health`);
      console.log(`   Allowed: ${ALLOWED_ORIGINS.join(', ')}\n`);
      startKeepAlive();
    });
  })
  .catch(err => {
    console.error('[DB] Database connection error:', err.message);
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n⚠️  ProxiSpeak server running (PERSISTENT DISK CACHE MODE) on http://localhost:${PORT}\n`);
      startKeepAlive();
    });
  });
