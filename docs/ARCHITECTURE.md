# ProxiSpeak — System Architecture

## Table of Contents
1. [High-Level Overview](#high-level-overview)
2. [Technology Stack](#technology-stack)
3. [Component Deep-Dive](#component-deep-dive)
   - [Geospatial Engine](#1-geospatial-engine)
   - [Signaling Server](#2-signaling-server)
   - [Spatial Audio Mixer](#3-spatial-audio-mixer)
   - [2D Virtual World](#4-2d-virtual-world)
4. [Data Flow](#data-flow)
5. [Database Design](#database-design)
6. [Scalability Strategy](#scalability-strategy)
7. [WebRTC Signaling Flow](#webrtc-signaling-flow)

---

## High-Level Overview

ProxiSpeak is a **three-tier** real-time application:

```
┌─────────────────────────────────────────────────────────────────┐
│                         PRESENTATION TIER                       │
│                  React + HTML5 Canvas + Web Audio API           │
└───────────────────────────────┬─────────────────────────────────┘
                                │ WebSocket (Socket.io) + HTTP REST
┌───────────────────────────────▼─────────────────────────────────┐
│                         APPLICATION TIER                        │
│              Node.js + Express + Socket.io + Redis              │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Mongoose ODM
┌───────────────────────────────▼─────────────────────────────────┐
│                           DATA TIER                             │
│              MongoDB (GeoJSON 2dsphere index)                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18 | Component-based UI |
| **Canvas** | HTML5 Canvas API | 2D virtual world rendering |
| **Audio** | Web Audio API | Spatial audio mixing & panning |
| **P2P Media** | WebRTC (RTCPeerConnection) | Direct browser-to-browser audio |
| **Backend** | Node.js 18 + Express 4 | REST API + HTTP server |
| **Realtime** | Socket.io 4 | WebSocket signaling & coordinate broadcast |
| **Database** | MongoDB 6 + Mongoose | Geospatial user state persistence |
| **Cache/Broker** | Redis (Pub/Sub) | Multi-node Socket.io coordination |
| **Build Tool** | Vite | Fast frontend bundling & HMR |

---

## Component Deep-Dive

### 1. Geospatial Engine

**Location:** `server/controllers/proximityController.js`, `server/models/User.js`

The geospatial engine stores each user's avatar position as a **GeoJSON Point** in MongoDB. When a user moves, the server:

1. Updates their position in MongoDB using `findOneAndUpdate`
2. Queries nearby users using `$near` with a `$maxDistance` of **100 pixels** (normalized to meters in schema)
3. Returns the list of users within "earshot"

```js
// MongoDB $near query — finds users within 100-unit radius
User.find({
  location: {
    $near: {
      $geometry: { type: "Point", coordinates: [x, y] },
      $maxDistance: 100
    }
  }
})
```

**Index:** A `2dsphere` index is created on `User.location` for O(log n) geospatial lookups.

---

### 2. Signaling Server

**Location:** `server/socket/signalingServer.js`

The signaling server is responsible for brokering **WebRTC handshakes** between peers. It does NOT handle audio — it only relays SDP offers/answers and ICE candidates.

**Events handled:**

| Event | Direction | Description |
|---|---|---|
| `move` | Client → Server | Broadcast new avatar coordinates |
| `proximity-update` | Server → Client | List of users now in earshot |
| `webrtc-offer` | Client → Server → Client | SDP offer relay |
| `webrtc-answer` | Client → Server → Client | SDP answer relay |
| `ice-candidate` | Client → Server → Client | ICE candidate relay |
| `user-left-earshot` | Server → Client | Signal to close peer connection |

---

### 3. Spatial Audio Mixer

**Location:** `client/src/services/audioMixer.js`

The audio mixer uses the **Web Audio API** to create a processing graph for each peer:

```
MediaStreamSource → GainNode → StereoPannerNode → AudioContext.destination
```

- **GainNode:** Volume = `1 - (distance / MAX_DISTANCE)`. At 0 pixels away → gain `1.0`. At 100 pixels → gain `0.0`.
- **StereoPannerNode:** Pan = `deltaX / MAX_DISTANCE` clamped to `[-1, 1]`. Negative = left ear, positive = right ear.

This creates a perceptual sense of **where** in space a colleague is standing.

---

### 4. 2D Virtual World

**Location:** `client/src/components/WorldCanvas.jsx`, `client/src/components/Avatar.jsx`

The virtual world is rendered on an HTML5 `<canvas>` element using a **requestAnimationFrame** render loop targeting **60 FPS**.

- Keyboard/mouse input updates avatar coordinates locally
- Coordinates are broadcast to the server via Socket.io every **50ms** (debounced)
- Other users' positions are received and interpolated for smooth movement
- The canvas renders: floor tiles, furniture obstacles, user avatars with name labels

---

## Data Flow

```
USER MOVES AVATAR
      │
      ▼
WorldCanvas captures keyboard/mouse input
      │
      ▼
Socket.emit("move", { x, y, userId })
      │
      ▼ (Socket.io)
signalingServer receives "move"
      │
      ├──► Updates MongoDB User.location (GeoJSON)
      │
      └──► Queries $near for users within 100px
              │
              ▼
      Emits "proximity-update" to mover with earshot list
              │
              ▼
      If NEW user enters earshot → initiate WebRTC offer
      If user LEAVES earshot → close RTCPeerConnection
              │
              ▼
      WebRTC P2P audio stream established
              │
              ▼
      audioMixer.setGainAndPan(peerId, distance, deltaX)
              │
              ▼
      USER HEARS SPATIAL AUDIO
```

---

## Database Design

### User Schema

```js
{
  _id: ObjectId,
  socketId: String,         // current socket session
  username: String,
  avatarColor: String,      // hex color for avatar
  location: {               // GeoJSON Point
    type: "Point",
    coordinates: [Number, Number]  // [x, y] in canvas units
  },
  roomId: String,           // virtual office room
  lastSeen: Date
}
```

**Indexes:**
- `location` → `2dsphere` (geospatial queries)
- `socketId` → unique (fast socket lookups)
- `roomId` → (filter queries by room)

---

## Scalability Strategy

For 50+ concurrent users, ProxiSpeak uses:

1. **Redis Pub/Sub** — Socket.io's `@socket.io/redis-adapter` allows multiple Node.js processes to share socket events. Users on different server instances can still receive each other's `move` events.

2. **Node.js Cluster** — `cluster` module forks one worker per CPU core, distributing connection load.

3. **MongoDB 2dsphere index** — Geospatial queries remain O(log n) regardless of user count.

4. **WebRTC Mesh (P2P)** — Audio streams flow directly between browsers (not through server), keeping server bandwidth near zero even with many active audio connections.

---

## WebRTC Signaling Flow

```
Peer A (Initiator)          Signaling Server           Peer B (Receiver)
      │                           │                           │
      │──── webrtc-offer ────────►│                           │
      │                           │──── webrtc-offer ────────►│
      │                           │                           │
      │                           │◄─── webrtc-answer ────────│
      │◄─── webrtc-answer ────────│                           │
      │                           │                           │
      │──── ice-candidate ───────►│──── ice-candidate ───────►│
      │◄─── ice-candidate ────────│◄─── ice-candidate ─────────│
      │                           │                           │
      │◄══════════════ P2P Audio Stream ══════════════════════│
      │                    (Direct, no server)                │
```
