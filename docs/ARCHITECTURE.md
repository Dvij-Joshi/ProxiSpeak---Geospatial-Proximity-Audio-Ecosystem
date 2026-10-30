# ProxiSpeak — System Architecture

## Table of Contents
1. [High-Level Overview](#high-level-overview)
2. [Technology Stack](#technology-stack)
3. [Component Deep-Dive](#component-deep-dive)
   - [3D Spatial Audio & Acoustic Raycasting Engine](#1-3d-spatial-audio--acoustic-raycasting-engine)
   - [2D Virtual World & 60 FPS Movement Engine](#2-2d-virtual-world--60-fps-movement-engine)
   - [Signaling Server & Real-Time Control Plane](#3-signaling-server--real-time-control-plane)
   - [Geospatial Engine](#4-geospatial-engine)
   - [Authentication & Database Security](#5-authentication--database-security)
4. [End-to-End Data Flow](#end-to-end-data-flow)
5. [Database Design](#database-design)
6. [WebRTC Signaling & NAT Traversal Topology](#webrtc-signaling--nat-traversal-topology)
7. [Scalability & Production Infrastructure](#scalability--production-infrastructure)

---

## High-Level Overview

ProxiSpeak implements a **decoupled hybrid architecture**: a centralized WebSocket/REST control plane paired with a decentralized peer-to-peer (P2P) WebRTC audio media plane:

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION TIER                        │
│             React 18 + HTML5 Canvas + Web Audio API DSP         │
└───────────────────────────────┬─────────────────────────────────┘
                                │ WebSocket (Socket.IO) + HTTP REST
┌───────────────────────────────▼─────────────────────────────────┐
│                    CONTROL PLANE (Application Tier)             │
│        Node.js + Express + Socket.IO + Rate Limiters + JWT      │
└───────────────────────────────┬─────────────────────────────────┘
                                │ Mongoose ODM
┌───────────────────────────────▼─────────────────────────────────┐
│                            DATA TIER                            │
│           MongoDB Atlas (Planar 2D Index + Bounded Limits)      │
└─────────────────────────────────────────────────────────────────┘
```

* **Control Plane:** The central Node.js server coordinates authentication, relays 2D avatar coordinates (at 20 Hz), brokers WebRTC SDP offer/answer handshakes and ICE candidates, and manages room text chat. **Zero audio packets pass through or touch this server.**
* **Media Plane:** Audio streams flow directly browser-to-browser via WebRTC using SRTP and 48 kHz Opus.
* **DSP Processing:** Distance attenuation, 3D stereo panning, acoustic wall occlusion, and soundproof door isolation run entirely on the client edge using the browser's native Web Audio API.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | React 18 | Declarative component hierarchy and state management |
| **Canvas Rendering** | HTML5 Canvas 2D API | High-performance 60 FPS workspace rendering |
| **Spatial Audio DSP** | Web Audio API | `AudioContext`, `GainNode`, `BiquadFilterNode`, `StereoPannerNode` |
| **Peer-to-Peer Media** | WebRTC (`RTCPeerConnection`) | Direct encrypted browser-to-browser voice streaming (48 kHz Opus) |
| **NAT Traversal** | Metered STUN / TURN | STUN public IP discovery with fallback TURN relay for symmetric firewalls |
| **Backend Server** | Node.js 18 + Express 4 | REST endpoints, security headers, rate limiting, and static serving |
| **Realtime Messaging** | Socket.IO 4 | WebSocket coordinate broadcasts, room chat, and signaling exchange |
| **Database** | MongoDB Atlas + Mongoose | Planar 2D geospatial presence, user accounts, and room persistence |
| **Security & Auth** | bcrypt (10 rounds) + JWT | Salted password hashing, case-insensitive usernames, and Bearer tokens |
| **Build & Tooling** | Vite 5 | Module bundling, tree-shaking, and hot module replacement |

---

## Component Deep-Dive

### 1. 3D Spatial Audio & Acoustic Raycasting Engine

**Source:** [`client/src/services/spatialAudio.js`](file:///e:/portfolio-projects/ProxiSpeak/client/src/services/spatialAudio.js)

The spatial audio engine constructs a real-time Web Audio DSP graph for each connected peer:

```
MediaStreamSourceNode
        │
        ▼
    GainNode             <-- Euclidean distance volume attenuation (0.0 to 1.0)
        │
        ▼
BiquadFilterNode         <-- Low-pass filter (300 Hz to 20,000 Hz) for wall muffling
        │
        ▼
StereoPannerNode         <-- Dynamic horizontal binaural panning (-1.0 to +1.0)
        │
        ▼
AudioContext.destination <-- Physical audio output (headphones/speakers)
```

#### A. Euclidean Distance Attenuation
Avatar separation is computed via 2D Euclidean distance:
$$d = \sqrt{(x_{\text{peer}} - x_{\text{local}})^2 + (y_{\text{peer}} - y_{\text{local}})^2}$$

The engine enforces a **100-pixel earshot perimeter** (`MAX_DISTANCE = 100`, `MIN_DISTANCE = 25`):
* **Intimate Proximity ($d \le 25\text{ px}$):** Full volume ($\text{Gain} = 1.0$).
* **Acoustic Falloff ($25 < d < 100\text{ px}$):** Gradual power curve decay:
  $$\text{Gain} = \left(1 - \frac{d - 25}{75}\right)^{0.75}$$
* **Beyond Earshot ($d \ge 100\text{ px}$):** $\text{Gain} = 0.0$ (complete silence).

Parameter changes are ramped smoothly using `setTargetAtTime(targetGain, audioCtx.currentTime, 0.03)` to eliminate audio pops and clipping.

#### B. Dynamic Stereo Panning
Binaural left/right channel balance is calculated from horizontal displacement:
$$\text{pan} = \max\left(-1.0, \min\left(1.0, \frac{x_{\text{peer}} - x_{\text{local}}}{75}\right)\right)$$
* $\text{pan} = -1.0$: Peer is 75px to your left (100% in left channel).
* $\text{pan} = 0.0$: Peer is directly aligned vertically.
* $\text{pan} = +1.0$: Peer is 75px to your right (100% in right channel).

#### C. Acoustic Wall Raycasting
To simulate physical sound barrier absorption, the engine performs 2D line-segment intersection raycasting between the local user $(x_1, y_1)$ and remote peer $(x_2, y_2)$ against all map wall segments:
$$\text{Denominator} = (x_1 - x_2)(y_3 - y_4) - (y_1 - y_2)(x_3 - x_4)$$

When an intersection occurs:
* **Gain Attenuation:** Volume is scaled by $0.35^{\text{wallHits}}$. One wall reduces volume to 35%; two walls reduce volume to $\approx 12\%$.
* **Low-Pass Filtering:** The `BiquadFilterNode` frequency drops from $20,000\text{ Hz}$ down to $450\text{ Hz}$, cutting off crisp consonants and simulating sound muffled through drywall or glass.

#### D. Interactive Soundproof Doors & Knock-to-Enter
Enclosed rooms (Meeting Room, Manager's Office) feature interactive door boundaries:
* **Door Closed:** Acts as a soundproof barrier (`targetGain = 0.0`, filter frequency = $300\text{ Hz}$).
* **Door Open:** The doorway opens acoustically up to `doorwayMaxD = 100px` with a $2,200\text{ Hz}$ filter frequency, allowing voices to spill into the hallway.
* **Knock Protocol:** Outside users cannot enter occupied rooms without knocking. Occupants receive an alert with visitor details and decide whether to welcome them in or decline entry.

---

### 2. 2D Virtual World & 60 FPS Movement Engine

**Source:** [`client/src/WorldCanvas.jsx`](file:///e:/portfolio-projects/ProxiSpeak/client/src/WorldCanvas.jsx)

The virtual world runs an HTML5 Canvas render loop using `requestAnimationFrame(tick)`.

#### A. 60 FPS Linear Interpolation (LERP)
While local input updates at 60 FPS, network movement packets are throttled to 20 Hz (every 50ms) to conserve client bandwidth. To eliminate stutter, remote avatar coordinates are interpolated smoothly each animation frame using a convergence factor of $\alpha = 0.20$:
$$\text{renderX} \leftarrow \text{renderX} + (\text{targetX} - \text{renderX}) \times 0.20$$
$$\text{renderY} \leftarrow \text{renderY} + (\text{targetY} - \text{renderY}) \times 0.20$$

#### B. AABB Collision Engine
Avatars are modeled with radius $R = 14\text{ px}$. Movement vectors are verified against room perimeter walls, interior partitions, and closed doors. Diagonal movement coordinates are normalized by $\frac{1}{\sqrt{2}} \approx 0.7071$ to maintain uniform walking velocity in all directions.

#### C. Multi-Theme Soundstages
The engine renders 3 pre-configured spatial workspaces:
1. **Corporate Office:** Team clusters, executive suites, conference rooms, break lounge.
2. **Conference Auditorium:** Keynote stage with broad PA acoustics and tiered attendee rows.
3. **Rooftop Social Lounge:** Espresso bar, fireside seating, and outdoor terrace.

---

### 3. Signaling Server & Real-Time Control Plane

**Source:** [`server/index.js`](file:///e:/portfolio-projects/ProxiSpeak/server/index.js)

The Socket.IO signaling layer manages WebSocket connections and dispatches events strictly scoped to rooms:

| Event | Direction | Payload | Description |
|---|---|---|---|
| `join-room` | Client → Server | `{ username, avatarColor, roomId, isMuted }` | Registers user presence and returns initial room state |
| `room-state` | Server → Client | `{ selfId, users, doors }` | Full snapshot of active peers and door states in the room |
| `move` | Client → Server | `{ x, y, roomId }` | Emitted by client (throttled to 20 Hz / 50ms) |
| `user-moved` | Server → Client | `{ id, x, y }` | Broadcast to all room peers to update interpolation targets |
| `webrtc-offer` | Bidirectional | `{ to, offer }` | Relays SDP offer to target peer |
| `webrtc-answer` | Bidirectional | `{ to, answer }` | Relays SDP answer to initiating peer |
| `ice-candidate` | Bidirectional | `{ to, candidate }` | Relays ICE candidate for NAT connectivity checks |
| `room:chat:message` | Bidirectional | `{ roomId, sender, message, ... }` | Relays in-room text chat |
| `toggle-door` | Client → Server | `{ roomId, doorKey, isOpen }` | Toggles room door state (with access validation) |
| `user-left` | Server → Client | `{ id }` | Dispatched on disconnect or room exit |

**Anti-Spam Throttling:** Every incoming socket event passes through an in-memory bucket rate limiter (`checkThrottle`), discarding malicious or malformed bursts beyond 45 movement packets/sec.

---

### 4. Geospatial Engine

**Source:** [`server/models/User.js`](file:///e:/portfolio-projects/ProxiSpeak/server/models/User.js), [`server/controllers/proximityController.js`](file:///e:/portfolio-projects/ProxiSpeak/server/controllers/proximityController.js)

* **Coordinate Representation:** User positions are stored as planar 2D coordinates `location: [x, y]` representing pixel coordinates on the $1200 \times 680$ canvas.
* **Spatial Index:** MongoDB index `{ location: '2d' }` with bounds `{ min: 0, max: 2000 }` enables sub-20ms spatial queries (`$near`) without spherical geospatial conversion overhead.

---

### 5. Authentication & Database Security

**Source:** [`server/models/Account.js`](file:///e:/portfolio-projects/ProxiSpeak/server/models/Account.js), [`server/index.js`](file:///e:/portfolio-projects/ProxiSpeak/server/index.js)

* **Password Security:** Passwords are encrypted using **bcrypt** with 10 salt rounds (`bcrypt.genSalt(10)`). Raw passwords are never stored.
* **Case-Insensitive Identity:** Accounts store a normalized `usernameLower` field. Credential queries use case-insensitive matching, allowing users to sign in with any capitalization.
* **JWT Tokens:** Authenticated sessions issue signed JSON Web Tokens (14-day validity).
* **Ghost Avatar Deduplication:**
  * **Server-side:** On `join-room`, the server checks all active rooms for any existing socket sharing the same username. Stale sockets are immediately disconnected (`oldSocket.disconnect(true)`) and evicted.
  * **Client-side:** The client filter drops any peer entry matching the local username or local socket ID across all socket handlers and frame loops.

---

## End-to-End Data Flow

```
[User Presses WASD Keys]
           │
           ▼
[WorldCanvas 60fps Physics & Collision Engine]
           │
           ▼ (Throttled to 20 Hz / 50ms)
[Socket.IO emit('move', { x, y, roomId })]
           │
           ▼
[Node.js Server] ──► Updates volatile memory Map + MongoDB location [x, y]
           │
           ▼ (Broadcasts 'user-moved' to room peers)
[Remote Peer Client]
           │
           ▼ (60 FPS LERP Smoothing: targetX, targetY -> renderX, renderY)
[Canvas Avatar Drawn at Glide Coordinates]
           │
           ▼
[Web Audio API DSP Graph Updated]
           ├── GainNode: Volume updated via Euclidean distance formula
           ├── StereoPannerNode: Panned dynamically based on delta-X
           └── BiquadFilterNode: Frequency tuned based on wall raycasting
```

---

## Database Design

### 1. `Account` Collection ([`server/models/Account.js`](file:///e:/portfolio-projects/ProxiSpeak/server/models/Account.js))
Persists registered user credentials and profile settings:
```javascript
{
  _id: ObjectId,
  username: String,         // Display username (unique, trimmed)
  usernameLower: String,    // Lowercase normalized username (indexed, unique)
  email: String,            // Unique email (lowercase, indexed)
  passwordHash: String,     // bcrypt salted password hash (10 rounds)
  avatarColor: String,      // Chosen hex color (e.g. #3b82f6)
  createdAt: Date
}
```

### 2. `User` Collection ([`server/models/User.js`](file:///e:/portfolio-projects/ProxiSpeak/server/models/User.js))
Tracks active session presence and spatial telemetry:
```javascript
{
  _id: ObjectId,
  socketId: String,         // Active WebSocket connection ID (unique)
  username: String,         // Associated account username
  avatarColor: String,      // Color rendered on canvas
  roomId: String,           // Active room identifier
  x: Number,                // Canvas X pixel coordinate
  y: Number,                // Canvas Y pixel coordinate
  location: [Number],       // [x, y] planar 2D array
  lastSeen: Date            // Heartbeat timestamp for stale session reaping
}
```
* **Indexes:** `{ location: '2d' }` bounded to `[0, 2000]`, `{ roomId: 1, lastSeen: 1 }`.

### 3. `Room` Collection ([`server/models/Room.js`](file:///e:/portfolio-projects/ProxiSpeak/server/models/Room.js))
Persists formally hosted public and private meeting workspaces:
```javascript
{
  _id: ObjectId,
  roomId: String,           // Unique URL slug (e.g. "team-standup-a4f2")
  name: String,             // Friendly room title
  theme: String,            // "office" | "conference" | "lounge"
  createdBy: String,        // Creator username
  isPublic: Boolean,        // Visibility toggle
  createdAt: Date
}
```

---

## WebRTC Signaling & NAT Traversal Topology

```
Peer A (Local Browser)          Signaling Server (Node.js)          Peer B (Remote Browser)
       │                                     │                                     │
       │────── webrtc-offer (SDP) ──────────►│                                     │
       │                                     │────── webrtc-offer (SDP) ──────────►│
       │                                     │                                     │
       │                                     │◄───── webrtc-answer (SDP) ──────────│
       │◄───── webrtc-answer (SDP) ──────────│                                     │
       │                                     │                                     │
       │────── ice-candidate ───────────────►│                                     │
       │                                     │────── ice-candidate ───────────────►│
       │                                     │                                     │
       │◄══════════════ Direct P2P SRTP Audio Stream (80-85% STUN) ════════════════►│
       │                                                                           │
       └─── If strict symmetric NAT blocks direct UDP: ────────────────────────────┘
             Peer A ◄── Encrypted UDP ──► Metered TURN Relay ◄── Encrypted UDP ──► Peer B
```

* **STUN (Session Traversal Utilities for NAT):** Discovers each client's public reflexive IP and port for direct peer-to-peer UDP hole-punching (resolves 80–85% of connections).
* **TURN (Traversal Using Relays around NAT):** When direct P2P is blocked by enterprise firewalls or symmetric NATs, encrypted audio packets are relayed via Metered TURN servers without decoding or altering media.

---

## Scalability & Production Infrastructure

1. **Zero-Load Media Plane:** WebRTC audio packets flow directly between browsers. The backend server does not decode, mix, or transcode audio, allowing a standard Node.js instance to host dozens of concurrent voice rooms.
2. **Render Keep-Alive Engine:** A self-ping background worker (`setInterval(..., 2.5 * 60 * 1000)`) queries `/api/health` every 2.5 minutes, preventing free-tier cloud instances from entering idle sleep and ensuring instant response times.
3. **Multi-Core Redis Clustering:** Configured with `@socket.io/redis-adapter` and Node.js `cluster` module to scale WebSocket events horizontally across CPU cores.
