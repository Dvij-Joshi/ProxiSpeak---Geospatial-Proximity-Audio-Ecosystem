# ProxiSpeak — API Reference

## Table of Contents
1. [Base URL](#base-url)
2. [Authentication](#authentication)
3. [REST Endpoints](#rest-endpoints)
   - [Health Check](#health-check)
   - [Proximity](#proximity)
   - [Users](#users)
4. [Socket.io Events](#socketio-events)
   - [Client → Server](#client--server-events)
   - [Server → Client](#server--client-events)
5. [Data Models](#data-models)
6. [Error Codes](#error-codes)

---

## Base URL

```
http://localhost:5000/api
```

In production, replace with your deployed server URL.

---

## Authentication

> Currently, ProxiSpeak uses **socket-based session identity** (no JWT). The `socketId` is automatically assigned by Socket.io on connection. Future versions will support JWT for persistent user accounts.

---

## REST Endpoints

### Health Check

#### `GET /health`

Returns server health status.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "uptime": 3621.44,
  "timestamp": "2025-10-10T10:00:00.000Z",
  "db": "connected"
}
```

---

### Proximity

#### `GET /api/proximity/:userId`

Finds all users currently within earshot (100-unit radius) of the given user.

**URL Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `userId` | `string` | The MongoDB `_id` of the querying user |

**Response `200 OK`:**
```json
{
  "success": true,
  "userId": "64f3a2b1c0d1234567890abc",
  "nearbyUsers": [
    {
      "_id": "64f3a2b1c0d1234567890def",
      "username": "Alice",
      "avatarColor": "#4A90D9",
      "location": {
        "type": "Point",
        "coordinates": [245, 312]
      },
      "distance": 43.2
    }
  ],
  "count": 1
}
```

**Response `404 Not Found`:**
```json
{
  "success": false,
  "error": "User not found"
}
```

---

#### `POST /api/proximity/update`

Updates the authenticated user's geospatial position. Called when the avatar moves significantly (debounced on client).

**Request Body:**
```json
{
  "userId": "64f3a2b1c0d1234567890abc",
  "x": 300,
  "y": 450,
  "roomId": "main-office"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `userId` | `string` | ✅ | MongoDB user `_id` |
| `x` | `number` | ✅ | Canvas X coordinate (0–1920) |
| `y` | `number` | ✅ | Canvas Y coordinate (0–1080) |
| `roomId` | `string` | ✅ | Virtual room identifier |

**Response `200 OK`:**
```json
{
  "success": true,
  "updated": {
    "_id": "64f3a2b1c0d1234567890abc",
    "location": { "type": "Point", "coordinates": [300, 450] }
  },
  "nearbyUsers": ["64f3a2b1c0d1234567890def"]
}
```

---

#### `GET /api/proximity/room/:roomId`

Returns all active users in a given virtual room along with their positions.

**URL Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `roomId` | `string` | The room identifier (e.g., `main-office`) |

**Response `200 OK`:**
```json
{
  "success": true,
  "roomId": "main-office",
  "users": [
    {
      "_id": "64f3a2b1c0d1234567890abc",
      "username": "Bob",
      "avatarColor": "#E94E4E",
      "location": { "type": "Point", "coordinates": [150, 200] }
    }
  ],
  "count": 1
}
```

---

### Users

#### `POST /api/users/join`

Registers a new user session when they join the virtual office.

**Request Body:**
```json
{
  "username": "Dvij",
  "avatarColor": "#6A0DAD",
  "roomId": "main-office",
  "socketId": "abc123xyz"
}
```

**Response `201 Created`:**
```json
{
  "success": true,
  "user": {
    "_id": "64f3a2b1c0d1234567890abc",
    "username": "Dvij",
    "avatarColor": "#6A0DAD",
    "roomId": "main-office",
    "location": { "type": "Point", "coordinates": [960, 540] }
  }
}
```

---

#### `DELETE /api/users/:socketId`

Removes a user from the active session (called on socket disconnect).

**Response `200 OK`:**
```json
{
  "success": true,
  "message": "User removed from session"
}
```

---

## Socket.io Events

Connect to the Socket.io server at `ws://localhost:5000`.

### Client → Server Events

#### `join-room`
Emitted when a user enters the virtual office.

```js
socket.emit("join-room", {
  userId: "64f3a2b1c0d1234567890abc",
  username: "Dvij",
  roomId: "main-office",
  x: 960,
  y: 540
});
```

---

#### `move`
Emitted when the user's avatar changes position. Throttled to max once per **50ms** on the client.

```js
socket.emit("move", {
  userId: "64f3a2b1c0d1234567890abc",
  x: 320,
  y: 450,
  roomId: "main-office"
});
```

---

#### `webrtc-offer`
Relays a WebRTC SDP offer to a specific peer.

```js
socket.emit("webrtc-offer", {
  to: "targetSocketId",
  from: socket.id,
  offer: RTCSessionDescriptionInit   // { type: "offer", sdp: "..." }
});
```

---

#### `webrtc-answer`
Relays a WebRTC SDP answer back to the initiating peer.

```js
socket.emit("webrtc-answer", {
  to: "targetSocketId",
  from: socket.id,
  answer: RTCSessionDescriptionInit  // { type: "answer", sdp: "..." }
});
```

---

#### `ice-candidate`
Relays an ICE candidate to a peer for NAT traversal.

```js
socket.emit("ice-candidate", {
  to: "targetSocketId",
  from: socket.id,
  candidate: RTCIceCandidateInit
});
```

---

### Server → Client Events

#### `room-users`
Sent immediately after `join-room`. Contains the current list of all users in the room.

```js
socket.on("room-users", (data) => {
  // data: { users: [{ userId, username, x, y, socketId }] }
});
```

---

#### `user-moved`
Broadcast to all users in the room when any avatar moves.

```js
socket.on("user-moved", (data) => {
  // data: { userId, x, y, socketId }
});
```

---

#### `proximity-update`
Sent to the mover when their proximity cluster changes (someone enters or leaves earshot).

```js
socket.on("proximity-update", (data) => {
  // data: {
  //   inEarshot: [{ userId, socketId, distance, deltaX }],
  //   leftEarshot: ["socketId1", "socketId2"]
  // }
});
```

---

#### `webrtc-offer`
Received by the target peer to begin answering a WebRTC offer.

```js
socket.on("webrtc-offer", ({ from, offer }) => {
  // Create answer and emit "webrtc-answer"
});
```

---

#### `webrtc-answer`
Received by the initiating peer after the target accepts.

```js
socket.on("webrtc-answer", ({ from, answer }) => {
  // Set remote description on RTCPeerConnection
});
```

---

#### `ice-candidate`
Received ICE candidate from a peer for NAT traversal.

```js
socket.on("ice-candidate", ({ from, candidate }) => {
  // Add to RTCPeerConnection
});
```

---

#### `user-disconnected`
Emitted when a user leaves the office, so peers can close connections.

```js
socket.on("user-disconnected", ({ socketId }) => {
  // Close and remove the RTCPeerConnection for this socketId
});
```

---

## Data Models

### User
```ts
interface User {
  _id: string;              // MongoDB ObjectId
  socketId: string;         // Current Socket.io session ID
  username: string;         // Display name (max 30 chars)
  avatarColor: string;      // Hex color string, e.g. "#4A90D9"
  roomId: string;           // Virtual office room identifier
  location: {
    type: "Point";
    coordinates: [number, number];  // [x, y] canvas coordinates
  };
  lastSeen: string;         // ISO 8601 timestamp
}
```

### ProximityResult
```ts
interface ProximityResult {
  userId: string;
  socketId: string;
  distance: number;         // Euclidean distance in canvas units
  deltaX: number;           // Horizontal offset (for stereo panning)
  deltaY: number;           // Vertical offset
}
```

---

## Error Codes

| HTTP Code | Code String | Description |
|---|---|---|
| `400` | `INVALID_COORDINATES` | X or Y coordinates out of bounds |
| `400` | `MISSING_REQUIRED_FIELD` | Required field missing in request body |
| `404` | `USER_NOT_FOUND` | No user with given `userId` or `socketId` |
| `404` | `ROOM_NOT_FOUND` | No active users in specified room |
| `500` | `DB_ERROR` | MongoDB query or connection error |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

All error responses follow the format:
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```
