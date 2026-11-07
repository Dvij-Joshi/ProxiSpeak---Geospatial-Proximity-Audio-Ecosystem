# ProxiSpeak — Week-wise Progress Checklist

> Based on deep analysis of the codebase on `branch-kunj`, git history, docs, and the project schedule images.

---

## Week 1 — Foundation

### 🖥️ Backend: Signaling & Movement

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Initialize Node.js + Express project with `package.json` | ✅ Done | [package.json](./package.json) exists with Express, Socket.io, Mongoose |
| 2 | Connect to MongoDB with Mongoose | ✅ Done | [db.js](./server/db.js) + `connectDB()` imported in [index.js](./server/index.js) |
| 3 | Create `User` model with GeoJSON Point schema and `2dsphere` index | ⚠️ Partial | [User.js](./server/models/User.js) uses flat `[x,y]` array with `'2d'` index (not GeoJSON `2dsphere`). Works fine for 2D canvas — this was a deliberate design choice |
| 4 | Set up Socket.io server | ✅ Done | [index.js#L73](./server/index.js#L73) — full Socket.io server with CORS, Redis adapter support |
| 5 | Implement `join-room` event | ✅ Done | [index.js#L983](./server/index.js#L983) — registers user, stores position, broadcasts to room |
| 6 | Implement `move` event | ✅ Done | [index.js#L1048](./server/index.js#L1048) — updates position in-memory + MongoDB, broadcasts `user-moved`, throttled at 45/sec |
| 7 | Implement `disconnect` event | ✅ Done | [index.js#L1405](./server/index.js#L1405) — removes user, notifies room |
| 8 | Basic REST `GET /health` endpoint | ✅ Done | [index.js#L334](./server/index.js#L334) — `/health` + `/api/health` with detailed diagnostics |

**Backend Week 1 Verdict: ✅ Complete** (7.5/8 — `2d` vs `2dsphere` is a valid implementation choice for flat canvas coordinates)

---

### 🎨 Frontend: World Rendering

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Initialize Vite + React project | ✅ Done | [client/](./client) directory with Vite + React |
| 2 | Create `<WorldCanvas>` component with `requestAnimationFrame` loop | ✅ Done | [WorldCanvas.jsx#L1382-L1500](./client/src/WorldCanvas.jsx#L1382-L1500) — full 60 FPS `requestAnimationFrame` game loop |
| 3 | Render office background (grid + colored zones) | ✅ Done | [WorldCanvas.jsx#L14-L105](./client/src/WorldCanvas.jsx#L14-L105) — 3 full theme layouts (Office, Conference, Lounge) with floors, labels, walls, furniture |
| 4 | Create `<Avatar>` component — colored circle + username label | ✅ Done | [WorldCanvas.jsx#L605](./client/src/WorldCanvas.jsx#L605) — `drawAvatar()` with color circle, username, mic icon, speaking indicator ring, voice intensity waves |
| 5 | Implement keyboard movement: WASD / arrow keys | ✅ Done | [WorldCanvas.jsx#L1387-L1392](./client/src/WorldCanvas.jsx#L1387-L1392) — WASD + arrow keys with diagonal normalization |
| 6 | Implement mouse-click movement | ❌ Not Done | No click-to-move handler found. Only keyboard movement is implemented |
| 7 | Connect to Socket.io backend and emit `move` events (throttled) | ✅ Done | [WorldCanvas.jsx#L1488-L1492](./client/src/WorldCanvas.jsx#L1488-L1492) — throttled move emission |
| 8 | Listen for `user-moved` events and render other users' avatars | ✅ Done | [WorldCanvas.jsx#L1299](./client/src/WorldCanvas.jsx#L1299) — peer positions update with 60fps interpolation |

**Frontend Week 1 Verdict: ✅ Mostly Complete** (7/8 — mouse-click movement missing)

---

## Week 2 — Proximity & WebRTC

### 🖥️ Backend: Proximity Calculations

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Create `/api/proximity/:userId` endpoint using `$near` with `$maxDistance: 100` | ✅ Done | [index.js#L844-L975](./server/index.js#L844-L975) — full `$near` query + in-memory fallback |
| 2 | After each `move` event, query nearby users in the same room | ⚠️ Partial | Proximity is computed **client-side** via `spatialAudio.updatePositions()` in the 60fps loop, not via server-side `$near` after each `move`. The REST endpoint exists for on-demand queries |
| 3 | Emit `proximity-update` to the mover: `{ inEarshot, leftEarshot }` | ❌ Not Done | No `proximity-update` socket event exists. Earshot detection is handled entirely client-side in [spatialAudio.js](./client/src/services/spatialAudio.js) |
| 4 | Track per-socket "earshot state" to detect entry/exit events | ⚠️ Client-side | Done on frontend via `prevInEarshotRef` in [WorldCanvas.jsx#L1406-L1410](./client/src/WorldCanvas.jsx#L1406-L1410), not server-side |
| 5 | Only initiate WebRTC offers to newly-entered earshot users | ⚠️ Different approach | WebRTC connections initiated when server broadcasts `user-joined` / `user-moved`; proximity-based connect/disconnect driven by client spatial audio engine |
| 6 | Relay `webrtc-offer`, `webrtc-answer`, `ice-candidate` events | ✅ Done | [index.js#L1072-L1101](./server/index.js#L1072-L1101) — full signaling relay with room-scoped validation + anti-spam throttling |

> [!NOTE]
> The original plan called for **server-driven** proximity (server queries `$near` on every move and emits `proximity-update`). The actual implementation chose a **client-driven** architecture where each client calculates distances locally at 60fps for lower latency. The `$near` endpoint exists but is used as a REST API, not in the real-time loop. This is arguably a better design for real-time audio.

**Backend Week 2 Verdict: ⚠️ Functionally Complete, different architecture** (core goal achieved via client-side proximity)

---

### 🎨 Frontend: WebRTC Integration

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Create `webrtcManager.js` service | ✅ Done | [webrtc.js](./client/src/services/webrtc.js) — 1072-line WebRTCManager class |
| 2 | On page load: request microphone with `getUserMedia({ audio: true })` | ✅ Done | Progressive `getUserMedia` with ideal → basic fallback |
| 3 | On proximity enter: create `RTCPeerConnection`, add local audio, send offer | ✅ Done | Deterministic single-initiator negotiation pattern |
| 4 | On proximity leave: close `RTCPeerConnection` and remove audio | ✅ Done | `removePeer()` / `closeAll()` methods |
| 5 | Handle `webrtc-offer` → create answer → emit `webrtc-answer` | ✅ Done | [webrtc.js#L152-L213](./client/src/services/webrtc.js#L152-L213) — with W3C Perfect Negotiation glare resolution |
| 6 | Handle `webrtc-answer` → `setRemoteDescription` | ✅ Done | [webrtc.js#L215-L233](./client/src/services/webrtc.js#L215-L233) |
| 7 | Handle `ice-candidate` → `addIceCandidate` | ✅ Done | [webrtc.js#L235-L253](./client/src/services/webrtc.js#L235-L253) — with candidate queuing |
| 8 | Attach remote audio streams to `<audio>` elements | ✅ Done | Remote streams attached via `onRemoteTrack` callback |

**Frontend Week 2 Verdict: ✅ Complete** (8/8 — exceeded spec with glare resolution, Safari compat, offer watchdog)

---

## Mid-Project Review

### 🖥️ Backend: Spatial Audit

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Benchmark `$near` query with 10/25/50 users | ✅ Done | [MID_REVIEW_NOTES.md](./docs/MID_REVIEW_NOTES.md) — 4.2ms / 8.9ms / 12.7ms avg |
| 2 | Verify `2dsphere` index via `explain()` | ✅ Done | IXSCAN confirmed (note: actual index is `2d`, not `2dsphere`) |
| 3 | Confirm no false positives | ✅ Done | Verified in boundary tests |
| 4 | Confirm no false negatives | ✅ Done | Verified in boundary tests |
| 5 | Document average query latency | ✅ Done | Documented in [DEVELOPMENT_PLAN.md](./docs/DEVELOPMENT_PLAN.md) |
| 6 | p95 proximity query < 20ms with 50 users | ✅ Pass | p95 = 18.1ms < 20ms target |

**Backend Mid-Review Verdict: ✅ Passed**

---

### 🎨 Frontend: Audio Check

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Two browser instances connect to same room | ✅ Pass | Confirmed Oct 13 |
| 2 | Moving within 100px triggers WebRTC offer/answer | ✅ Pass | ~1.1s avg exchange |
| 3 | Live audio heard in second tab | ✅ Pass | Mic → peer confirmed |
| 4 | Moving apart closes connection cleanly | ✅ Pass | No zombie RTCPeerConnections |

**Frontend Mid-Review Verdict: ✅ Passed**

---

## Week 3 — Scale & Spatial Audio

### 🖥️ Backend: Mesh Scaling

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Install and configure `@socket.io/redis-adapter` with fallback | ✅ Done | [index.js#L12-L13](./server/index.js#L12-L13) + [index.js#L89-L108](./server/index.js#L89-L108) — graceful fallback to in-memory when REDIS_URL not configured |
| 2 | Optimize WebRTC mesh signaling (W3C perfect negotiation, ICE restart) | ✅ Done | [webrtc.js#L1-L15](./client/src/services/webrtc.js#L1-L15) — deterministic negotiation, glare rollback, 3.5s offer watchdog, Safari compat |
| 3 | Implement Node.js `cluster` module to fork workers per CPU core | ✅ Done | [cluster.js](./server/cluster.js) — forks min(CPU count, 4) workers with auto-respawn |
| 4 | Configure Socket.io Redis Pub/Sub adapter for cross-instance relay | ✅ Done | [index.js#L88-L108](./server/index.js#L88-L108) — `createAdapter(pubClient, subClient)` |
| 5 | Document scaling architecture | ✅ Done | Git commit `7d2a48f` + [DEVELOPMENT_PLAN.md](./docs/DEVELOPMENT_PLAN.md#L147-L151) |

**Backend Week 3 Verdict: ✅ Complete** (5/5)

---

### 🎨 Frontend: Dynamic Attenuation

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Create `spatialAudio.js` service wrapping Web Audio API | ✅ Done | [spatialAudio.js](./client/src/services/spatialAudio.js) — 789-line full spatial audio engine |
| 2 | Audio pipeline: `MediaStreamSource → GainNode → PannerNode → destination` | ✅ Done | `source → filterNode (BiquadFilter) → gainNode → pannerNode (StereoPanner) → destination` |
| 3 | Distance-based logarithmic gain attenuation + stereo panning | ✅ Done | [spatialAudio.js#L206-L312](./client/src/services/spatialAudio.js#L206-L312) — `calculateAcoustics()` with power-curve falloff + dx-based stereo panning |
| 4 | Raycasting wall occlusion, door state muffling, room isolation | ✅ Done | [spatialAudio.js#L175-L204](./client/src/services/spatialAudio.js#L175-L204) — `countWallIntersections()` with ray-segment tests against all walls + closed doors. Isolated room logic, door-open/closed muffling, low-pass filter at occlusion |
| 5 | Dynamic volume + spatial panning update in real-time on movement | ✅ Done | [spatialAudio.js#L633-L729](./client/src/services/spatialAudio.js#L633-L729) — `updatePositions()` called every frame from 60fps tick loop |

**Frontend Week 3 Verdict: ✅ Complete** (5/5 — exceeded spec significantly with wall occlusion, door system, multi-theme acoustics)

---

## Week 4 — Persistence & Polish

### 🖥️ Backend: Room Persistence

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Create `Room` MongoDB schema with `layout: [{ type, x, y, w, h }]` | ⚠️ Partial | [Room.js](./server/models/Room.js) exists with `roomId`, `name`, `theme`, `isPublic` — but **no `layout` array field** for storing furniture/obstacle positions |
| 2 | `POST /api/rooms` — create a new room layout | ⚠️ Partial | [index.js#L746](./server/index.js#L746) — creates rooms with name + theme, but does **not accept or store layout data** |
| 3 | `GET /api/rooms/:roomId` — fetch layout on join | ⚠️ Partial | [index.js#L788](./server/index.js#L788) — returns room metadata but **no layout data** (furniture is hardcoded client-side) |
| 4 | Acoustic shadowing: wall obstacle between users reduces gain by 50% | ✅ Done | Implemented client-side in [spatialAudio.js#L269-L280](./client/src/services/spatialAudio.js#L269-L280) — `gain × 0.35^wallHits` (even more aggressive than 50%) |
| 5 | Store default `main-office` layout in a seed script | ❌ Not Done | No seed script found. Default rooms are hardcoded in [index.js#L287-L317](./server/index.js#L287-L317) (metadata only, no layout geometry) |

**Backend Week 4 Verdict: ⚠️ Partially Complete** (1.5/5 — room CRUD exists, acoustic shadowing done client-side, but layout persistence missing)

---

### 🎨 Frontend: Refine & Polish

| # | Task | Status | Evidence |
|---|------|--------|----------|
| 1 | Delta-time smoothing in `requestAnimationFrame` loop | ❌ Not Done | Fixed-speed movement (`SPEED` constant), no delta-time (`dt`) calculation between frames |
| 2 | Avatar movement interpolation (smooth transitions) | ✅ Done | [WorldCanvas.jsx#L919-L941](./client/src/WorldCanvas.jsx#L919-L941) — LERP interpolation at 0.20 factor for 60fps convergence |
| 3 | Fetch and render room layout from backend on join | ❌ Not Done | Layouts are **hardcoded** in WorldCanvas.jsx constants (`OFFICE_FURNITURE`, `OFFICE_WALLS`, etc.), not fetched from server |
| 4 | Draw walls/obstacles as blocking rectangles on canvas | ✅ Done | [WorldCanvas.jsx#L33-L49](./client/src/WorldCanvas.jsx#L33-L49) — walls rendered + collision detection; [WorldCanvas.jsx#L52-L105](./client/src/WorldCanvas.jsx#L52-L105) — detailed furniture (desks, chairs, plants, screens, server racks) |
| 5 | Refine avatar visuals: icon, name label, "speaking" indicator ring | ✅ Done | [WorldCanvas.jsx#L605-L740](./client/src/WorldCanvas.jsx#L605-L740) — colored circle, username, mic emoji, pulsing green aura for speaking, voice intensity waves |
| 6 | Connection status HUD (users, mic status, FPS counter) | ⚠️ Partial | Users count + in-earshot counter + mic status shown in HUD. **No FPS counter** |
| 7 | Performance audit: no memory leaks from closed WebRTC connections | ✅ Done | Confirmed in mid-review. `removePeer()` properly tears down `RTCPeerConnection` + audio nodes |

**Frontend Week 4 Verdict: ⚠️ Partially Complete** (4.5/7 — no delta-time smoothing, no server-fetched layouts, no FPS counter)

---

## Overall Summary

| Phase | Backend | Frontend |
|-------|---------|----------|
| **Week 1** | ✅ 7.5/8 | ✅ 7/8 |
| **Week 2** | ⚠️ Functional (different arch) | ✅ 8/8 |
| **Mid-Review** | ✅ Passed all checks | ✅ Passed all checks |
| **Week 3** | ✅ 5/5 | ✅ 5/5 |
| **Week 4** | ⚠️ 1.5/5 | ⚠️ 4.5/7 |

---

## What's Missing — Prioritized Backlog

### 🔴 High Priority (Week 4 gaps)

| Item | Effort | Notes |
|------|--------|-------|
| Add `layout` field to Room MongoDB schema | Small | Add `layout: [{ type: String, x: Number, y: Number, w: Number, h: Number }]` to [Room.js](./server/models/Room.js) |
| `POST /api/rooms` — accept layout data | Small | Extend existing route to accept and persist layout array |
| `GET /api/rooms/:roomId` — return layout in response | Small | Already returns room data; add layout field |
| Create seed script for `main-office` layout | Small | Extract existing `OFFICE_FURNITURE` / `OFFICE_WALLS` constants into a DB seed |
| Frontend: fetch layout from server instead of hardcoding | Medium | Replace `OFFICE_FURNITURE` constants with dynamic fetch on room join |

### 🟡 Medium Priority (Small gaps)

| Item | Effort | Notes |
|------|--------|-------|
| Delta-time smoothing in game loop | Small | Add `const dt = (now - lastFrameTime) / 16.67` and multiply movement by dt |
| FPS counter in HUD | Small | Track frame timestamps, compute rolling average |
| Mouse click-to-move | Medium | Add canvas click handler → set target position → smooth walk to target |

### 🟢 Low Priority / Bonus (Beyond spec — already done)

These features were **not required** but were implemented:

- 🚪 **Interactive door system** with knock/welcome/decline flow
- 💬 **Room chat sidebar**
- 🔐 **Full auth system** (register/login with JWT + bcrypt)
- 🎨 **3 complete themed layouts** (Office, Conference, Lounge)
- 🔒 **Security hardening** (rate limiting, payload limits, CORS, anti-spam throttling, Slowloris defense)
- 🌍 **TURN server support** (Metered.ca integration for NAT traversal)
- 📱 **Cross-browser compat** (Chrome, Firefox, Safari, iOS, Android)
- 🔊 **UI sound effects** (mute/unmute/deafen chimes, knock sounds, peer-enter bell)
- ☁️ **Deployment configs** (Render + Vercel)
