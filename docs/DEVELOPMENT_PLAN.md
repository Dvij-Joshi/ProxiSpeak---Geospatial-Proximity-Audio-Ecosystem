# ProxiSpeak — Week-wise Development Plan

## Project: Geospatial Proximity Audio Ecosystem
**Duration:** 4 Weeks + Mid & Final Project Reviews  
**Stack:** Node.js · Express · Socket.io · MongoDB · React · WebRTC · Web Audio API · HTML5 Canvas

---

## Overview

| Phase | Backend Goal | Frontend Goal |
|---|---|---|
| Week 1 | Signaling & Movement | World Rendering |
| Week 2 | Proximity Calculations | WebRTC Integration |
| Mid-Review | Spatial Audit | Audio Check |
| Week 3 | Mesh Scaling | Dynamic Attenuation |
| Week 4 | Room Persistence | Refine & Polish |
| Final Review | Scalable Geospatial Server | Immersive Audio Platform |

---

## Week 1 — Foundation

### 🖥️ Backend: Signaling & Movement

**Goal:** Build a WebSocket server that broadcasts avatar X/Y coordinates and set up basic MongoDB geospatial schemas.

#### Tasks
- [ ] Initialize Node.js + Express project with `package.json`
- [ ] Connect to MongoDB with Mongoose
- [ ] Create `User` model with **GeoJSON Point** schema and `2dsphere` index
- [ ] Set up Socket.io server
- [ ] Implement `join-room` event — registers user + stores initial position
- [ ] Implement `move` event — updates position in MongoDB + broadcasts `user-moved` to room
- [ ] Implement `disconnect` event — removes user from DB + notifies room
- [ ] Basic REST `GET /health` endpoint

#### Deliverables
- Working WebSocket server that two browser tabs can connect to
- Avatar position stored and updated in MongoDB on every move event
- Verified with MongoDB Compass: coordinates update in real-time

---

### 🎨 Frontend: World Rendering

**Goal:** Build the React Canvas layer and implement smooth keyboard/mouse avatar movement with coordinate broadcasting.

#### Tasks
- [ ] Initialize Vite + React project
- [ ] Create `<WorldCanvas>` component with HTML5 Canvas `requestAnimationFrame` loop
- [ ] Render a simple office background (grid + colored zones)
- [ ] Create `<Avatar>` component — colored circle + username label
- [ ] Implement keyboard movement: `WASD` / arrow keys change avatar position
- [ ] Implement mouse-click movement: avatar smoothly moves to click position
- [ ] Connect to Socket.io backend and emit `move` events (throttled to 50ms)
- [ ] Listen for `user-moved` events and render other users' avatars

#### Deliverables
- User can move their avatar smoothly around the 2D canvas
- Other users' avatars appear and update in real-time
- Canvas renders at a consistent 60 FPS

---

## Week 2 — Proximity & WebRTC

### 🖥️ Backend: Proximity Calculations

**Goal:** Implement MongoDB `$near` queries to group users. Logic to only send WebRTC offer/answers to users within a 100-pixel radius.

#### Tasks
- [x] Create `/api/proximity/:userId` endpoint using `$near` with `$maxDistance: 100`
- [x] After each `move` event, query nearby users in the same room
- [x] Emit `proximity-update` to the mover: `{ inEarshot: [...], leftEarshot: [...] }`
- [x] Track per-socket "earshot state" to detect entry/exit events
- [x] Only initiate WebRTC offers to newly-entered earshot users
- [x] Relay `webrtc-offer`, `webrtc-answer`, `ice-candidate` events between correct socket pairs

#### Deliverables
- `$near` query verified to return only users within 100-unit radius
- Server correctly detects when users enter/leave earshot
- WebRTC signaling events are correctly relayed between peers

---

### 🎨 Frontend: WebRTC Integration

**Goal:** Implement standard WebRTC peer-to-peer audio connections using the browser's `getUserMedia`.

#### Tasks
- [x] Create `webrtcManager.js` service
- [x] On page load: request microphone access with `getUserMedia({ audio: true })`
- [x] On `proximity-update.inEarshot`: create `RTCPeerConnection`, add local audio track, send offer
- [x] On `proximity-update.leftEarshot`: close `RTCPeerConnection` and remove audio
- [x] Handle `webrtc-offer` → create answer → `setLocalDescription` → emit `webrtc-answer`
- [x] Handle `webrtc-answer` → `setRemoteDescription`
- [x] Handle `ice-candidate` → `addIceCandidate`
- [x] Attach received remote audio streams to `<audio>` elements (muted for now)

#### Deliverables
- Two browser tabs can establish a live audio connection via the signaling server
- Audio flows when avatars are within 100 pixels; connection closes when they move apart

---

## Mid-Project Review

### ✅ Backend: Spatial Audit

**Goal:** Prove the backend accurately filters and clusters users based on geospatial coordinates **under 20ms**.

#### Audit Checklist
- [ ] Benchmark `$near` query response time with 10 / 25 / 50 simulated users using a load testing script
- [ ] Verify `2dsphere` index is being used (`explain()` query)
- [ ] Confirm no false positives (users outside 100px reported as nearby)
- [ ] Confirm no false negatives (users inside 100px missed)
- [ ] Document average query latency in `docs/DEVELOPMENT_PLAN.md`

#### Pass Criteria
- 95th percentile proximity query < **20ms** with 50 concurrent users

---

### 🎨 Frontend: Audio Check

**Goal:** Demonstrate two browsers successfully establishing a WebRTC audio connection via the signaling server.

#### Audit Checklist
- [x] Two browser instances connect to the same room
- [x] Moving avatars within 100px triggers WebRTC offer/answer
- [x] Live audio heard in second tab (microphone → peer)
- [x] Moving apart closes connection cleanly (no zombie peer connections)

#### Results (October 13, 2025)
Audio check passed. Both tabs connected to `main-office` room, exchanged offer/answer within ~1.1s, and live mic audio confirmed in second tab. Peer connection closed cleanly when avatars moved beyond 100px radius — no zombie RTCPeerConnection objects detected in Chrome DevTools memory snapshot.

---

## Week 3 — Scale & Spatial Audio

### 🖥️ Backend: Mesh Scaling

**Goal:** Optimize the WebRTC mesh network. Implement Redis Pub/Sub to allow scaling the Socket.io server across multiple Node.js instances.

#### Tasks
- [x] Install and configure `@socket.io/redis-adapter` and `redis` client with fallback
- [x] Optimize WebRTC mesh signaling throttles, W3C perfect negotiation, and targeted ICE restart
- [x] Implement Node.js `cluster` module to fork workers per CPU core (`server/cluster.js`)
- [x] Configure Socket.io Redis Pub/Sub adapter for transparent cross-instance event relay
- [x] Document scaling architecture and inherent mesh limits in `docs/DEVELOPMENT_PLAN.md`

#### Deliverables
- Two Node.js processes can share Socket.io state via Redis
- Load test with 50 simulated users shows no dropped events

---

### 🎨 Frontend: Dynamic Attenuation

**Goal:** Hook WebRTC audio tracks into the Web Audio API. Write algorithms to calculate volume drop-off based on pixel distance.

#### Tasks
- [x] Create `spatialAudio.js` service wrapping Web Audio API
- [x] For each peer stream: `MediaStreamSource → GainNode → PannerNode / StereoPannerNode → destination`
- [x] Implement distance-based logarithmic gain attenuation and stereo delta-X panning
- [x] Integrate raycasting wall occlusion, door state muffling, and room isolation
- [x] Verified: dynamic distance volume drop-off and spatial panning update in real-time on movement

#### Deliverables
- Audio volume dynamically changes as avatars move
- Stereo panning positions audio correctly in left/right ear

---

## Week 4 — Persistence & Polish

### 🖥️ Backend: Room Persistence

**Goal:** Save office layouts and furniture obstacles (which block sound) into MongoDB.

#### Tasks
- [ ] Create `Room` MongoDB schema: `{ roomId, layout: [{ type, x, y, w, h }] }`
- [ ] `POST /api/rooms` — create a new room layout
- [ ] `GET /api/rooms/:roomId` — fetch layout (sent to frontend on join)
- [ ] Implement basic **acoustic shadowing**: if a wall obstacle exists between two users, reduce gain by 50%
- [ ] Store default `main-office` layout in a seed script

#### Deliverables
- Room layouts persist across server restarts
- Furniture obstacles reduce audio gain between users

---

### 🎨 Frontend: Refine & Polish

**Goal:** Add 3D audio panning (stereo separation) and ensure Canvas animations render at a steady 60 FPS.

#### Tasks
- [ ] Implement delta-time smoothing in the `requestAnimationFrame` loop
- [ ] Add avatar movement interpolation (smooth position transitions, not teleporting)
- [ ] Fetch and render room layout (furniture) from backend on join
- [ ] Draw walls/obstacles as blocking rectangles on canvas
- [ ] Refine avatar visuals: avatar icon, name label, "speaking" indicator ring
- [ ] Add connection status HUD (users in room, microphone status, FPS counter)
- [ ] Performance audit: ensure no memory leaks from closed WebRTC connections

#### Deliverables
- Canvas renders at a stable 60 FPS with 10+ users
- Smooth avatar movement with no teleporting
- Furniture obstacles visible on the canvas map

---

## Final Project Review

### 🖥️ Backend Final State
A **highly scalable, stateful geospatial server** managing complex P2P routing logic:
- Redis-backed multi-instance Socket.io
- MongoDB geospatial clustering < 20ms
- Persistent room layouts with acoustic shadowing

### 🎨 Frontend Final State
An **immersive, physics-aware communication platform** demonstrating advanced browser audio manipulation:
- Smooth 60 FPS 2D virtual office
- Dynamic spatial audio (volume + stereo panning)
- Seamless WebRTC lifecycle management

---

## Success Metrics

| Metric | Target |
|---|---|
| Geospatial query latency (p95) | < 20ms |
| Canvas render rate | ≥ 60 FPS |
| Max concurrent users tested | ≥ 50 |
| WebRTC connection setup time | < 3 seconds |
| Audio cutoff accuracy | Within ±5 pixels of 100px threshold |
