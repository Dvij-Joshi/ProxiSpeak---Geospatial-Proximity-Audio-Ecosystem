import User from '../models/User.js';

// In-memory map: socketId → Set of socketIds currently in earshot
const earshotState = new Map();

/**
 * Initializes all Socket.io event handlers for the ProxiSpeak signaling server.
 * Handles avatar movement, proximity detection, and WebRTC offer/answer relay.
 *
 * @param {import('socket.io').Server} io - The Socket.io server instance
 */
export function initSignalingServer(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // ── join-room ─────────────────────────────────────────────────────────────
    socket.on('join-room', async ({ userId, username, roomId, x = 960, y = 540 }) => {
      socket.join(roomId);
      socket.data.userId = userId;
      socket.data.roomId = roomId;

      // Update or create user in DB
      await User.findByIdAndUpdate(
        userId,
        {
          socketId: socket.id,
          username,
          roomId,
          location: { type: 'Point', coordinates: [x, y] },
          lastSeen: new Date(),
        },
        { upsert: true, new: true }
      );

      // Send current room occupants to the new user
      const roomUsers = await User.find({ roomId }).lean();
      socket.emit('room-users', { users: roomUsers });

      // Notify others in the room
      socket.to(roomId).emit('user-moved', { userId, socketId: socket.id, x, y });

      earshotState.set(socket.id, new Set());
      console.log(`👤 ${username} joined room ${roomId} at (${x}, ${y})`);
    });

    // ── move ──────────────────────────────────────────────────────────────────
    socket.on('move', async ({ userId, x, y, roomId }) => {
      // Update position in MongoDB
      await User.findByIdAndUpdate(userId, {
        location: { type: 'Point', coordinates: [x, y] },
        lastSeen: new Date(),
      });

      // Broadcast movement to room
      socket.to(roomId).emit('user-moved', { userId, socketId: socket.id, x, y });

      // Proximity detection
      const MAX_DISTANCE = Number(process.env.MAX_EARSHOT_DISTANCE) || 100;
      const nearbyUsers = await User.find({
        _id: { $ne: userId },
        roomId,
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [x, y] },
            $maxDistance: MAX_DISTANCE,
          },
        },
      }).lean();

      const nearbySocketIds = new Set(nearbyUsers.map((u) => u.socketId));
      const prevEarshot = earshotState.get(socket.id) || new Set();

      const inEarshot = nearbyUsers
        .filter((u) => !prevEarshot.has(u.socketId))
        .map((u) => ({
          userId: u._id,
          socketId: u.socketId,
          distance: Math.hypot(u.location.coordinates[0] - x, u.location.coordinates[1] - y),
          deltaX: u.location.coordinates[0] - x,
        }));

      const leftEarshot = [...prevEarshot].filter((sid) => !nearbySocketIds.has(sid));

      earshotState.set(socket.id, nearbySocketIds);

      if (inEarshot.length > 0 || leftEarshot.length > 0) {
        socket.emit('proximity-update', { inEarshot, leftEarshot });
      }
    });

    // ── WebRTC Signaling Relay ────────────────────────────────────────────────
    socket.on('webrtc-offer', ({ to, offer }) => {
      io.to(to).emit('webrtc-offer', { from: socket.id, offer });
    });

    socket.on('webrtc-answer', ({ to, answer }) => {
      io.to(to).emit('webrtc-answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
      io.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // ── Network Quality ───────────────────────────────────────────────────────
    // Client reports its own WebRTC stats; server relays to the peer's room
    // so their avatar can display a signal quality indicator.
    socket.on('network-quality', ({ peerId, quality }) => {
      io.to(peerId).emit('peer-network-quality', { socketId: socket.id, quality });
    });

    // ── disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const { userId, roomId } = socket.data;
      if (userId) {
        await User.findByIdAndDelete(userId);
      }
      earshotState.delete(socket.id);
      if (roomId) {
        socket.to(roomId).emit('user-disconnected', { socketId: socket.id });
      }
      console.log(`🔌 Socket disconnected: ${socket.id}`);
    });
  });
}
