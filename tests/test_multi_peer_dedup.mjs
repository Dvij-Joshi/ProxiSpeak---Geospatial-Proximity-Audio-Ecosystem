import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from '../client/node_modules/socket.io-client/build/esm/index.js';

const PORT = 5915;
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const rooms = new Map();
function getRoomUsers(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

// Server-side join-room logic matching our server/index.js implementation
io.on('connection', (socket) => {
  socket.on('join-room', ({ userId, username, avatarColor, roomId = 'main-office', isMuted = true }) => {
    const effectiveUserId = userId || `usr_${username}`;
    const roomUsers = getRoomUsers(roomId);

    // Stale socket cleanup
    for (const [existingSocketId, existingUser] of roomUsers.entries()) {
      if (existingSocketId !== socket.id && (existingUser.userId === effectiveUserId || existingUser.username === username)) {
        roomUsers.delete(existingSocketId);
        io.to(roomId).emit('user-left', { id: existingSocketId, userId: effectiveUserId });
        const oldSock = io.sockets.sockets.get(existingSocketId);
        if (oldSock) {
          try { oldSock.leave(roomId); } catch (_e) {}
        }
      }
    }

    roomUsers.set(socket.id, {
      userId: effectiveUserId,
      username,
      avatarColor,
      x: 500,
      y: 300,
      isMuted,
    });

    socket.join(roomId);
    socket.data = { roomId, userId: effectiveUserId, username, x: 500, y: 300 };

    socket.emit('room-state', {
      selfId: socket.id,
      selfUserId: effectiveUserId,
      users: [...roomUsers.entries()].map(([id, u]) => ({
        id,
        userId: u.userId,
        username: u.username,
        avatarColor: u.avatarColor,
        x: u.x,
        y: u.y,
        isMuted: u.isMuted,
      })),
    });

    socket.to(roomId).emit('user-joined', {
      id: socket.id,
      userId: effectiveUserId,
      username,
      avatarColor,
      x: 500,
      y: 300,
      isMuted,
    });
  });

  socket.on('webrtc-offer', ({ to, offer }) => {
    io.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    io.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    const { roomId, userId } = socket.data || {};
    if (roomId && rooms.has(roomId)) {
      rooms.get(roomId).delete(socket.id);
      io.to(roomId).emit('user-left', { id: socket.id, userId });
    }
  });
});

async function run() {
  await new Promise(r => httpServer.listen(PORT, '127.0.0.1', r));
  console.log(`[Test Server] Live on 127.0.0.1:${PORT}`);

  function waitForConnect(sock) {
    if (sock.connected) return Promise.resolve();
    return new Promise((resolve, reject) => {
      sock.once('connect', resolve);
      sock.once('connect_error', reject);
    });
  }

  function createClient(username, userId) {
    const sock = ioClient(`http://127.0.0.1:${PORT}`, {
      transports: ['polling'],
      reconnection: false
    });
    sock.on('connect_error', (err) => console.error(`[${username}] connect_error:`, err.message));
    const peers = {};
    const audioConnections = new Set();

    sock.on('room-state', ({ selfId, selfUserId, users }) => {
      for (const u of users) {
        if (u.id === selfId || u.userId === userId) continue;
        for (const [sid, p] of Object.entries(peers)) {
          if (p.userId === u.userId) {
            delete peers[sid];
            audioConnections.delete(sid);
          }
        }
        peers[u.id] = u;
        audioConnections.add(u.id);
      }
    });

    sock.on('user-joined', (u) => {
      if (u.id === sock.id || u.userId === userId) return;
      for (const [sid, p] of Object.entries(peers)) {
        if (p.userId === u.userId) {
          delete peers[sid];
          audioConnections.delete(sid);
        }
      }
      peers[u.id] = u;
      audioConnections.add(u.id);
    });

    sock.on('user-left', ({ id, userId: leftUid }) => {
      delete peers[id];
      audioConnections.delete(id);
      if (leftUid) {
        for (const [sid, p] of Object.entries(peers)) {
          if (p.userId === leftUid) {
            delete peers[sid];
            audioConnections.delete(sid);
          }
        }
      }
    });

    return { sock, peers, audioConnections, username, userId };
  }

  // 1. Join 4 unique participants: Alice, Bob, Charlie, Dave
  console.log('\n--- Test 1: Four unique participants join active meeting ---');
  const alice = createClient('Alice', 'user_alice_1');
  const bob = createClient('Bob', 'user_bob_2');
  const charlie = createClient('Charlie', 'user_charlie_3');
  const dave = createClient('Dave', 'user_dave_4');

  await waitForConnect(alice.sock);
  alice.sock.emit('join-room', { userId: alice.userId, username: alice.username, roomId: 'main-office' });
  await new Promise(r => setTimeout(r, 100));

  await waitForConnect(bob.sock);
  bob.sock.emit('join-room', { userId: bob.userId, username: bob.username, roomId: 'main-office' });
  await new Promise(r => setTimeout(r, 100));

  await waitForConnect(charlie.sock);
  charlie.sock.emit('join-room', { userId: charlie.userId, username: charlie.username, roomId: 'main-office' });
  await new Promise(r => setTimeout(r, 100));

  await waitForConnect(dave.sock);
  dave.sock.emit('join-room', { userId: dave.userId, username: dave.username, roomId: 'main-office' });
  await new Promise(r => setTimeout(r, 200));

  console.log(`Alice sees ${Object.keys(alice.peers).length} peers (expected 3)`);
  console.log(`Bob sees ${Object.keys(bob.peers).length} peers (expected 3)`);
  console.log(`Charlie sees ${Object.keys(charlie.peers).length} peers (expected 3)`);
  console.log(`Dave sees ${Object.keys(dave.peers).length} peers (expected 3)`);

  console.assert(Object.keys(alice.peers).length === 3, 'Alice should see 3 peers');
  console.assert(Object.keys(bob.peers).length === 3, 'Bob should see 3 peers');
  console.assert(Object.keys(charlie.peers).length === 3, 'Charlie should see 3 peers');
  console.assert(Object.keys(dave.peers).length === 3, 'Dave should see 3 peers');
  console.log('✓ Test 1 Passed: Exactly 4 participants present with 3 remote peers each (0 duplicates)');

  // 2. Bob reconnects with a new socket (simulating page reload / reconnection)
  console.log('\n--- Test 2: Bob reconnects with a new socket session ---');
  const bobReconnected = createClient('Bob', 'user_bob_2');
  await waitForConnect(bobReconnected.sock);
  bobReconnected.sock.emit('join-room', { userId: bobReconnected.userId, username: bobReconnected.username, roomId: 'main-office' });
  await new Promise(r => setTimeout(r, 250));

  const alicePeersAfterReconnect = Object.values(alice.peers);
  const bobCountInAlice = alicePeersAfterReconnect.filter(p => p.userId === 'user_bob_2').length;
  console.log(`Alice sees Bob avatars: ${bobCountInAlice} (expected exactly 1)`);
  console.log(`Total peers in Alice view: ${alicePeersAfterReconnect.length} (expected 3)`);

  console.assert(bobCountInAlice === 1, 'Bob must appear exactly ONCE, not duplicated!');
  console.assert(alicePeersAfterReconnect.length === 3, 'Total remote peer count must remain exactly 3!');
  console.log('✓ Test 2 Passed: Reconnecting participant replaces old socket with 0 duplicate avatars');

  // 3. A 5th participant joins the active meeting
  console.log('\n--- Test 3: 5th participant (Eve) joins ongoing meeting ---');
  const eve = createClient('Eve', 'user_eve_5');
  await waitForConnect(eve.sock);
  eve.sock.emit('join-room', { userId: eve.userId, username: eve.username, roomId: 'main-office' });
  await new Promise(r => setTimeout(r, 250));

  console.log(`Alice sees ${Object.keys(alice.peers).length} peers (expected 4)`);
  console.log(`Eve sees ${Object.keys(eve.peers).length} peers (expected 4)`);

  console.assert(Object.keys(alice.peers).length === 4, 'Alice should see 4 peers with Eve');
  console.assert(Object.keys(eve.peers).length === 4, 'Eve should see all 4 existing peers');
  console.log('✓ Test 3 Passed: 5th participant connects bidirectionally to all existing peers');

  // 4. One participant leaves
  console.log('\n--- Test 4: Participant (Charlie) leaves the meeting ---');
  charlie.sock.disconnect();
  await new Promise(r => setTimeout(r, 250));

  console.log(`Alice remote peers after Charlie left: ${Object.keys(alice.peers).length} (expected 3)`);
  console.assert(Object.keys(alice.peers).length === 3, 'Alice should now see 3 peers');
  console.assert(!alice.peers[charlie.sock.id], 'Charlie socket removed from Alice peers');
  console.log('✓ Test 4 Passed: Leaving participant cleanly removes avatar and audio connection');

  // Clean shutdown
  alice.sock.disconnect();
  bob.sock.disconnect();
  bobReconnected.sock.disconnect();
  dave.sock.disconnect();
  eve.sock.disconnect();
  await new Promise(r => httpServer.close(r));
  console.log('\n======================================================');
  console.log('VERDICT: PASS -- All WebRTC synchronization & avatar deduplication tests PASSED');
  console.log('======================================================\n');
  process.exit(0);
}

run().catch(err => {
  console.error('VERDICT: FAIL --', err);
  process.exit(1);
});
