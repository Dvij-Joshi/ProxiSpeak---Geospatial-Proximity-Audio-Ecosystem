# Changelog

All notable changes to **ProxiSpeak** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- JWT-based persistent user authentication
- Multiple virtual room support with distinct layouts
- Mobile touch controls for avatar movement
- Recording / replay of spatial audio sessions
- Admin dashboard for room management

---

## [0.4.0] — Week 4 (Planned)

### Added
- `Room` MongoDB schema for persistent office layouts
- `POST /api/rooms` and `GET /api/rooms/:roomId` endpoints
- Acoustic shadowing: walls reduce peer audio gain by 50%
- Room seed script for default `main-office` layout
- Avatar movement interpolation (smooth position transitions)
- Furniture/wall rendering on HTML5 Canvas
- Speaking indicator ring around active audio avatars
- Connection status HUD (user count, mic status, FPS counter)
- Delta-time smoothing in `requestAnimationFrame` loop

### Fixed
- Memory leaks from zombie RTCPeerConnection objects after disconnect
- Canvas flicker on rapid avatar movement

---

## [0.3.0] — Week 3 (Planned)

### Added
- Redis Pub/Sub adapter (`@socket.io/redis-adapter`) for multi-node Socket.io
- Node.js `cluster` module integration for multi-core utilization
- `audioMixer.js` — Web Audio API spatial mixing service
- Dynamic gain attenuation: `gain = 1 - (distance / 100)`
- Stereo panning: `pan = deltaX / 100` clamped to `[-1, 1]`
- Real-time audio updates on every `user-moved` event

### Changed
- Socket.io events now route through Redis for cross-process delivery

---

## [0.2.0] — Week 2 (Planned)

### Added
- MongoDB `$near` geospatial proximity query (`$maxDistance: 100`)
- `proximity-update` Socket.io event with `inEarshot` / `leftEarshot` arrays
- Per-socket earshot state tracking for entry/exit detection
- `webrtcManager.js` — manages RTCPeerConnection lifecycle
- `getUserMedia` microphone access on page load
- WebRTC offer/answer exchange triggered by earshot entry
- ICE candidate relay through signaling server
- Auto-close peer connections on earshot exit or user disconnect
- REST endpoint: `GET /api/proximity/:userId`

### Changed
- `move` event now triggers server-side proximity re-calculation

---

## [0.1.0] — Week 1 (Planned)

### Added
- Node.js + Express project scaffold
- MongoDB connection via Mongoose (`config/db.js`)
- `User` Mongoose model with GeoJSON Point + `2dsphere` index
- Socket.io server setup
- `join-room` event — registers user and stores initial position
- `move` event — updates MongoDB position + broadcasts `user-moved`
- `disconnect` event — removes user + notifies room
- `GET /health` REST endpoint
- Vite + React 18 frontend scaffold
- `<WorldCanvas>` component with 60 FPS `requestAnimationFrame` loop
- Office background rendering (grid tiles + colored zones)
- `<Avatar>` component with colored circle + name label
- Keyboard movement (WASD / arrow keys)
- Mouse-click movement with smooth interpolation
- Socket.io client integration — emit `move` throttled to 50ms
- Real-time other-user avatar rendering via `user-moved`

### Security
- `.env.example` template — no secrets committed to repository
- `.gitignore` excludes `node_modules`, `.env`, build artifacts

---

## [0.0.1] — Repository Initialization

### Added
- `README.md` with project overview, architecture diagram, and getting started guide
- `docs/ARCHITECTURE.md` — detailed 3-tier architecture documentation
- `docs/API.md` — full REST and Socket.io event API reference
- `docs/DEVELOPMENT_PLAN.md` — week-wise development tasks and success metrics
- `CONTRIBUTING.md` — contribution guidelines and commit conventions
- `CODE_OF_CONDUCT.md` — Contributor Covenant v2.1
- `CHANGELOG.md` — this file
- `LICENSE` — MIT License
- `.gitignore` — Node.js + React standard ignores
- `.env.example` — environment variable template

[Unreleased]: https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem/releases/tag/v0.0.1
