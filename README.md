# 🎙️ ProxiSpeak — Geospatial Proximity Audio Ecosystem

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-black)](https://socket.io/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Mesh-orange)](https://webrtc.org/)

> **Remote collaboration reimagined** — an interactive 2D spatial workspace where peer-to-peer WebRTC audio naturally attenuates, pans, and occludes through physical walls and doors based on your avatar's real-time position.

---

## 🌐 Problem Statement

Traditional video conferencing platforms force teams into rigid, static "call rooms" where only one person can effectively speak at a time. They lack the spontaneous, spatial dynamics of a physical workspace—where you can naturally overhear nearby discussions, walk over to collaborate, step into private soundproof meeting rooms, or socialize in casual lounge areas.

---

## 💡 What is ProxiSpeak?

**ProxiSpeak** is a real-time, geospatially-aware audio communication platform. Users navigate an interactive **2D virtual world** rendered at **60 FPS** via HTML5 Canvas. As avatars approach one another:
- WebRTC audio dynamically **fades in and pans in 3D stereo** across a calibrated **100-pixel earshot zone**.
- **Acoustic raycasting** simulates physical wall sound absorption and door muffling.
- **Interactive soundproof rooms** provide private spaces with a structured **Knock-to-Enter** protocol.
- All spatial audio calculations execute **100% on the client edge** using the native Web Audio API, keeping server resource usage near zero.

---

## 🏗️ Architecture at a Glance

```
┌────────────────────────────────────────────────────────────────────────┐
│                             CLIENT (React 18)                          │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │   WorldCanvas    │  │   WebRTC Mesh    │  │  Spatial Audio Engine│  │
│  │ (60fps LERP 2D)  │  │  (RTCPeerConn.)  │  │  (Web Audio API DSP) │  │
│  └─────────┬────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│            │ coordinates        │ SDP & ICE candidates  │ gain, pan,   │
│            │ (20 Hz throttled)  │ signaling             │ low-pass filter
└────────────┼────────────────────┼───────────────────────┼──────────────┘
             │                    │                       │
             ▼                    ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CONTROL PLANE (Node.js + Express)                    │
│                                                                        │
│  - Socket.IO signaling broker & coordinate relay                       │
│  - JWT authentication & bcrypt salted credential verification          │
│  - Anti-spam throttled event routing & session deduplication           │
│  - Room chat relay & interactive door state coordination               │
│  * ZERO audio bytes touch or pass through this server                  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA TIER (MongoDB Atlas)                       │
│                                                                        │
│  - Accounts: usernameLower, email, bcrypt passwordHash, avatarColor    │
│  - Users: active presence, socketId, location: [x, y] (2d planar index)│
│  - Rooms: persistent hosted workspace definitions & themes             │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Technical Capabilities

| Feature | Implementation | Description |
|---|---|---|
| **P2P Audio Mesh** | WebRTC + Opus 48kHz | Direct browser-to-browser encrypted UDP streams (no central audio mixer) |
| **NAT Traversal** | Metered STUN / TURN | Automated STUN public IP discovery with fallback TURN relay for symmetric firewalls |
| **Spatial Attenuation** | Web Audio API `GainNode` | Natural power-curve volume decay across a calibrated **100-pixel earshot radius** |
| **3D Stereo Panning** | `StereoPannerNode` | Dynamic binaural left/right channel separation based on horizontal delta-X |
| **Acoustic Raycasting** | 2D Line-Segment Intersection | Raycasts line of sight through walls to apply $0.35^{\text{hits}}$ volume decay & $450\text{Hz}$ low-pass muffling |
| **Soundproof Doors** | Dynamic Arc Walls | Enclosed rooms provide private audio isolation; occupants manage knock requests |
| **60 FPS Motion LERP** | Canvas `requestAnimationFrame` | Linear interpolation smoothly converges 20 Hz network packets into continuous 60 FPS motion |
| **Authentication** | bcrypt + JWT | Case-insensitive accounts, salted password hashing (10 rounds), and Bearer tokens |
| **Room Chat Sidebar** | Socket.IO Room Broadcast | Integrated real-time text chat scoped strictly to the current room |
| **Ghost Deduplication** | Client & Server Purge | Multi-layer session cleanup eliminates stale duplicate avatars upon reconnecting |

---

## 🗂️ Project Structure

```
ProxiSpeak/
├── server/
│   ├── config/
│   │   └── db.js                 # MongoDB Atlas Mongoose connection & lifecycle
│   ├── controllers/
│   │   └── proximityController.js# Geospatial distance queries
│   ├── models/
│   │   ├── Account.js            # User credentials, bcrypt hash, usernameLower index
│   │   ├── User.js               # Active sessions, socketId, 2d planar indexed location
│   │   └── Room.js               # Persistent hosted workspace definitions
│   ├── routes/
│   │   └── proximity.js          # Proximity REST routes
│   ├── seeds/
│   │   └── officeLayout.js       # Default workspace room layouts & boundary seeds
│   └── index.js                  # Express API, Socket.IO signaling, rate limiting & keepalive
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── WorldCanvas.jsx   # 60fps Canvas engine, HUD dock, chat drawer, doors
│   │   │   ├── MeetingLobby.jsx  # Workspace browser, quick join, host meeting modal
│   │   │   └── AuthModal.jsx     # Architectural sign-in & registration studio
│   │   ├── services/
│   │   │   ├── spatialAudio.js   # Web Audio DSP pipeline, raycasting & acoustic rooms
│   │   │   └── webrtc.js         # Peer connection mesh, STUN/TURN ICE negotiation
│   │   ├── config.js             # Environment endpoints & tunnel URL fallbacks
│   │   ├── App.jsx               # Top-level state router & audio initialization
│   │   └── index.css             # Architectural styling system & Tailwind integration
│   ├── index.html                # Entry HTML & luxury typography definitions
│   └── vite.config.js            # Vite build pipeline & module optimization
│
├── docs/
│   ├── ARCHITECTURE.md           # In-depth system architecture & DSP mathematical models
│   ├── API.md                    # REST endpoints & Socket.IO event reference
│   ├── DEVELOPMENT_PLAN.md       # Week-wise plan & deliverable completion records
│   ├── ROADMAP.md                # Feature roadmap, scope boundaries & post-MVP goals
│   └── MID_REVIEW_NOTES.md       # Mid-review defense audits, benchmarks & test results
│
├── CHANGELOG.md                  # Version release history
├── CONTRIBUTING.md               # Team development guidelines & git workflows
├── LICENSE                       # MIT License
└── render.yaml                   # Production Render infrastructure blueprint
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: 18.0 or higher
- **MongoDB**: Local instance or MongoDB Atlas cluster connection string
- **Browser**: Modern Chromium, Firefox, or Safari with WebRTC & Web Audio support

### 1. Clone the Repository
```bash
git clone https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem.git
cd ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem
```

### 2. Configure Environment Variables
Create `.env` in the project root:
```env
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_secure_jwt_secret_key
CLIENT_URL=http://localhost:5173
METERED_DOMAIN=your_metered_app_name.metered.live
METERED_SECRET_KEY=your_metered_api_key
```

### 3. Start the Backend Server
```bash
npm install
npm run server
```

### 4. Start the Frontend Client
```bash
npm --prefix client install
npm run client
# Available locally at http://localhost:5173
```

---

## 📅 Development Roadmap & Status

| Milestone | Backend Deliverables | Frontend Deliverables | Status |
|---|---|---|:---:|
| **Week 1** | Signaling server, MongoDB schema, `move` and `join-room` events | 2D canvas world rendering, keyboard/mouse movement loop | ✅ Completed |
| **Week 2** | Geospatial queries, earshot detection, WebRTC signaling relay | `webrtc.js` peer connection management, microphone capture | ✅ Completed |
| **Mid-Review** | Sub-20ms spatial query benchmark, connection reliability audit | Dual-browser audio check, memory leak audits, zero-zombie connections | ✅ Completed |
| **Week 3** | Anti-spam throttling, Redis Pub/Sub adapter, room-scoped relay | `spatialAudio.js` Web Audio graph, 100px earshot, stereo delta-X panning | ✅ Completed |
| **Week 4** | `Room` and `Account` persistence, bcrypt hashing, door state broker | 60 FPS LERP smoothing, acoustic raycasting, soundproof doors, room chat | ✅ Completed |

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for branch management and pull request protocols.

---

## 📄 License

This project is licensed under the MIT License — see [LICENSE](./LICENSE) for details.
