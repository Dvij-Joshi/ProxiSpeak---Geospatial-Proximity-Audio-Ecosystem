# ProxiSpeak — Unified Project Context & Engineering Truth Source

> **MANDATORY SYSTEM RULE FOR ALL AGENTS AND CONTRIBUTORS:**  
> This file (`context.md`) is the single source of truth for the ProxiSpeak ecosystem.  
> **RULE:** After **EVERY SINGLE TASK, BUG FIX, REFACTOR, OR FEATURE ADDITION**, this file **MUST BE UPDATED** with the latest state, modified files, bug resolutions, architectural changes, and active commit hash.  
> The changes to this file must always be committed and merged into the **`main`** branch alongside the task commits so that any developer or AI assistant joining the project immediately has 100% accurate, up-to-date context.

---

## 1. Project Overview & Core Mission
* **Name:** ProxiSpeak — Geospatial Proximity Audio Ecosystem
* **Core Philosophy:** Break away from rigid, single-speaker video conference rooms (e.g. Zoom/Google Meet) by building an interactive 2D spatial workspace where natural human audio dynamics mirror physical office presence.
* **Core Mechanisms:**
  * Walk closer to someone: audio fades in smoothly and pans dynamically in 3D stereo.
  * Walk away: audio drops off smoothly to total silence beyond a **100px earshot perimeter**.
  * Physical barrier simulation: walls muffle sound using low-pass filtering and volume attenuation.
  * Privacy: meeting rooms have interactive soundproof doors with a **Knock-to-Enter** protocol.

---

## 2. Core Architecture: Decoupled Hybrid System

ProxiSpeak strictly separates the **Control Plane** from the **Media Plane**:

```
+──────────────────────────────────────────────────────────────────────────+
│                      CONTROL PLANE (Node.js + Express)                   │
│                                                                          │
│   Server (server/index.js)                                               │
│   - Authenticates accounts with bcrypt (10 rounds) & issues JWTs         │
│   - Coordinates room presence & relays 2D coordinates (20 Hz throttled)  │
│   - Dispatches WebRTC signaling (SDP offer/answer, ICE candidates)       │
│   - Relays room chat & door access/knock events                          │
│   - Enforces anti-spam throttling & session deduplication                │
│   * ZERO audio bytes ever touch or pass through this server!             │
+──────────────────────────────────────────────────────────────────────────+
                                     │
                 Signaling & Movement Only (Socket.IO / REST)
                                     ▼
+──────────────────────────────────────────────────────────────────────────+
│                     MEDIA PLANE (100% Peer-to-Peer Mesh)                 │
│                                                                          │
│         Peer A (Browser) ◄═════ Encrypted SRTP Audio ═════► Peer B       │
│                ▲                                                   ▲     │
│                ║                                                   ║     │
│                ╚══════════════ Peer C (Browser) ═══════════════════╝     │
│                                                                          │
│   - WebRTC Full-Mesh topology using Opus 48 kHz stereo audio             │
│   - No central audio mixer, media gateway, MCU, or SFU server            │
│   - Metered STUN: Public IP discovery for direct P2P (80–85% of cases)   │
│   - Metered TURN: Encrypted UDP relay only when strict NAT blocks P2P    │
│     (Metered does NOT decode, mix, or spatialize audio packets)          │
+──────────────────────────────────────────────────────────────────────────+
                                     │
                        Decoded Audio Stream (Client)
                                     ▼
+──────────────────────────────────────────────────────────────────────────+
│                CLIENT-SIDE DSP ENGINE (Web Audio API)                    │
│                                                                          │
│   - Distance attenuation, 3D panning, and wall muffling execute 100%     │
│     on each user's device via client/src/services/spatialAudio.js        │
+──────────────────────────────────────────────────────────────────────────+
```

---

## 3. Mathematical Models & Audio DSP Pipeline

**Source:** [`client/src/services/spatialAudio.js`](file:///e:/portfolio-projects/ProxiSpeak/client/src/services/spatialAudio.js)

### Audio Node Chain (Per Remote Peer)
```
[WebRTC Stream] ──► [MediaStreamSourceNode]
                           │
                           ▼
                      [GainNode]          <-- Distance volume attenuation
                           │
                           ▼
                  [BiquadFilterNode]      <-- Low-pass filter (walls & doors)
                           │
                           ▼
                  [StereoPannerNode]      <-- Dynamic horizontal panning
                           │
                           ▼
                [AudioContext.destination] <-- Headphones / Speakers
```

### Mathematical Formulations
1. **Euclidean Distance:**
   $$d = \sqrt{(x_{\text{peer}} - x_{\text{local}})^2 + (y_{\text{peer}} - y_{\text{local}})^2}$$
2. **100px Earshot Volume Falloff:**
   * Intimate zone ($d \le 25\text{ px}$): $\text{Gain} = 1.0$ (100% volume)
   * Gradual decay ($25 < d < 100\text{ px}$):
     $$\text{Gain} = \left(1 - \frac{d - 25}{75}\right)^{0.75}$$
   * Beyond earshot ($d \ge 100\text{ px}$): $\text{Gain} = 0.0$ (complete silence)
   * Smoothing: `gainNode.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.03)` prevents pops/clicks.
3. **Dynamic Stereo Panning:**
   $$\text{pan} = \max\left(-1.0, \min\left(1.0, \frac{x_{\text{peer}} - x_{\text{local}}}{75}\right)\right)$$
   * Peer 75px to your left $\rightarrow -1.0$ (100% left ear)
   * Peer directly aligned $\rightarrow 0.0$ (balanced center)
   * Peer 75px to your right $\rightarrow +1.0$ (100% right ear)
4. **Acoustic Wall Raycasting:**
   * Casts a line segment between local and peer coordinates against all wall rectangles.
   * Uses 2D Line-Segment Intersection: $\text{Denominator} = (x_1 - x_2)(y_3 - y_4) - (y_1 - y_2)(x_3 - x_4)$.
   * Volume attenuation: $\text{targetGain} \times 0.35^{\text{wallHits}}$.
   * Low-pass filter: `filterNode.frequency` drops from $20,000\text{ Hz}$ to $450\text{ Hz}$ to simulate sound absorption through drywall/glass.
5. **Interactive Soundproof Doors & Knock-to-Enter:**
   * When door is closed: acts as an acoustic soundproof barrier ($\text{targetGain} = 0.0$).
   * When door is open: audio passes through doorway threshold (`doorwayMaxD = 100px`, filter = $2,200\text{ Hz}$).
   * Outsiders cannot enter occupied rooms without knocking (`knock-door`); occupants approve (`welcome-visitor`) or reject (`decline-visitor`).

---

## 4. 2D Canvas & 60 FPS Movement Engine

**Source:** [`client/src/WorldCanvas.jsx`](file:///e:/portfolio-projects/ProxiSpeak/client/src/WorldCanvas.jsx)

1. **60 FPS Linear Interpolation (LERP):**
   * Movement packets are emitted over WebSocket at 20 Hz (every 50ms) to save network bandwidth.
   * Remote avatars do NOT jump or teleport. Every animation frame (16.6ms), coordinates smoothly glide toward target:
     $$\text{renderX} \leftarrow \text{renderX} + (\text{targetX} - \text{renderX}) \times 0.20$$
     $$\text{renderY} \leftarrow \text{renderY} + (\text{targetY} - \text{renderY}) \times 0.20$$
2. **Collision Engine:**
   * AABB checking against walls and closed doors for avatar radius $R = 14\text{ px}$.
   * Diagonal movement speed normalization: multiplied by $\frac{1}{\sqrt{2}} \approx 0.7071$.
3. **Soundstages:**
   * Corporate Office, Conference Auditorium (PA broadcast stage), and Rooftop Social Lounge.
4. **Room Text Chat:**
   * Slide-over chat drawer with Socket.IO room broadcast (`room:chat:message`).

---

## 5. Database Schema & Security

**Database:** MongoDB Atlas via Mongoose ODM

### Collections:
1. **`accounts` ([`server/models/Account.js`](file:///e:/portfolio-projects/ProxiSpeak/server/models/Account.js)):**
   * Fields: `username`, `usernameLower` (indexed, unique), `email` (indexed, unique), `passwordHash` (bcrypt 10 rounds), `avatarColor`, `createdAt`.
   * Case-insensitive login via `findByCredentials(identifier)`.
2. **`users` ([`server/models/User.js`](file:///e:/portfolio-projects/ProxiSpeak/server/models/User.js)):**
   * Active presence & telemetry: `socketId` (unique), `username`, `avatarColor`, `roomId`, `x`, `y`, `location: [Number]` (planar 2D index bounded to `[0, 2000]`), `lastSeen`.
   * **Crucial:** Uses `{ location: '2d' }` planar index, NOT `2dsphere`, because canvas pixels are Cartesian flat coordinates.
3. **`rooms` ([`server/models/Room.js`](file:///e:/portfolio-projects/ProxiSpeak/server/models/Room.js)):**
   * Formally hosted persistent workspaces: `roomId` (unique slug), `name`, `theme`, `createdBy`, `isPublic`, `createdAt`.
   * Note: Ad-hoc quick-join codes (e.g. `singam-is-back-ok14`) are ephemeral in RAM and `users` collection to prevent database bloat; documents are written to `rooms` when explicitly created via the "Host Meeting" form.

---

## 6. Critical Bug Fixes & Known Gotchas (Must Remember!)

1. **`myNameNorm` Component Scope:**
   * In `client/src/WorldCanvas.jsx`, `myNameNorm = username.trim().toLowerCase()` must remain at the top level of the component function. Never move it inside a nested helper or remove it, as the 60 FPS `tick()` loop requires it for peer deduplication on every frame.
2. **Ghost Avatar Deduplication:**
   * Cause: Page refreshes keep old WebSockets alive for 15-20s before ping timeout.
   * Fix: Server searches all rooms on `join-room` and immediately disconnects old sockets sharing the same username (`oldSocket.disconnect(true)`). Client filters drop any peer matching the local user in `room-state`, `user-joined`, and the frame render loop.
3. **Design Standards (Zero Emojis):**
   * The UI follows a strict, luxury architectural studio aesthetic. Never add emojis to UI buttons, controls, or notifications. Use inline SVG icons and clean typography.
4. **Deprecated Voice Server:**
   * The experimental standalone `voice-server/` directory and lobby test bench were completely deprecated and removed in commit `ac7a14c`. The only voice engine is browser-native P2P WebRTC.
5. **Render Free-Tier Keepalive:**
   * `server/index.js` contains a background interval pinging `/api/health` every 2.5 minutes (`PING_INTERVAL_MS = 2.5 * 60 * 1000`) to prevent Render from going to sleep.

---

## 7. Git Workflow & Staging (`dev`) Deployment Commands

To ensure production (`main`) is never broken by untested commits, all work follows the **Staging / Dev Flow**:

```
Feature / Contributor Branch (`branch-dvij`, `branch-kunj`)
                       │
                       ▼
             Staging Branch (`dev`)  <── Vercel Preview Deployment & Team Integration Testing
                       │
                       ▼ (After thorough verification)
            Production Branch (`main`) <── Live Production (Vercel + Render)
```

### Daily Development & Testing Commands:

```bash
# Step 1: Work and commit on your personal / feature branch
git checkout branch-dvij
git add <modified-files>
git commit -m "feat/fix: descriptive message"
git push origin branch-dvij

# Step 2: Merge into dev for integration & preview testing
git checkout dev
git pull origin dev
git merge branch-dvij --no-edit
git push origin dev

# Step 3: Test on Vercel Preview URL
# Vercel automatically creates a preview deployment for `dev` (e.g., https://proxispeak-git-dev-....vercel.app)
# Open the preview link, test multi-peer movement, WebRTC voice, and console errors.

# Step 4: Promote to Production (main) ONLY after dev tests pass
git checkout main
git pull origin main
git merge dev --no-edit
git push -o bypass origin main

# Step 5: Switch back to your working branch
git checkout branch-dvij
```

---

## 8. Team Roles & Contribution Breakdown

* **Dvij Joshi (Lead & Architect):**
  * System Architecture, 3D Web Audio API DSP pipeline, Euclidean distance power curve, Acoustic wall raycasting, Soundproof doors, 60 FPS LERP canvas engine, AABB collision, Account authentication (bcrypt + JWT), Session deduplication, Render keepalive, Vercel/Render DevOps.
* **Kunj Kachhiya (WebRTC & Networking):**
  * WebRTC P2P Mesh negotiation, Metered STUN/TURN integration, Audio device enumeration/switching, VAD threshold tuning, Socket.io Redis adapter.
* **Sumit Sahu (UI Layouts):**
  * Early virtual office UI layout & landing page refinements.
* **Uma Acharya (QA & Testing):**
  * TC-01 (Connection handshake) & TC-02 (Proximity distance falloff) test execution reports and screenshots on `branch-Uma`.

---

## 9. Current Active Repository State
* **Latest Milestone:** Pillar 2 Complete — Multi-Tenant Organization Engine & In-App Office Designer
  * Created backend models `server/models/Organization.js` and `server/models/OfficeLayout.js` with dual-layer storage (MongoDB + disk cache fallback).
  * Built full REST API for Organizations (`GET/POST /api/organizations`, `/members`) and Custom Office Layouts (`GET/POST /api/organizations/:orgId/layouts`, `PUT/DELETE /api/layouts/:layoutId`).
  * Built interactive in-app visual layout builder `client/src/components/OfficeDesigner.jsx` with real-time tool palette (walls, knock-to-enter doors, furniture, sound zones, spawn marker), 20px grid snapping, preset loading, and one-click deployment.
  * Built Organization & Office Hub modal `client/src/components/OrganizationHub.jsx` for organization switching, membership management, and office launching.
  * Added custom layout rendering in `client/src/WorldCanvas.jsx` and workspace controls in `MeetingLobby.jsx` and `App.jsx`.
* **Prior Milestone:** Pillar 1 Complete — World & Canvas Viewport Modernization (V2 Engine) (2200x1300 canvas, follow camera, zoom, minimap radar).
* **Production Branch:** `main` (Auto-deployed to Vercel Production & Render `proxispeak-server`)
* **Staging / Testing Branch:** `dev` (Auto-deployed to Vercel Preview & Render `proxispeak-server-dev`)
* **Feature Branches:** `branch-dvij`, `branch-kunj`, `branch-sumit`, `branch-Uma`
* **Client Build:** Verified clean (0 errors, Vite bundle built in ~1.0s).
* **Server Health:** Verified clean (0 syntax errors, Node 18+ ES modules).
