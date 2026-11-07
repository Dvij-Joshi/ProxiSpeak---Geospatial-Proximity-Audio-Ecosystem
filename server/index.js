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
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from './db.js';
import User from './models/User.js';
import Account from './models/Account.js';
import Room from './models/Room.js';
import Organization from './models/Organization.js';
import OfficeLayout from './models/OfficeLayout.js';
import Meeting from './models/Meeting.js';
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

// ── Redis Pub/Sub Adapter (Week 3 Mesh Scaling: Multi-Node Scaling) ───────────
async function initRedisAdapter() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log('[Redis] REDIS_URL not configured. Running with standard in-memory adapter.');
    return;
  }
  try {
    const pubClient = createClient({ url: redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => console.warn('[Redis pubClient]', err.message));
    subClient.on('error', (err) => console.warn('[Redis subClient]', err.message));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Redis] Socket.io Redis Pub/Sub adapter active for multi-instance scaling.');
  } catch (err) {
    console.warn('[Redis] Failed to connect to Redis. Falling back to in-memory adapter:', err.message);
  }
}

// ── Dual Layer Storage (MongoDB + Persistent Disk Cache + In-Memory Fallback) ─
const rooms = new Map();
const memoryAccounts = new Map(); // cleanUsernameLower -> account object
const memoryRooms = new Map();    // roomId -> room object
const memoryOrgs = new Map();     // orgId -> organization object
const memoryLayouts = new Map();  // layoutId -> office layout object
const memoryMeetings = new Map(); // meetingId -> meeting object

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const ORGS_FILE = path.join(DATA_DIR, 'organizations.json');
const LAYOUTS_FILE = path.join(DATA_DIR, 'layouts.json');
const MEETINGS_FILE = path.join(DATA_DIR, 'meetings.json');

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
loadCachedOrgsAndLayouts();
// Default seed organizations and office layouts
const SEED_ORGS = [
  {
    orgId: 'acme-corp',
    name: 'Acme Corporation',
    slug: 'acme-corp',
    description: 'Enterprise virtual headquarters with departmental suites and collaboration pods.',
    logoColor: '#2563eb',
    owner: 'dvijjoshi',
    members: [
      { username: 'dvijjoshi', role: 'owner', avatarColor: '#3b82f6', joinedAt: new Date() },
      { username: 'kunj', role: 'admin', avatarColor: '#10b981', joinedAt: new Date() },
      { username: 'sumit', role: 'member', avatarColor: '#f59e0b', joinedAt: new Date() },
      { username: 'uma', role: 'member', avatarColor: '#ec4899', joinedAt: new Date() },
    ],
    createdAt: new Date(),
  },
  {
    orgId: 'deepmind-lab',
    name: 'DeepMind Research Lab',
    slug: 'deepmind-lab',
    description: 'AI intelligence sandbox, keynote auditoriums, and quiet focus pods.',
    logoColor: '#8b5cf6',
    owner: 'dvijjoshi',
    members: [
      { username: 'dvijjoshi', role: 'owner', avatarColor: '#8b5cf6', joinedAt: new Date() },
    ],
    createdAt: new Date(),
  },
];

const SEED_MEETINGS = [
  {
    meetingId: 'mtg-acme-standup',
    orgId: 'acme-corp',
    title: 'Daily Architecture Standup',
    description: 'Sync on spatial audio WebRTC mesh and canvas LERP optimizations.',
    template: 'office',
    layoutId: 'acme-corp-office',
    scheduledAt: new Date(Date.now() + 3600 * 1000 * 3),
    status: 'scheduled',
    host: 'dvijjoshi',
    participants: ['dvijjoshi', 'kunj'],
    durationMinutes: 30,
    roomId: 'acme-corp-office',
    createdAt: new Date(),
  },
  {
    meetingId: 'mtg-acme-townhall',
    orgId: 'acme-corp',
    title: 'All-Hands Engineering Townhall',
    description: 'Quarterly milestone review and live spatial audio acoustic demonstration.',
    template: 'conference',
    layoutId: 'acme-corp-conference',
    scheduledAt: new Date(Date.now() - 86400 * 1000 * 2),
    status: 'completed',
    host: 'dvijjoshi',
    participants: ['dvijjoshi', 'kunj', 'sumit', 'uma'],
    startedAt: new Date(Date.now() - 86400 * 1000 * 2),
    endedAt: new Date(Date.now() - 86400 * 1000 * 2 + 45 * 60 * 1000),
    durationMinutes: 45,
    roomId: 'acme-corp-conference',
    createdAt: new Date(Date.now() - 86400 * 1000 * 3),
  },
];

const SEED_LAYOUTS = [
  {
    layoutId: 'acme-main-hq',
    orgId: 'acme-corp',
    name: 'Engineering Campus HQ',
    description: 'Flagship multi-department spatial office with meeting rooms and acoustic zones.',
    theme: 'office',
    width: 2200,
    height: 1300,
    spawnPoint: { x: 1100, y: 720 },
    createdBy: 'dvijjoshi',
    isDefault: true,
    createdAt: new Date(),
  },
  {
    layoutId: 'acme-townhall',
    orgId: 'acme-corp',
    name: 'Townhall Auditorium',
    description: 'Keynote stage, presentation hall, and breakout zones.',
    theme: 'conference',
    width: 2200,
    height: 1300,
    spawnPoint: { x: 1100, y: 1050 },
    createdBy: 'kunj',
    isDefault: false,
    createdAt: new Date(),
  },
  {
    layoutId: 'acme-lounge',
    orgId: 'acme-corp',
    name: 'Executive Sky Lounge',
    description: 'Relaxed ambient terrace with fireside booths and cocktail bar.',
    theme: 'lounge',
    width: 2200,
    height: 1300,
    spawnPoint: { x: 1100, y: 650 },
    createdBy: 'sumit',
    isDefault: false,
    createdAt: new Date(),
  },
  {
    layoutId: 'deepmind-research-hub',
    orgId: 'deepmind-lab',
    name: 'Frontier AI Research Hub',
    description: 'Specialized lab layout with high-isolation neural model review rooms.',
    theme: 'office',
    width: 2200,
    height: 1300,
    spawnPoint: { x: 1100, y: 720 },
    createdBy: 'dvijjoshi',
    isDefault: true,
    createdAt: new Date(),
  },
];

function loadCachedOrgsAndLayouts() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Load Orgs
    if (fs.existsSync(ORGS_FILE)) {
      const raw = fs.readFileSync(ORGS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        for (const o of list) if (o && o.orgId) memoryOrgs.set(o.orgId, o);
      }
    }
    if (memoryOrgs.size === 0) {
      for (const o of SEED_ORGS) memoryOrgs.set(o.orgId, o);
      fs.writeFileSync(ORGS_FILE, JSON.stringify(SEED_ORGS, null, 2), 'utf8');
    }

    // Load Layouts
    if (fs.existsSync(LAYOUTS_FILE)) {
      const raw = fs.readFileSync(LAYOUTS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        for (const l of list) if (l && l.layoutId) memoryLayouts.set(l.layoutId, l);
      }
    }
    if (memoryLayouts.size === 0) {
      for (const l of SEED_LAYOUTS) memoryLayouts.set(l.layoutId, l);
      fs.writeFileSync(LAYOUTS_FILE, JSON.stringify(SEED_LAYOUTS, null, 2), 'utf8');
    }

    // Load Meetings
    if (fs.existsSync(MEETINGS_FILE)) {
      const raw = fs.readFileSync(MEETINGS_FILE, 'utf8');
      const list = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        for (const m of list) if (m && m.meetingId) memoryMeetings.set(m.meetingId, m);
      }
    }
    if (memoryMeetings.size === 0) {
      for (const m of SEED_MEETINGS) memoryMeetings.set(m.meetingId, m);
      fs.writeFileSync(MEETINGS_FILE, JSON.stringify(SEED_MEETINGS, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('[Cache] Error loading orgs/layouts/meetings cache:', err.message);
  }
}

function saveOrgsToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ORGS_FILE, JSON.stringify(Array.from(memoryOrgs.values()), null, 2), 'utf8');
  } catch (_e) {}
}

function saveLayoutsToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LAYOUTS_FILE, JSON.stringify(Array.from(memoryLayouts.values()), null, 2), 'utf8');
  } catch (_e) {}
}

function saveMeetingsToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(MEETINGS_FILE, JSON.stringify(Array.from(memoryMeetings.values()), null, 2), 'utf8');
  } catch (_e) {}
}


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
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
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
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
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
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
    if (isDbConnected()) {
      try {
        account = await Account.findByCredentials(clean);
        if (!account) {
          account = await Account.findOne({ $or: [{ email: cleanLower }, { usernameLower: cleanLower }] });
        }
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
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
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
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
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
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
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
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
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

    // Check if it is an office layout
    let layout = memoryLayouts.get(roomId);
    if (!layout && isDbConnected()) {
      try {
        layout = await OfficeLayout.findOne({ layoutId: roomId }).lean();
      } catch (_e) {}
    }
    if (layout) {
      return res.json({
        roomId: layout.layoutId,
        name: layout.name,
        theme: layout.theme || 'office',
        layout,
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


// ─── Organization & Custom Office Layouts API (Pillar 2) ─────────────────────

// GET /api/organizations - List organizations with office count
app.get('/api/organizations', async (_req, res) => {
  try {
    let orgs = [];
    if (isDbConnected()) {
      try {
        orgs = await Organization.find({}).sort({ createdAt: -1 }).lean();
      } catch (_e) {}
    }
    if (!orgs || orgs.length === 0) {
      orgs = Array.from(memoryOrgs.values());
    }

    // Attach office layout count to each org
    const enriched = orgs.map((org) => {
      const officeCount = Array.from(memoryLayouts.values()).filter((l) => l.orgId === org.orgId).length;
      return {
        ...org,
        officeCount: Math.max(officeCount, 1),
      };
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// POST /api/organizations - Create a new organization with unique name enforcement
app.post('/api/organizations', generalApiLimiter, async (req, res) => {
  try {
    const { name, description = '', owner = 'Anonymous', logoColor = '#2563eb' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const cleanName = name.trim();
    const nameLower = cleanName.toLowerCase();

    // Enforce case-insensitive uniqueness in memory cache
    for (const o of memoryOrgs.values()) {
      if (o.name && o.name.toLowerCase() === nameLower) {
        return res.status(409).json({ error: `An organization with the name "${cleanName}" already exists. Please choose a unique name.` });
      }
    }

    // Enforce case-insensitive uniqueness in MongoDB
    if (isDbConnected()) {
      try {
        const existing = await Organization.findOne({
          $or: [
            { nameLower },
            { name: { $regex: new RegExp(`^${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } }
          ]
        });
        if (existing) {
          return res.status(409).json({ error: `An organization with the name "${cleanName}" already exists. Please choose a unique name.` });
        }
      } catch (_e) {}
    }

    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'org';
    const orgId = `${slug}-${Math.random().toString(36).substring(2, 6)}`;
    const ownerHandle = owner.toLowerCase().trim().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') || 'admin';
    const ownerEmail = `${ownerHandle}@${slug}.com`;

    const newOrg = {
      orgId,
      name: cleanName,
      nameLower,
      slug,
      description: description.trim(),
      logoColor,
      owner,
      members: [
        {
          username: owner,
          displayName: owner,
          email: ownerEmail,
          role: 'owner',
          avatarColor: logoColor,
          joinedAt: new Date()
        }
      ],
      createdAt: new Date(),
    };

    memoryOrgs.set(orgId, newOrg);
    saveOrgsToDisk();

    // Seed the 3 default architectural templates for this organization
    const defaultTemplates = [
      {
        layoutId: `${orgId}-office`,
        orgId,
        name: `${cleanName} Corporate Headquarters`,
        description: 'Executive suites, private soundproof meeting rooms, and team desk pods.',
        theme: 'office',
        width: 2200,
        height: 1300,
        spawnPoint: { x: 1100, y: 720 },
        createdBy: owner,
        isDefault: true,
        createdAt: new Date(),
      },
      {
        layoutId: `${orgId}-conference`,
        orgId,
        name: `${cleanName} Townhall Auditorium`,
        description: 'Keynote stage, presentation hall, speaker podium, and acoustic wings.',
        theme: 'conference',
        width: 2200,
        height: 1300,
        spawnPoint: { x: 1100, y: 1050 },
        createdBy: owner,
        isDefault: false,
        createdAt: new Date(),
      },
      {
        layoutId: `${orgId}-rooftop`,
        orgId,
        name: `${cleanName} Sky Rooftop Lounge`,
        description: 'Ambient terrace, fireside booths, open-air cocktail bar, and VIP lounges.',
        theme: 'rooftop',
        width: 2200,
        height: 1300,
        spawnPoint: { x: 1100, y: 650 },
        createdBy: owner,
        isDefault: false,
        createdAt: new Date(),
      },
    ];

    for (const tmpl of defaultTemplates) {
      memoryLayouts.set(tmpl.layoutId, tmpl);
    }
    saveLayoutsToDisk();

    if (isDbConnected()) {
      try {
        await Organization.create(newOrg);
        for (const tmpl of defaultTemplates) {
          await OfficeLayout.create(tmpl);
        }
      } catch (_e) {}
    }

    res.status(201).json({ ...newOrg, officeCount: defaultTemplates.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// GET /api/organizations/:orgId - Get single organization with members & layouts
app.get('/api/organizations/:orgId', async (req, res) => {
  try {
    const { orgId } = req.params;
    let org = memoryOrgs.get(orgId);
    if (!org && isDbConnected()) {
      try {
        org = await Organization.findOne({ orgId }).lean();
      } catch (_e) {}
    }
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const layouts = Array.from(memoryLayouts.values()).filter((l) => l.orgId === orgId);
    res.json({ ...org, layouts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// POST /api/organizations/:orgId/members - Add user with generated @org.com email & password
app.post('/api/organizations/:orgId/members', generalApiLimiter, async (req, res) => {
  try {
    const { orgId } = req.params;
    const { fullName, username, password, role = 'member', avatarColor = '#3b82f6' } = req.body;
    const rawName = (fullName || username || '').trim();
    if (!rawName) {
      return res.status(400).json({ error: 'User name is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    let org = memoryOrgs.get(orgId);
    if (!org && isDbConnected()) {
      try {
        org = await Organization.findOne({ orgId });
      } catch (_e) {}
    }
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Derive username handle: 'Ramesh Kumar' -> 'ramesh.kumar'
    let handle = rawName.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '').replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
    if (!handle || handle.length < 2) {
      handle = `user.${Math.random().toString(36).substring(2, 6)}`;
    }

    // Auto-generate official company email: ramesh.kumar@google.com
    const orgDomain = org.slug || 'workspace';
    const generatedEmail = `${handle}@${orgDomain}.com`;

    // Check if member handle or email already exists in this org
    const alreadyMember = (org.members || []).some(
      (m) => m.username?.toLowerCase() === handle.toLowerCase() || m.email?.toLowerCase() === generatedEmail.toLowerCase()
    );
    if (alreadyMember) {
      return res.status(409).json({ error: `A member with handle "${handle}" or email "${generatedEmail}" is already in this organization.` });
    }

    // Hash password & create / update ProxiSpeak Account for direct sign-in
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const accountData = {
      username: handle,
      usernameLower: handle.toLowerCase(),
      email: generatedEmail,
      passwordHash,
      avatarColor,
      createdAt: new Date(),
    };
    memoryAccounts.set(handle.toLowerCase(), accountData);
    saveAccountsToDisk();

    if (isDbConnected()) {
      try {
        const existingAcc = await Account.findByCredentials(handle) || await Account.findByCredentials(generatedEmail);
        if (existingAcc) {
          existingAcc.passwordHash = passwordHash;
          await existingAcc.save();
        } else {
          await Account.create(accountData);
        }
      } catch (accErr) {
        console.warn('[AddMember] Account DB save notice:', accErr.message);
      }
    }

    const newMember = {
      username: handle,
      displayName: rawName,
      email: generatedEmail,
      role: ['owner', 'admin', 'member'].includes(role) ? role : 'member',
      avatarColor,
      joinedAt: new Date(),
    };

    org.members = [...(org.members || []), newMember];
    memoryOrgs.set(orgId, org);
    saveOrgsToDisk();

    if (isDbConnected()) {
      try {
        await Organization.updateOne({ orgId }, { $push: { members: newMember } });
      } catch (_e) {}
    }

    res.status(201).json({
      organization: org,
      member: newMember,
      credentials: {
        fullName: rawName,
        username: handle,
        email: generatedEmail,
        initialPassword: password,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add member: ' + err.message });
  }
});

// PUT /api/organizations/:orgId/members/:username - Edit user role or display details
app.put('/api/organizations/:orgId/members/:username', generalApiLimiter, async (req, res) => {
  try {
    const { orgId, username } = req.params;
    const { displayName, role, password, avatarColor } = req.body;

    let org = memoryOrgs.get(orgId);
    if (!org && isDbConnected()) {
      try { org = await Organization.findOne({ orgId }); } catch (_e) {}
    }
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const memberIdx = (org.members || []).findIndex(
      (m) => m.username?.toLowerCase() === username.toLowerCase()
    );
    if (memberIdx === -1) {
      return res.status(404).json({ error: 'Member not found in organization' });
    }

    const member = org.members[memberIdx];

    // Protect owner from being demoted
    if (member.role === 'owner' && role && role !== 'owner') {
      return res.status(400).json({ error: 'Cannot demote the organization owner' });
    }

    if (displayName) member.displayName = displayName.trim();
    if (role && ['admin', 'member'].includes(role) && member.role !== 'owner') {
      member.role = role;
    }
    if (avatarColor) member.avatarColor = avatarColor;

    // If new password provided, update user Account
    if (password && password.length >= 6) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      const acc = memoryAccounts.get(username.toLowerCase());
      if (acc) {
        acc.passwordHash = passwordHash;
        saveAccountsToDisk();
      }
      if (isDbConnected()) {
        try {
          const dbAcc = await Account.findByCredentials(username);
          if (dbAcc) {
            dbAcc.passwordHash = passwordHash;
            await dbAcc.save();
          }
        } catch (_e) {}
      }
    }

    org.members[memberIdx] = member;
    memoryOrgs.set(orgId, org);
    saveOrgsToDisk();

    if (isDbConnected()) {
      try {
        await Organization.updateOne({ orgId }, { $set: { members: org.members } });
      } catch (_e) {}
    }

    res.json({ organization: org, member });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// DELETE /api/organizations/:orgId/members/:username - Remove user from organization
app.delete('/api/organizations/:orgId/members/:username', generalApiLimiter, async (req, res) => {
  try {
    const { orgId, username } = req.params;

    let org = memoryOrgs.get(orgId);
    if (!org && isDbConnected()) {
      try { org = await Organization.findOne({ orgId }); } catch (_e) {}
    }
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    // Protect owner from being removed
    if (org.owner?.toLowerCase() === username.toLowerCase()) {
      return res.status(400).json({ error: 'Cannot remove the organization owner' });
    }

    const filtered = (org.members || []).filter(
      (m) => m.username?.toLowerCase() !== username.toLowerCase()
    );
    org.members = filtered;
    memoryOrgs.set(orgId, org);
    saveOrgsToDisk();

    if (isDbConnected()) {
      try {
        await Organization.updateOne({ orgId }, { $set: { members: filtered } });
      } catch (_e) {}
    }

    res.json({ success: true, organization: org });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// GET /api/organizations/:orgId/meetings - List upcoming, active, and past meetings
app.get('/api/organizations/:orgId/meetings', async (req, res) => {
  try {
    const { orgId } = req.params;
    let meetings = [];
    if (isDbConnected()) {
      try {
        meetings = await Meeting.find({ orgId }).sort({ scheduledAt: -1, createdAt: -1 }).lean();
      } catch (_e) {}
    }
    if (!meetings || meetings.length === 0) {
      meetings = Array.from(memoryMeetings.values()).filter((m) => m.orgId === orgId);
    }

    const now = Date.now();
    const active = meetings.filter((m) => m.status === 'active');
    const upcoming = meetings.filter((m) => m.status === 'scheduled');
    const history = meetings.filter((m) => m.status === 'completed' || m.status === 'cancelled');

    res.json({ all: meetings, active, upcoming, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// POST /api/organizations/:orgId/meetings - Schedule or instant-start an organization meeting
app.post('/api/organizations/:orgId/meetings', generalApiLimiter, async (req, res) => {
  try {
    const { orgId } = req.params;
    const {
      title,
      description = '',
      template = 'office',
      layoutId = '',
      scheduledAt = null,
      isInstant = false,
      host = 'Anonymous',
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Meeting title is required' });
    }

    let org = memoryOrgs.get(orgId);
    if (!org && isDbConnected()) {
      try { org = await Organization.findOne({ orgId }); } catch (_e) {}
    }
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const meetingId = `mtg-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const slugTmpl = template === 'custom' ? (layoutId || 'custom') : template;
    const roomId = isInstant
      ? `${orgId}-${slugTmpl}-${Math.random().toString(36).substring(2, 6)}`
      : `${orgId}-${meetingId}`;

    const newMeeting = {
      meetingId,
      orgId,
      title: title.trim(),
      description: description.trim(),
      template: ['office', 'conference', 'rooftop', 'custom'].includes(template) ? template : 'office',
      layoutId: layoutId || (template === 'custom' ? '' : `${orgId}-${template}`),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : (isInstant ? new Date() : null),
      status: isInstant ? 'active' : 'scheduled',
      host,
      participants: [host],
      startedAt: isInstant ? new Date() : null,
      endedAt: null,
      durationMinutes: 0,
      roomId,
      createdAt: new Date(),
    };

    memoryMeetings.set(meetingId, newMeeting);
    saveMeetingsToDisk();

    if (isDbConnected()) {
      try {
        await Meeting.create(newMeeting);
      } catch (_e) {}
    }

    res.status(201).json(newMeeting);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create meeting: ' + err.message });
  }
});

// PUT /api/organizations/:orgId/meetings/:meetingId/status - Update meeting status (end / cancel)
app.put('/api/organizations/:orgId/meetings/:meetingId/status', generalApiLimiter, async (req, res) => {
  try {
    const { orgId, meetingId } = req.params;
    const { status } = req.body;

    let meeting = memoryMeetings.get(meetingId);
    if (!meeting && isDbConnected()) {
      try { meeting = await Meeting.findOne({ meetingId, orgId }); } catch (_e) {}
    }
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!['scheduled', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid meeting status' });
    }

    meeting.status = status;
    if (status === 'completed') {
      meeting.endedAt = new Date();
      if (meeting.startedAt) {
        meeting.durationMinutes = Math.max(1, Math.round((meeting.endedAt - new Date(meeting.startedAt)) / 60000));
      } else {
        meeting.durationMinutes = 15;
      }
    } else if (status === 'active' && !meeting.startedAt) {
      meeting.startedAt = new Date();
    }

    memoryMeetings.set(meetingId, meeting);
    saveMeetingsToDisk();

    if (isDbConnected()) {
      try {
        await Meeting.updateOne({ meetingId }, { $set: meeting });
      } catch (_e) {}
    }

    res.json(meeting);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update meeting status' });
  }
});

// GET /api/organizations/:orgId/layouts - List all office layouts for an org
app.get('/api/organizations/:orgId/layouts', async (req, res) => {
  try {
    const { orgId } = req.params;
    let layouts = [];
    if (isDbConnected()) {
      try {
        layouts = await OfficeLayout.find({ orgId }).sort({ createdAt: -1 }).lean();
      } catch (_e) {}
    }
    if (!layouts || layouts.length === 0) {
      layouts = Array.from(memoryLayouts.values()).filter((l) => l.orgId === orgId);
    }
    res.json(layouts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch office layouts' });
  }
});

// POST /api/organizations/:orgId/layouts - Save / Create new custom office layout
app.post('/api/organizations/:orgId/layouts', generalApiLimiter, async (req, res) => {
  try {
    const { orgId } = req.params;
    const {
      name,
      description = '',
      theme = 'custom',
      width = 2200,
      height = 1300,
      spawnPoint = { x: 1100, y: 720 },
      walls = [],
      doors = [],
      furniture = [],
      soundZones = [],
      createdBy = 'Anonymous',
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Office name is required' });
    }

    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 24);
    const layoutId = `${orgId}-${slug}-${Math.random().toString(36).substring(2, 6)}`;

    const newLayout = {
      layoutId,
      orgId,
      name: name.trim(),
      description: description.trim(),
      theme,
      width,
      height,
      spawnPoint,
      walls,
      doors,
      furniture,
      soundZones,
      createdBy,
      isDefault: false,
      createdAt: new Date(),
    };

    memoryLayouts.set(layoutId, newLayout);
    saveLayoutsToDisk();

    if (isDbConnected()) {
      try {
        await OfficeLayout.create(newLayout);
      } catch (_e) {}
    }

    res.status(201).json(newLayout);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create office layout' });
  }
});

// GET /api/layouts/:layoutId - Get a specific layout
app.get('/api/layouts/:layoutId', async (req, res) => {
  try {
    const { layoutId } = req.params;
    let layout = memoryLayouts.get(layoutId);
    if (!layout && isDbConnected()) {
      try {
        layout = await OfficeLayout.findOne({ layoutId }).lean();
      } catch (_e) {}
    }
    if (!layout) {
      // Dynamic architectural template fallback for valid meeting rooms & direct organization links
      const isConference = layoutId.includes('conference') || layoutId.includes('auditorium');
      const isRooftop = layoutId.includes('rooftop') || layoutId.includes('lounge');
      const theme = isConference ? 'conference' : isRooftop ? 'rooftop' : 'office';
      const cleanName = layoutId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

      return res.json({
        layoutId,
        name: cleanName,
        theme,
        width: 2200,
        height: 1300,
        spawnPoint: theme === 'conference' ? { x: 1100, y: 1050 } : theme === 'rooftop' ? { x: 1100, y: 650 } : { x: 1100, y: 720 },
        isDefault: true,
      });
    }
    res.json(layout);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch office layout' });
  }
});

// PUT /api/layouts/:layoutId - Update an existing layout
app.put('/api/layouts/:layoutId', generalApiLimiter, async (req, res) => {
  try {
    const { layoutId } = req.params;
    const existing = memoryLayouts.get(layoutId);
    if (!existing) return res.status(404).json({ error: 'Office layout not found' });

    const updated = {
      ...existing,
      ...req.body,
      layoutId,
      orgId: existing.orgId,
      updatedAt: new Date(),
    };

    memoryLayouts.set(layoutId, updated);
    saveLayoutsToDisk();

    if (isDbConnected()) {
      try {
        await OfficeLayout.updateOne({ layoutId }, { $set: updated });
      } catch (_e) {}
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update office layout' });
  }
});

app.get('/api/room/:roomId/users', (req, res) => {
  const users = getRoomUsers(req.params.roomId);
  res.json([...users.entries()].map(([id, u]) => ({ id, ...u })));
});

// ── Proximity Calculations ($near Geospatial Query) ──────────────────────────
/**
 * GET /api/proximity/:userId
 * Finds all active participants within earshot radius (default 100 pixels)
 * using MongoDB $near planar geospatial queries with in-memory fallback.
 */
app.get('/api/proximity/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const radius = Math.min(1000, Math.max(10, Number(req.query.radius) || 100));
    const queryRoomId = req.query.roomId;

    let targetUser = null;

    // 1. Resolve user by MongoDB ObjectId, socketId, or username
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
    if (isDbConnected()) {
      if (mongoose.Types.ObjectId.isValid(userId)) {
        targetUser = await User.findById(userId);
      }
      if (!targetUser) {
        targetUser = await User.findOne({
          $or: [{ socketId: userId }, { username: userId }],
        });
      }
    }

    // Fallback: check in-memory active rooms
    if (!targetUser) {
      for (const [rId, users] of rooms.entries()) {
        for (const [sId, u] of users.entries()) {
          if (sId === userId || u.username === userId) {
            targetUser = {
              _id: sId,
              socketId: sId,
              username: u.username,
              avatarColor: u.avatarColor,
              roomId: rId,
              x: u.x,
              y: u.y,
              location: [u.x, u.y],
            };
            break;
          }
        }
        if (targetUser) break;
      }
    }

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found or offline',
      });
    }

    const targetX = targetUser.location?.[0] ?? targetUser.x;
    const targetY = targetUser.location?.[1] ?? targetUser.y;
    const activeRoomId = queryRoomId || targetUser.roomId;

    let nearbyUsers = [];

    // 2. Perform MongoDB $near geospatial query if connected
    if (!isDbConnected()) {
      try { await connectDB(); } catch (_e) {}
    }
    if (isDbConnected()) {
      try {
        const mongoResults = await User.find({
          socketId: { $ne: targetUser.socketId },
          ...(activeRoomId ? { roomId: activeRoomId } : {}),
          location: {
            $near: [targetX, targetY],
            $maxDistance: radius,
          },
        }).lean();

        nearbyUsers = mongoResults.map((u) => {
          const ux = u.location?.[0] ?? u.x;
          const uy = u.location?.[1] ?? u.y;
          const dist = Math.hypot(ux - targetX, uy - targetY);
          return {
            _id: u._id,
            socketId: u.socketId,
            username: u.username,
            avatarColor: u.avatarColor,
            roomId: u.roomId,
            location: {
              type: 'Point',
              coordinates: [ux, uy],
            },
            distance: Number(dist.toFixed(1)),
          };
        });
      } catch (dbErr) {
        console.warn('[$near] Mongo spatial query failed, falling back to in-memory filter:', dbErr.message);
      }
    }

    // 3. In-memory proximity fallback (e.g. if DB not connected or indexing warming up)
    if (nearbyUsers.length === 0 && rooms.has(activeRoomId)) {
      const roomUsers = rooms.get(activeRoomId);
      for (const [sId, u] of roomUsers.entries()) {
        if (sId === targetUser.socketId) continue;
        const dist = Math.hypot(u.x - targetX, u.y - targetY);
        if (dist <= radius) {
          nearbyUsers.push({
            _id: sId,
            socketId: sId,
            username: u.username,
            avatarColor: u.avatarColor,
            roomId: activeRoomId,
            location: {
              type: 'Point',
              coordinates: [u.x, u.y],
            },
            distance: Number(dist.toFixed(1)),
          });
        }
      }
      nearbyUsers.sort((a, b) => a.distance - b.distance);
    }

    return res.json({
      success: true,
      userId,
      center: [targetX, targetY],
      radius,
      count: nearbyUsers.length,
      nearbyUsers,
    });
  } catch (err) {
    console.error('[/api/proximity/:userId]', err);
    res.status(500).json({ success: false, error: 'Internal server error calculating proximity' });
  }
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

      // Evict any stale duplicate sockets for this username across all rooms
      const targetUserLower = username?.trim().toLowerCase();
      for (const [rId, usersMap] of rooms.entries()) {
        for (const [existingSocketId, existingUser] of usersMap.entries()) {
          const existingUserLower = existingUser.username?.trim().toLowerCase();
          if (
            (existingSocketId === socket.id || (targetUserLower && existingUserLower === targetUserLower)) &&
            (rId !== roomId || existingSocketId !== socket.id)
          ) {
            console.log(`[Room] Evicting stale duplicate session for "${username}" in "${rId}" (old socket: ${existingSocketId})`);
            usersMap.delete(existingSocketId);
            io.to(rId).emit('user-left', { id: existingSocketId });
            const oldSocket = io.sockets.sockets.get(existingSocketId);
            if (oldSocket && existingSocketId !== socket.id) {
              oldSocket.leave(rId);
              oldSocket.disconnect(true);
            }
          }
        }
      }

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

  // ── WebRTC Signaling Relay (Anti-Spam Throttled & Room-Scoped) ───────────────
  socket.on('webrtc-offer', ({ to, offer }) => {
    if (!to || !offer) return;
    if (!checkThrottle('webrtc-offer', 30, 5000)) return;
    const senderRoom = socket.data.roomId;
    if (senderRoom && rooms.has(senderRoom) && !rooms.get(senderRoom).has(to)) {
      return; // Suppress cross-room signaling leaks
    }
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    if (!to || !answer) return;
    if (!checkThrottle('webrtc-answer', 30, 5000)) return;
    const senderRoom = socket.data.roomId;
    if (senderRoom && rooms.has(senderRoom) && !rooms.get(senderRoom).has(to)) {
      return;
    }
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    if (!to || !candidate) return;
    // Multi-peer mesh gathering requires high candidate throughput (burst up to 200 per 5s)
    if (!checkThrottle('webrtc-candidate', 200, 5000)) return;
    const senderRoom = socket.data.roomId;
    if (senderRoom && rooms.has(senderRoom) && !rooms.get(senderRoom).has(to)) {
      return;
    }
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
    try {
      const cleared = await User.deleteMany({});
      if (cleared.deletedCount > 0) {
        console.log(`[DB] Cleaned up ${cleared.deletedCount} stale socket presence record(s).`);
      }
    } catch (_e) {}
    await syncCachedAccountsToDb();
    await initRedisAdapter();
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n✅ ProxiSpeak server running (Anti-DDoS & Rate Limiting Active):`);
      console.log(`   Local  : http://localhost:${PORT}`);
      console.log(`   Health : http://localhost:${PORT}/health`);
      console.log(`   Allowed: ${ALLOWED_ORIGINS.join(', ')}\n`);
      startKeepAlive();
    });
  })
  .catch(async err => {
    console.error('[DB] Database connection error:', err.message);
    await initRedisAdapter();
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n⚠️  ProxiSpeak server running (PERSISTENT DISK CACHE MODE) on http://localhost:${PORT}\n`);
      startKeepAlive();
    });
  });
