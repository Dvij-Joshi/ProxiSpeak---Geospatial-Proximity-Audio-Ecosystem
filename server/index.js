import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { connectDB } from './db.js';
import User from './models/User.js';

const PORT = process.env.PORT || 5000;

// ── Allowed origins ────────────────────────────────────────────────────────────
// Always allow localhost dev + the deployed Vercel frontend
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
  origin: true, // Allow any requesting origin
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

// ── In-memory room state (fast, no DB latency for joins) ──────────────────────
// roomId → Map<socketId, { username, avatarColor, x, y }>
const rooms = new Map();

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

// ── REST endpoints ─────────────────────────────────────────────────────────────
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
        doorKey: key,
        pendingKnocks: remainingKnocks,
      });
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
