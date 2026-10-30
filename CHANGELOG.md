# Changelog

All notable changes to **ProxiSpeak** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-10-30

### Added
- **100-Pixel Spatial Earshot Zone:** Calibrated intimate proximity zone ($\le 25\text{px}$ 100% gain, $25\text{px}–100\text{px}$ gradual power decay, $\ge 100\text{px}$ complete silence).
- **60 FPS Motion LERP Interpolation:** Remote peer avatars glide smoothly across the screen via linear interpolation ($\alpha = 0.20$), converting 20 Hz network packets into seamless 60 FPS motion.
- **Acoustic Wall Raycasting:** 2D line-segment intersection detects physical walls between avatars and applies $0.35^{\text{hits}}$ volume decay and a $450\text{Hz}$ low-pass filter to simulate sound absorption through barriers.
- **Interactive Soundproof Doors & Knock-to-Enter:** Enclosed rooms (Meeting Room, Manager's Office) isolate audio when closed; outside visitors knock and occupants can accept or decline entry.
- **Persistent Account Authentication:** Secure user registration and login using **bcrypt** password hashing (10 salt rounds), case-insensitive usernames, and 14-day signed JWT tokens.
- **Room Persistence:** Hosted custom workspaces persisted in MongoDB via `Room` model and `/api/rooms` REST endpoints.
- **Room Chat Sidebar:** Real-time text chat drawer scoped strictly to the current room.
- **Three Spatial Soundstages:** Corporate Office, Conference Auditorium (PA broadcast stage), and Rooftop Social Lounge.
- **Session Deduplication Engine:** Server-side socket eviction and client-side render filtering completely eliminate ghost duplicate avatars upon reconnecting.
- **Render Keepalive Worker:** Self-ping background interval queries `/api/health` every 2.5 minutes to prevent free-tier cloud sleep.
- **Metered STUN / TURN NAT Traversal:** Automated public IP discovery with fallback TURN relay for enterprise symmetric firewalls.

### Changed
- Replaced 420px legacy hearing radius with 100px earshot perimeter to prevent audio bleeding across room partitions.
- Transitioned MongoDB user location from spherical `2dsphere` to bounded planar 2D index (`min: 0, max: 2000`) for canvas coordinate compatibility.
- Upgraded UI/UX to a modern architectural dark/light theme, removing cheap emojis in favor of crisp SVG iconography.

---

## [0.3.0] — Week 3

### Added
- Web Audio API spatial processing graph (`AudioContext`, `GainNode`, `StereoPannerNode`, `BiquadFilterNode`).
- Dynamic stereo panning: channels balance left and right based on horizontal displacement ($\Delta x / 75$).
- Anti-spam event bucket throttler capping movement emissions at 45 packets/sec.
- Redis Pub/Sub adapter integration for multi-node horizontal scaling.

---

## [0.2.0] — Week 2

### Added
- WebRTC P2P mesh network using browser `getUserMedia` and `RTCPeerConnection`.
- Signaling relay broker for `webrtc-offer`, `webrtc-answer`, and `ice-candidate` events.
- Audio input device enumeration and live runtime microphone switching.
- MongoDB `$near` geospatial query endpoint (`/api/proximity/:userId`).

---

## [0.1.0] — Week 1

### Added
- Node.js + Express backend scaffold with Socket.IO real-time engine.
- MongoDB Atlas connection with Mongoose ODM.
- React 18 + Vite frontend with 2D HTML5 Canvas rendering loop.
- WASD and Arrow key avatar navigation with collision detection.
- Initial project documentation, architecture specifications, and API reference.
