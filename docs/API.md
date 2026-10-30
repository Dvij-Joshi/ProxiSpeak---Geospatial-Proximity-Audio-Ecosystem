# ProxiSpeak — API Reference

## Table of Contents
1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [REST Endpoints](#rest-endpoints)
   - [Authentication Endpoints](#authentication-endpoints)
   - [Room Management](#room-management)
   - [ICE & NAT Traversal](#ice--nat-traversal)
   - [Health Diagnostics](#health-diagnostics)
   - [Proximity Endpoints](#proximity-endpoints)
4. [Socket.io Event Specification](#socketio-event-specification)
   - [Connection & Room Lifecycle](#connection--room-lifecycle)
   - [Movement & Coordinates](#movement--coordinates)
   - [WebRTC Signaling](#webrtc-signaling)
   - [Room Chat](#room-chat)
   - [Door Access & Knock-to-Enter](#door-access--knock-to-enter)
5. [Error Handling & Status Codes](#error-handling--status-codes)

---

## Base URL

```
http://localhost:5000
```
In production, replace with your deployed server URL (e.g., `https://proxispeak-server.onrender.com`).

---

## Authentication

ProxiSpeak uses **JWT (JSON Web Tokens)** for account authentication. Upon successful registration or login, the server returns a signed token with 14-day validity.

Protected REST endpoints require the token in the HTTP `Authorization` header:
```http
Authorization: Bearer <jwt_token>
```

---

## REST Endpoints

### Authentication Endpoints

#### `POST /api/auth/register`
Creates a new persistent user account.

**Request Body:**
```json
{
  "username": "dvijjoshi",
  "email": "dvij@example.com",
  "password": "SecurePassword123!",
  "avatarColor": "#3b82f6"
}
```

**Response `201 Created`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "67213456789abcdef0123456",
    "username": "dvijjoshi",
    "email": "dvij@example.com",
    "avatarColor": "#3b82f6"
  }
}
```

---

#### `POST /api/auth/login`
Authenticates an existing user via case-insensitive username or email.

**Request Body:**
```json
{
  "identifier": "dvijjoshi",
  "password": "SecurePassword123!"
}
```

**Response `200 OK`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "67213456789abcdef0123456",
    "username": "dvijjoshi",
    "email": "dvij@example.com",
    "avatarColor": "#3b82f6"
  }
}
```

---

#### `GET /api/auth/me`
Fetches the currently authenticated profile. Requires `Authorization: Bearer <token>`.

**Response `200 OK`:**
```json
{
  "user": {
    "id": "67213456789abcdef0123456",
    "username": "dvijjoshi",
    "email": "dvij@example.com",
    "avatarColor": "#3b82f6"
  }
}
```

---

### Room Management

#### `GET /api/rooms`
Returns a list of all active public workspaces (defaults, memory rooms, and MongoDB database rooms) with real-time occupant counts.

**Response `200 OK`:**
```json
[
  {
    "roomId": "main-office",
    "name": "Corporate Office",
    "theme": "office",
    "description": "Executive suites, conference tables, and open team desks.",
    "createdBy": "system",
    "isPublic": true,
    "activeUsers": 4
  },
  {
    "roomId": "conference-hall",
    "name": "Conference & Breakout Center",
    "theme": "conference",
    "description": "Keynote stage, presentation hall, and discussion breakouts.",
    "createdBy": "system",
    "isPublic": true,
    "activeUsers": 0
  }
]
```

---

#### `POST /api/rooms`
Creates a new formally hosted meeting room and persists it in MongoDB. Rate-limited to prevent spam.

**Request Body:**
```json
{
  "name": "Design Sprint Pod",
  "theme": "office",
  "createdBy": "dvijjoshi"
}
```

**Response `201 Created`:**
```json
{
  "roomId": "design-sprin-a3b4",
  "name": "Design Sprint Pod",
  "theme": "office",
  "createdBy": "dvijjoshi",
  "isPublic": true,
  "activeUsers": 0
}
```

---

#### `GET /api/rooms/:roomId`
Fetches metadata for a specific room. Falls back to generating a valid ad-hoc room configuration if joining via shared link.

**Response `200 OK`:**
```json
{
  "roomId": "team-standup-a4f2",
  "name": "Team Standup",
  "theme": "office",
  "createdBy": "dvijjoshi",
  "activeUsers": 2
}
```

---

### ICE & NAT Traversal

#### `GET /api/ice-servers`
Fetches dynamically configured STUN/TURN credentials from the Metered API with automated domain normalization and fallback Google STUN servers.

**Response `200 OK`:**
```json
[
  {
    "urls": "stun:stun.relay.metered.ca:80"
  },
  {
    "urls": "turn:standard.relay.metered.ca:80",
    "username": "c8a4...",
    "credential": "f7b2..."
  }
]
```

---

### Health Diagnostics

#### `GET /api/health`
Returns comprehensive operational metrics, database connection status, active room counts, and server uptime.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "service": "ProxiSpeak API Server",
  "database": "connected (MongoDB)",
  "dbReadyState": 1,
  "registeredAccountsInMemory": 12,
  "activeRoomCount": 3,
  "uptimeSeconds": 14250,
  "timestamp": "2026-10-30T15:40:00.000Z"
}
```

---

### Proximity Endpoints

#### `GET /api/proximity/:userId`
Queries nearby users using MongoDB's `$near` planar spatial operator within the 100-pixel radius.

**Response `200 OK`:**
```json
{
  "success": true,
  "userId": "67213456789abcdef0123456",
  "nearbyUsers": [
    {
      "_id": "67213456789abcdef0123499",
      "username": "kunj",
      "avatarColor": "#10b981",
      "location": [640, 360],
      "distance": 32.5
    }
  ],
  "count": 1
}
```

---

## Socket.io Event Specification

### Connection & Room Lifecycle

#### `join-room` (Client → Server)
Emitted immediately upon entering a workspace. The server registers the socket, evicts any stale duplicate sessions, and responds with the room state.
```javascript
socket.emit('join-room', {
  username: "dvijjoshi",
  avatarColor: "#3b82f6",
  roomId: "main-office",
  isMuted: true
});
```

#### `room-state` (Server → Client)
Dispatched exclusively to the joining socket. Contains all current room occupants and door states.
```javascript
socket.on('room-state', ({ selfId, users, doors }) => {
  // users: [{ id, username, avatarColor, x, y, isMuted }]
  // doors: { 'meeting-room': { isOpen, accessed, changedBy } }
});
```

#### `user-joined` (Server → Client)
Broadcast to all existing room occupants when a new peer arrives.
```javascript
socket.on('user-joined', ({ id, username, avatarColor, x, y, isMuted }) => { ... });
```

#### `user-left` (Server → Client)
Broadcast when a peer disconnects or leaves the room.
```javascript
socket.on('user-left', ({ id }) => { ... });
```

---

### Movement & Coordinates

#### `move` (Client → Server)
Emitted by the client when the avatar moves. Throttled to 20 Hz (every 50ms) and rate-limited on the server to 45 packets/sec.
```javascript
socket.emit('move', {
  x: 615,
  y: 382,
  roomId: "main-office"
});
```

#### `user-moved` (Server → Client)
Broadcast to other room members to update their LERP interpolation targets (`targetX`, `targetY`).
```javascript
socket.on('user-moved', ({ id, x, y }) => { ... });
```

---

### WebRTC Signaling

#### `webrtc-offer` (Bidirectional)
Relays SDP offer between peers within the same room.
```javascript
socket.emit('webrtc-offer', { to: peerSocketId, offer: sdpOffer });
socket.on('webrtc-offer', ({ from, offer }) => { ... });
```

#### `webrtc-answer` (Bidirectional)
Relays SDP answer back to the initiating peer.
```javascript
socket.emit('webrtc-answer', { to: peerSocketId, answer: sdpAnswer });
socket.on('webrtc-answer', ({ from, answer }) => { ... });
```

#### `ice-candidate` (Bidirectional)
Relays candidate network pathways for peer connectivity.
```javascript
socket.emit('ice-candidate', { to: peerSocketId, candidate: iceCandidate });
socket.on('ice-candidate', ({ from, candidate }) => { ... });
```

---

### Room Chat

#### `room:chat:message` (Bidirectional)
Relays text messages strictly within the active workspace.
```javascript
// Send
socket.emit('room:chat:message', {
  roomId: "main-office",
  sender: "dvijjoshi",
  message: "Can everyone hear me clearly?"
});

// Receive
socket.on('room:chat:message', ({ id, sender, message, avatarColor, timestamp }) => { ... });
```

---

### Door Access & Knock-to-Enter

#### `toggle-door` (Client → Server)
Requests to open or close an enclosed room door.
```javascript
socket.emit('toggle-door', { roomId: "main-office", doorKey: "meeting-room", isOpen: false });
```

#### `knock-door` (Client → Server)
Knocks on an occupied room door from the hallway. Cooldown of 3 seconds.
```javascript
socket.emit('knock-door', { roomId: "main-office", doorKey: "meeting-room" });
```

#### `welcome-visitor` (Client → Server)
Occupants welcome a waiting visitor into their room.
```javascript
socket.emit('welcome-visitor', { roomId: "main-office", doorKey: "meeting-room", visitorSocketId });
```

#### `decline-visitor` (Client → Server)
Occupants decline a visitor's knock request.
```javascript
socket.emit('decline-visitor', { roomId: "main-office", doorKey: "meeting-room", visitorSocketId, reason });
```

---

## Error Handling & Status Codes

| Code | Meaning | Context |
|---|---|---|
| `200 OK` | Request succeeded | Standard GET responses, successful login |
| `201 Created` | Resource created | Account registered, meeting room created |
| `400 Bad Request` | Invalid payload | Missing required username/password, malformed room data |
| `401 Unauthorized` | Authentication failed | Incorrect password, missing or invalid JWT |
| `404 Not Found` | Resource not found | Non-existent user ID |
| `429 Too Many Requests` | Rate limit exceeded | Exceeded room creation or auth attempt thresholds |
| `500 Server Error` | Internal server exception | Unhandled database or connection error |
