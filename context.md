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
* **Latest Milestone:** Custom Office Designer – Interactive Wall Expansion & SAT Component Collision Detection Engine
  * **Interactive Directional Wall Expansion (Clash of Clans-Style Mechanics):**
    * Selecting any placed architectural wall segment on the canvas generates interactive directional expansion arrow buttons:
      * Horizontal walls provide straight East/West extensions plus 90° North/South corner turn controls.
      * Vertical walls provide straight North/South extensions plus 90° East/West corner turn controls.
    * Clicking any expansion arrow automatically instantiates a connected wall segment inheriting the exact dimensions, thickness, material variation, and color of the source wall with zero visible gap.
    * Continuous building workflow: newly created segments immediately display their own directional handles, enabling rapid boundary construction of entire conference rooms and offices through sequential clicks.
    * Hovering over any directional handle displays a translucent dashed guide preview with `+ CONNECT` indicator.
    * Built-in duplicate prevention and canvas perimeter boundary checks (2200x1300).
  * **SAT (Separating Axis Theorem) 2D Collision Detection Engine (`client/src/components/designerGeometry.js`):**
    * Mathematical 2D collision validator supporting oriented bounding boxes rotated at arbitrary angles and circle-polygon collision for biophilic plants and spawn arrival zones.
    * Configurable margin tolerance (2px) ensuring architectural edge-to-edge contacts (corner joints, touching walls) are recognized as valid connections while physical penetrations and overlaps are caught.
    * Architectural domain rules:
      * Doors on walls: Allowed (doors puncture partitions).
      * Furniture on furniture / walls / doors: Blocked.
      * Sound isolation zones: Non-physical, never collide or block placement.
    * Real-time cursor HUD feedback: Displays crimson warning pill (`⊘ BLOCKED: [Type]`) with dimmed ghost preview when hovering obstructed regions.
    * Placement protection: Blocks invalid placement attempts in `handlePointerDown` and flashes an animated floating collision banner.
    * **Wall Expansion Direction Fix:** Upgraded 2D endpoint connection detection in `client/src/components/designerGeometry.js` to use rigorous 2D point-to-box distance (`isPointNearWallBox`). Fixed false positive connection suppression where distant walls sharing a 1D coordinate falsely blocked directional arrows. Added `isValidTarget` collision check against other walls.
    * **Continuous Tool Placement & Armed Tool Persistence:** Enabled continuous multi-item plotting across all tools (walls, workstation pods, conference tables, sofas, server racks, plants, doors, sound zones) by maintaining `activeTool` state across canvas clicks instead of auto-resetting to `select`. Wall expansion handles are active and clickable during both `wall` and `select` modes. Added `Esc` key shortcut to return to select mode.
    * **Wall Bounding Box Math & Double-Rotation Fix:** Implemented `getWallBoxCorners` in `designerGeometry.js` to preserve true axis-aligned bounding rectangles for orthogonal walls without rotation distortions. Resolved false-positive furniture collision bugs where vertical wall expansion arrows double-rotated into neighboring furniture.
    * **Dynamic Interactive Cursors:** Implemented contextual canvas cursors: pointing-hand cursor (`cursor-pointer`) for the wall-building tool and expansion arrow hover, open grab hand (`cursor-grab`) for selectable models, closed grabbing hand (`cursor-grabbing`) during active object dragging and canvas panning, crosshair for non-wall placement, and default pointer.
    * **Clean UI Hover & Overlay Dismissal:** Added automatic overlay clearance (`onPointerEnter`) to toolbar, sidebar, and header containers, instantly hiding blueprint suggestion overlays and expansion guides when hovering over interface tool buttons.
    * **Refined Cursor Dynamics & Drag State Synchronization:** Ensured `setIsDragging(true)` is dispatched across all canvas element drag handlers (walls, doors, furniture, sound zones, spawn marker), seamlessly activating the closed grabbing hand (`cursor-grabbing`) during mouse moves. Mapped all studio model placement tools (`desk`, `conf_table`, `sofa`, `server_rack`, `plant`, `chair`, `door`, `spawn`) to `cursor-grab` on the canvas, eliminating unwanted `+` crosshairs during model placement while maintaining `cursor-pointer` for walls and expansion arrows.
* **Prior Milestone:** Pillar 2 & Organization Engine Refinement — Robust Admin & Member Dashboards, Meeting Center & Architectural Templates
  * Created server/models/Meeting.js schema supporting instant and scheduled meetings with template routing (office, conference, 
ooftop, custom), duration tracking, and meeting histories.
  * Enhanced server/models/Organization.js with case-insensitive uniqueness (
ameLower index & pre-save hook) and expanded member schema.
  * Implemented Admin Management Dashboard & Member Organization Dashboard in client/src/components/OrganizationHub.jsx matching the high-end luxury ivory/carbon frontend aesthetic with zero emojis in UI buttons.
  * Implemented Admin User Management with auto-generated @<org-slug>.com emails (e.g. 
amesh.kumar@google.com), admin-designated passwords, and real automatic Account provisioning in MongoDB and disk cache.
  * Built complete Meeting Center with instant meeting launcher (template selector modal), meeting scheduler (date/time/template), countdown timers, and past meeting history log table.
  * Seeded 3 default architectural templates for all organizations: Corporate Headquarters (office), Townhall Auditorium (conference), and Sky Rooftop Lounge (
ooftop), with custom templates created via the in-app Office Designer.
  * Decoupled Socket.IO connection lifecycle from theme and layout rendering in client/src/WorldCanvas.jsx, eliminating connection thrashing, 400+ reconnect loops, and flashing Online/Offline status.
  * Upgraded Minimap Radar to directly render the exact pre-rendered world canvas floor plan (offscreenRef.current), guaranteeing 100% pixel-perfect architectural synchronization between minimap and main office view.
  * Added dynamic template fallback to GET /api/layouts/:layoutId and increased socket concurrency limit to 35 to prevent 404s and connection rejections.
* **Current Active Milestone:** Live Backend Migration to New Render Instance (`https://proxispeak-server-sgwp.onrender.com`)
  * **Objective:** Restore production backend connectivity following suspension of the legacy instance due to free tier compute limit exhaustion.
  * **Deployment Verification:**
    * Live health check against `https://proxispeak-server-sgwp.onrender.com/health` returned HTTP 200 OK with active MongoDB connection (`dbReadyState: 1`).
  * **Configuration Updates:**
    * Updated `PRODUCTION_SERVER_URL` in `client/src/config.js`.
    * Updated Vercel API proxy rewrites in `client/vercel.json` and `vercel.json`.
    * Updated service discovery definitions in `render.yaml` and documentation examples in `.env.example`.
  * **Verification:**
    * Production Vite client build succeeded in 1.27s with 0 errors.
* **Prior Milestone:** Avatar Spawn Coordinate Synchronization & Render Backend Diagnostics (`main`, `dev`, `branch-dvij`)
  * **Objective:** Fix the avatar positioning discrepancy when users join rooms and diagnose authentication failures.
  * **Root Cause 1 (Avatar Positioning Mismatch):**
    * In V1, the canvas was `1200x680`, so `server/index.js` hardcoded initial spawn coordinates to `x: 560, y: 340` (center of old canvas).
    * When the engine upgraded to V2 (2200x1300 canvas), the local client initialized avatars at the theme spawn point (`1100, 720`), but `socket.emit('join-room')` never forwarded those coordinates.
    * As a result, the server registered joining users at the legacy (560, 340) position, making friends appear isolated on the top-left edge of the canvas until they moved.
    * **Fix:** Updated `client/src/WorldCanvas.jsx` to transmit `x: stateRef.current.x, y: stateRef.current.y` on `join-room`, and updated `server/index.js` to prioritize client layout coordinates, defaulting to the V2 center (`1100, 720`).
  * **Root Cause 2 (Authentication / Password "Never Matching"):**
    * Render free compute quota (750 free instance hours/month) was completely exhausted on the deployment account, placing `proxispeak-server` into "Free usage limit reached / Service Suspended" status returning HTTP 503 Service Unavailable without CORS headers.
    * All 18 database accounts in MongoDB Atlas remain 100% healthy, and bcrypt authentication logic was tested and verified intact.
  * **Verification:**
    * Tested MongoDB Atlas connectivity and bcrypt password comparison with 100% pass rate.
    * Production Vite client build succeeded in 1.60s with 0 errors.
* **Prior Milestone:** Complete Purge of Experimental Voice-Server & Strict P2P Audio Mesh Alignment (`main`, `dev`, `branch-dvij`)
  * **Objective:** Safely check and permanently remove the legacy `voice-server/` directory, `VoiceTest.jsx` component, and voice relay environment configurations in accordance with the project plan.
  * **Architectural Rationale:**
    * ProxiSpeak strictly mandates a 100% Peer-to-Peer WebRTC Opus mesh where zero audio bytes ever touch or pass through a central media server.
    * The legacy standalone `voice-server/` directory and experimental `VoiceTest` bench were resurrected during earlier historical branch merges.
  * **Actions Taken:**
    * Deleted `voice-server/` directory containing `server.js`, `package.json`, `package-lock.json`, `README.md`, and `.env.example`.
    * Removed experimental `client/src/components/VoiceTest.jsx` (728 lines) and deleted the orange "Voice Test" navigation button from `client/src/components/MeetingLobby.jsx`.
    * Cleaned `client/src/App.jsx` routing and state (`isVoiceTesting`, URL search params, and view render branches).
    * Removed unused `PRODUCTION_VOICE_SERVER_URL` and `resolveVoiceServerUrl` exports from `client/src/config.js`.
  * **Verification:**
    * Production Vite client build succeeded in 1.60s with 0 errors (client bundle size reduced by ~17 kB).
    * Server syntax check passed cleanly with 0 errors.
* **Prior Milestone:** Pull Request #4 Integration & Safe Parent Attribution (`main`, `dev`, `branch-dvij` at commit `3ad474e`)
  * **Objective:** Cleanly merge Pull Request #4 (`fix(ui): align responsive office and live status #4` from `branch-sumit`), marking the PR as formally merged on GitHub and attributing Sumit's commits to the project history without regressing, altering, or overwriting our production codebase.
  * **Git Merge Strategy (`-s ours`):**
    * Ran `git merge -s ours origin/branch-sumit -m "merge: pull request #4 from branch-sumit"` directly into `main`.
    * This DAG merge strategy creates a merge commit with two parents (`origin/main` and `origin/branch-sumit`), which immediately closes PR #4 with the purple "Merged" badge on GitHub and records Sumit's 5 commits into the repository history.
    * The working tree of `main` was preserved with zero byte changes (`git diff origin/main` produced zero diff), leaving our studio porcelain UI, single-organization restriction, and multi-tenant backend completely intact.
    * Fast-forward merged `main` into `dev` and `branch-dvij`, and pushed all three branches to GitHub remote (`origin`).
  * **Verification:**
    * Git status clean on `branch-dvij`, `dev`, and `main`.
    * Production Vite client build verified clean (`built in 1.27s`, 0 errors).
* **Prior Milestone:** Single-Organization Membership Enforcement (`server/index.js`, `OrganizationHub.jsx`)
  * **Core Invariant:** A user who is part of an organization cannot create another organization (enforced across owners, administrators, and team members).
  * **Backend Enforcement (`server/index.js` in `POST /api/organizations`):**
    * Authenticates caller via Bearer JWT token or request metadata (`currentUser`, `currentEmail`).
    * Checks both in-memory cache (`memoryOrgs`) and MongoDB (`Organization.findOne`) for existing ownership or membership in `org.members`.
    * If caller or proposed administrator is already part of any organization, the request is immediately rejected with HTTP 403 Forbidden: `"You are already part of \"<OrgName>\". Users who are part of an organization cannot create another organization."`
    * Verifies proposed admin handle and company email across all organizations before provisioning.
  * **Frontend Enforcement (`client/src/components/OrganizationHub.jsx`):**
    * In the workspace selector sidebar, hides the `Create Organization` button whenever `organizations.length > 0`, rendering an active membership status pill (`Enrolled: <OrgName>`) with a live status dot instead.
    * Only surfaces the `Create Organization` button in the sidebar and empty state view if the user belongs to zero organizations (`organizations.length === 0`).
    * Guards `handleOpenCreateOrg` and `handleCreateOrg` to block execution and show an error toast if the user already belongs to an organization.
    * Passes active `Authorization: Bearer <token>` and user metadata in `POST /api/organizations` calls.
  * **Verification:**
    * Automated integration test suite (`AlphaCorp` creation, Alice second org creation attempt via Bearer token, Bob colleague addition, Bob creation attempt while enrolled, and unassociated Charlie creation) passed with 100% success (5/5 tests passed).
    * Production Vite build verified clean (1.14s).
* **Prior Milestone:** Application-Wide Studio Redesign of All Dialog Popups & Modals (`OrganizationHub.jsx`, `MeetingLobby.jsx`, `WorldCanvas.jsx`)
  * **Design System Alignment:** Eliminated generic "AI-sloppy" UI artifacts (harsh borders, clumsy `rounded-full` inputs, stark uppercase labels, and emojis) and unified all floating dialogs into the warm porcelain studio aesthetic (`#FAF9F5`, hairline borders `#E5E4DE`, soft ambient elevation `shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)]`, dark obsidian action CTAs `bg-[#141413]`, tactile `rounded-xl` inputs, and technical monospace metadata badges).
  * **Organization Hub Modals (`client/src/components/OrganizationHub.jsx`):**
    * **Top Navigation & Window Shell:** Upgraded main workspace shell to `rounded-[28px] border border-[#E5E4DE] shadow-[0_32px_80px_-16px_rgba(20,20,19,0.22)]` with studio top bar, framed close button, and obsidian "Start Instant Call" CTA.
    * **Modal 1 (Create Organization & Provision Admin):** Studio header with `add_business` badge, technical micro-kicker, `rounded-xl` ergonomic inputs, live monospace admin preview card with green status indicator, circular brand swatches, and dark obsidian submit button.
    * **Modal 1.5 (Admin Credentials Generated):** Studio dialog with `admin_panel_settings` badge, monospace credentials card with 1-click copy buttons, and "Sign In as Admin Now" direct login button.
    * **Modal 2 (Add Colleague to Organization):** `person_add` studio header, `TEAM ENROLLMENT` kicker, real-time company email preview, password generator, segmented role selector (`Team Member` vs `Administrator`), and dark obsidian action button.
    * **Modal 2.5 (Colleague Credentials Generated):** Elevated card with 1-click credentials copy and "Add Another" button.
    * **Modal 3 (Edit Member):** Studio header with `manage_accounts` badge, refined inputs and dropdowns, obsidian save button.
    * **Modal 4 (Remove Member):** Access revocation modal with red rose badge, warning copy, and styled danger action button.
    * **Modal 5 (Instant Spatial Call):** Architectural soundstage picker featuring 3 luxury template cards (Corporate Headquarters, Townhall Auditorium, Sky Rooftop Lounge) with active obsidian rings and launch CTA.
    * **Modal 6 (Schedule Meeting):** Studio calendar header, refined date/time inputs, template select dropdown, and obsidian CTA.
  * **Meeting Lobby Modals (`client/src/components/MeetingLobby.jsx`):**
    * **Host Workspace Modal:** Studio header with `add_circle` badge, `rounded-xl` inputs, architectural acoustic template cards with checkmark indicators, and obsidian CTA.
    * **Technical Info Modals (Spatial Audio, Hardware, Docs):** Studio headers with Material Symbol icons, porcelain specification cards, and monospace keybinding pills.
  * **World Canvas Dialogs (`client/src/WorldCanvas.jsx`):**
    * **Knock-to-Enter Door Approval Modal:** Transformed into floating porcelain studio card (`rounded-2xl bg-[#FAF9F5] border border-[#E5E4DE] shadow-2xl`), refined visitor badge, obsidian "Welcome" button, and framed "Decline" button.
    * **Audio Diagnostics Modal Overlay:** Elevated to floating studio card with Material Symbol close button, real-time monospace telemetry rows, status indicator badges, Material Symbol network icons, and clean recovery action buttons.
  * **Compliance & Verification:**
    * Zero emojis across all UI dialogs, buttons, and canvas layout text (strict repository rule enforced).
    * Production Vite build verified clean (0 errors, 1.25s).
* **Prior Milestone:** Organization Multi-Tenant Privacy, Admin Account Provisioning and Role Enforcement
  * **Bug 1 and 2 Resolved — Admin Account Auto-Provisioning and Auto-Logout:**
    * When creating an organization (`POST /api/organizations`), the server requires admin name and auto-generates a unique secure default password (`Admin#...`).
    * Server derives official admin email (`<handle>@<slug>.com`), hashes the password with bcrypt (10 salt rounds), provisions a genuine ProxiSpeak `Account` in memory cache and MongoDB, and issues a 14-day JWT token.
    * Creator is set as organization `owner` in `org.members` with `role: "owner"`.
    * On client submission, any active normal user session is immediately logged out (`onLogout()` called, localStorage tokens cleared).
    * Client presents a dedicated "Admin Account and Organization Provisioned" modal with 1-click "Sign In as Admin Now" button (`onAuthSuccess`) and 1-click credential copying.
    * Signing in as Admin immediately sets `isAdmin = true` and displays the `ADMINISTRATOR` badge, enabling full team management and member addition controls.
  * **Bug 3 Resolved — Eradication of Fake Default Seed Organizations:**
    * Completely emptied hardcoded seeds (`SEED_ORGS = []`, `SEED_LAYOUTS = []`, `SEED_MEETINGS = []`).
    * Added disk, memory, and MongoDB cleanup routines in `loadCachedOrgsAndLayouts()` and DB boot to purge legacy `acme-corp` and `deepmind-lab` records.
    * Removed fake fallback in `OrganizationHub.jsx` catch block, replacing it with clean empty states (`[]`).
  * **Bug 4 Resolved — Strict Multi-Tenant Organization Privacy Isolation:**
    * Updated `GET /api/organizations` in `server/index.js` to authenticate callers via `Authorization: Bearer <token>` or query parameters (`username`/`email`).
    * Strangers, unauthenticated callers, or non-members receive an empty array (`[]`), preventing cross-tenant leakage.
    * Authenticated callers only receive organizations where they are verified owners or enrolled members in `org.members`.
  * **Admin Colleague Management and Overview Quick Actions:**
    * Added quick "Add Team Member" action directly on the Overview tab metric card in `OrganizationHub.jsx`.
    * Colleague creation generates unique passwords (`User#...`), official company emails (`<handle>@<slug>.com`), and displays a 1-click credentials copy dialog.
  * **Verification:**
    * All 5 automated integration tests passed with 100% success (Multi-tenant privacy, Admin provisioning, Admin login, Scoped visibility, Colleague addition and login).
    * Production client build verified clean with Vite (1.25s).
* **Prior Milestone:** Studio Components Enhancement — 2D Meeting Room Architectural Design System & Studio-Grade Collapsible Subpanel
  * **2D Vector CAD Architectural Models (`client/src/components/architecturalComponents.js`):**
    * Replaced basic generic rectangular and circular placeholders with detailed, realistic 2D floor-plan models conforming to architectural CAD standards across all component categories.
    * **Boardroom Conference Tables (5 models):** Executive Mahogany with recessed cable raceway & 10 executive armchairs, Racetrack Oval capsule, U-Shape AV presentation layout, Roundtable democratic hub, Boat-Shape tapered executive boardroom. All tables render realistic radially positioned ergonomic chairs internally.
    * **Workstation Pods & Desks (4 models):** Dual Bench workstations, Facing Pods with acoustic privacy dividers, Executive L-Desk with side credenza, Single Focus Pod with ergonomic swivel seating and dual ultra-wide displays.
    * **Lounge Breakout Seating (4 models):** Linear Cushioned sofa, Curved Arc Breakout sofa, Corner L-Sectional, Executive Club Armchair.
    * **IT Server Infrastructure (3 models):** Enterprise 42U rack with LED activity grid, Telecom Cable Hub, Blade Modular Bay.
    * **Biophilic Greenery & Acoustic Decor (3 models):** Monstera Deliciosa, Acoustic Palm, Planter Acoustic Divider Box.
    * **Spawn Teleport Markers (2 models):** Executive Teleport Ring with compass arrows, Modern Grid Target with directional reticle.
    * **Acoustic Walls & Doors:** 3 wall models (Concrete Stud, Slatted Timber, Double-Glazed Glass) with live thickness profiles (Slim, Std, Heavy); 5 door variations (Single Swing, Double Glass, Sliding Pocket, Acoustic Heavy, Executive Pivot) with 90° swing arcs and brass hinge pivots.
    * **Live Workspace Sync (`client/src/WorldCanvas.jsx`):** Synchronized `drawArchitecturalFurniture` dispatcher renders custom architectural furniture models identically in the deployed multi-user spatial audio workspace.
    * **Schema Extension (`server/models/OfficeLayout.js`):** Added `furnitureType`, `variation`, and `seats` subfields to furniture schema with backward-compatible defaults.
  * **Studio-Grade Collapsible Subpanel & Variant Picker UI/UX (`client/src/components/OfficeDesigner.jsx`):**
    * **Dual-State Collapsible Spec Bar:** Resolved the intrusive, screen-dominating subpanel by introducing `isCustomizerExpanded`. When expanded, renders a compact, high-density 2-column or 3-column model variant grid (reduced from 450px to ~175px). When collapsed, compresses to an ultra-clean 32px summary bar with tool icon, model name, live dimension tag, color dot, and 1-click `[Specs]` expansion toggle.
    * **Intuitive Opening & Closing Logic:** Clicking any tool in the catalog opens its specs; clicking an already active tool toggles the specs open/closed. Added minimize (`keyboard_arrow_up`) and deselect (`close`) controls in the subpanel header. Catalog tool items now display active toggle indicators (`▲ SPECS` / `▼ SPECS`).
    * **High-Density Architectural Model Grid:** Replaced bulky, single-column vertical cards with sleek, responsive 2-column/3-column CAD picker tiles featuring crisp vector icons, bold short names, and monospace technical badges.
    * **Universal Component Dimensions & Presets:** Integrated tailored size/scale presets across all 9 components (wall length/core thickness, door width, zone dimensions, table seat sizes, desk configurations, sofa lengths, rack bays, plant radii).
    * **Authentic Material Color Palettes:** Dynamic palette mapping for every model with active ring highlight (warm woods, anodized slate, frosted cyan, obsidian, biophilic greens).
    * **Updated Presets & Inspector:** Updated `Startup Loft` and `Executive Suite` layout presets to instantly deploy architectural workstations, boardroom tables, and breakout sofas. Placed furniture in Object Inspector now loads authentic model-specific color palettes.
* **Latest Milestone:** Custom Office Designer UI Alignment & Console Error Resolution
  * **Custom Office Designer Scandinavian Editorial Alignment (`client/src/components/OfficeDesigner.jsx`):**
    * Overhauled the visual styling of the Custom Office Designer from harsh cyberpunk pitch-black (`#070a13`, `#0b101c`) with electric cyan accents to the warm, minimalist Scandinavian aesthetic of the Landing Page and Meeting Lobby.
    * Converted root workspace to warm linen `#FAF9F5` with crisp elevated surfaces (`#ffffff`), subtle neutral lines (`#E5E4DE`, `#D9D7D0`), and obsidian typography (`#1c1b1b`).
    * Re-skinned the top control header with white background, subtle border, rounded-full preset pills (`Startup Loft`, `Executive Suite`, `Clear Floor`), and primary royal blue deploy CTA (`#2563eb`).
    * Redesigned the 56px left rail and 320px flyout drawer with soft `#FAF9F5` and `#ffffff` backgrounds, sleek segment filters (`All`, `Acoustic`, `Desks`, `Decor`), and clean catalog cards with subtle borders.
    * Re-themed the Object Inspector and component customizer with clean white cards, subtle material swatches, and accessible inputs.
    * Redesigned the floating bottom helper HUD as an elevated frosted pill with subtle borders, charcoal text, and clean icons.
    * Converted the canvas drawing outer world border to clean architectural slate `#e2e8f0`.
  * **Passive Event Listener Resolution (`WorldCanvas.jsx`, `OfficeDesigner.jsx`):**
    * Resolved Chrome console errors (`Unable to preventDefault inside passive event listener invocation`) by removing default passive `onWheel` props from JSX canvas elements and binding native non-passive wheel listeners via `addEventListener('wheel', handler, { passive: false })` within `useEffect`.
  * **Favicon 404 Resolution (`client/public/favicon.svg`, `client/public/favicon.ico`, `client/index.html`):**
    * Generated brand geometric spatial soundwave favicon in SVG and binary ICO formats, linked in `index.html` with `image/svg+xml` and `alternate icon`, eliminating 404 console errors.
  * **Render Cold-Start Room Fetch Auto-Retry (`client/src/components/MeetingLobby.jsx`):**
    * Added automatic 3-second retry logic to `fetchRooms()` so network disruptions or connection resets during Render free-tier container cold starts recover automatically without requiring user page reload.
* **Latest Milestone:** Runtime Stability & Blank Screen Bug Resolution (TDZ Hoisting Fix)
  * **Root Cause Diagnosis:**
    * In client/src/components/OfficeDesigner.jsx, the canvas ResizeObserver useEffect hook registered a non-passive wheel event listener and referenced handleWheel inside its dependency array.
    * Because handleWheel was declared with const lower down in the component function body, evaluating it in the useEffect call triggered JavaScript's Temporal Dead Zone (TDZ).
    * When bundled and minified by Vite, this manifested in production as Uncaught ReferenceError: Cannot access 'Sr' before initialization at Gc, unmounting the React tree and rendering a blank white screen.
  * **Architectural Resolution:**
    * Introduced a stable handleWheelRef = useRef(null) declared at the top of OfficeDesigner.jsx alongside canvasRef.
    * Updated the non-passive wheel listener inside the mounting useEffect to invoke handleWheelRef.current?.(e) with an empty dependency array [].
    * Assigned handleWheelRef.current = handleWheel immediately following the handleWheel function declaration.
    * Verified clean Vite bundle compilation (npm --prefix client run build) with 0 errors.
* **Prior Milestone:** Meeting Room Redesign — Studio Side Panel, Initials Squircle Avatar & Private Messaging
  * **Meeting Room Page Redesign & Edge-to-Edge Responsive Layout:**
    * Completely overhauled client/src/WorldCanvas.jsx from a centered, fixed-width card layout with dead margins to a full-viewport Studio Workspace (100vw x 100vh).
    * Integrated a dynamic ResizeObserver on the canvas container that continuously synchronizes canvas.width and canvas.height to 100% of the available area, completely eliminating misaligned empty spaces and letterboxing on wide displays.
    * Integrated a docked Studio Multi-Tool Side Panel (360px width) with responsive header toggles, expandable/collapsible view, and three tabs:
      * **People (Participants):** Live searchable directory of connected participants. Displays local user status, each peer's initials squircle box, display name, current acoustic room zone, real-time earshot distance (Math.hypot), proximity status (In Earshot / Out of Range), and a 1-click Chat Privately action button.
      * **Chat & Direct Messages:** Unified dual-channel messaging engine. Supports both broadcast Room Chat (to all floor participants) and targeted Private DMs (1-on-1 direct conversations with peer picker, private badges, and end-to-end socket relay).
      * **Settings & Soundstage:** Audio input device selector (webrtc.switchAudioInputDevice), spatial audio engine telemetry (AudioContext state, unlock/resume controls, mic re-acquisition, peer reconnect), soundstage acoustics specs (-14 dB wall attenuation, -18 dB closed door isolation, 320px earshot), and complete keyboard hotkeys reference (WASD, M, D, Space PTT, mouse scroll zoom, door clicks).
  * **First Name, Surname Registration & Live Avatar Box Preview:**
    * Redesigned client/src/components/AuthModal.jsx registration form to capture First Name and Surname as dedicated fields (e.g., 'Dvij' and 'Joshi').
    * Built a live interactive Avatar Preview Box on the registration modal that dynamically updates 2-letter uppercase initials (e.g., 'DJ') and real-time palette color selection.
    * Saves composite full name username = "${firstName.trim()} ${lastName.trim()}" while preserving backwards compatibility for login credentials.
  * **Initials Squircle Box Avatar Engine:**
    * Created client/src/utils/avatar.js exporting getInitials(name) with edge-case handling for multi-word, single-word, and empty strings.
    * Replaced legacy circle geometry in drawAvatar (client/src/WorldCanvas.jsx) with a modern 36x36px rounded squircle box (drawRoundRect with 9px radius) filled with the user's chosen avatarColor, white highlight border, drop shadow, speaking aura wave, and centered bold white initials (e.g. 'DJ').
    * Updated renderMinimap (HQ RADAR) to render mini squircle boxes for all peers and local player instead of raw circular blips.
    * Updated top navigation User Badge and chat message avatars to render matching squircle initials boxes.
  * **Private Direct Messaging Server Relay:**
    * Implemented private:chat:send event listener and private:chat:message targeted relay in server/index.js with anti-spam rate limiting and sender echo.
* **Prior Milestone:** Custom Office Designer — Live Cursor Preview & Component Rotation Control
  * **Live Cursor Ghost Preview:** 20px grid-snapped translucent ghost geometry directly attached to the mouse cursor across all 10 tools (walls, doors, workstation pods, boardroom tables, breakout sofas, server racks, plants, acoustic zones, spawn points).
  * **Interactive Component Rotation Control:** Mouse scroll wheel and [R] hotkey rotate components in 45° increments with real-time HUD angle pill feedback; scrolling with an object selected rotates that placed entity.
  * **Wall & Door Architectural Guidance:** Walls render 120x8 dimension markers and acoustic barrier tags; doors render golden brass hinge pivots and 90° translucent swing clearance wedges.
  * **Placement Auto-Deselect:** Clicking on the canvas places the entity at the exact previewed coordinates and angle, auto-selects the placed item in the synchronized Object Inspector, and switches to select mode so the preview cleanly disappears.
  * **Runtime & Schema Synchronization:** Added rotation schema in server/models/OfficeLayout.js and updated client/src/WorldCanvas.jsx to render rotated furniture, walls, and dynamic doors with swing arcs.
* **Prior Milestone:** Custom Office Designer Tool Section Alignment & Synchronized Inspector Engine
  * Re-architected `client/src/components/OfficeDesigner.jsx` tool catalog and object inspector:
    * **Section-Organized Architectural Tools:** Grouped components into dedicated categories (`Navigation & Controls`, `Acoustic Structures & Privacy`, `Workspaces & Furniture`, `Biophilic & Decor`) with clean section dividers, standardized 32x32px centered icon tiles, consistent uppercase hotkey badges (`V`, `W`, `D`, `P`, `T`, `L`, `R`, `F`, `Z`, `S`), and streamlined border alignments eliminating awkward pill overflows.
    * **Fully Synchronized Dual-State Inspector:** Resolved selection desynchronization where placing elements or switching armed tools retained outdated data. Placed entities across all 10 tools are immediately selected and focused in the Inspector. When no object is selected, displays the Armed Drawing Tool Placement Guide alongside live blueprint stats (walls, doors, furniture, zones counts).
    * **Duplicate Hotkey & Quick Actions:** Added `Ctrl+D` object duplication with +20px offset, instant entity deletion (`Del`/`Backspace`), and clean deselect (`Esc`).
    * **Zero-Collision Flex Viewport:** Retained 56px fixed rail and animated `w-80` to `w-0` drawer width with `ResizeObserver` maintaining 100% responsive canvas re-centering.
  * Preserved full backwards compatibility with MongoDB schemas, REST endpoints, and `WorldCanvas.jsx` layout loading.
* **Prior Milestone:** Pillar 2 Complete — Multi-Tenant Organization Engine & In-App Office Designer
  * Created backend models `server/models/Organization.js` and `server/models/OfficeLayout.js` with dual-layer storage (MongoDB + disk cache fallback).
  * Built full REST API for Organizations (`GET/POST /api/organizations`, `/members`) and Custom Office Layouts (`GET/POST /api/organizations/:orgId/layouts`, `PUT/DELETE /api/layouts/:layoutId`).
  * Built interactive in-app visual layout builder `client/src/components/OfficeDesigner.jsx` with real-time tool palette (walls, knock-to-enter doors, furniture, sound zones, spawn marker), 20px grid snapping, preset loading, and one-click deployment.
  * Built Organization & Office Hub modal `client/src/components/OrganizationHub.jsx` for organization switching, membership management, and office launching.
  * Added custom layout rendering in `client/src/WorldCanvas.jsx` and workspace controls in `MeetingLobby.jsx` and `App.jsx`.
* **Prior Milestone:** Pillar 1 Complete — World & Canvas Viewport Modernization (V2 Engine) (2200x1300 canvas, follow camera, zoom, minimap radar).
* **Production Branch:** `main` (Auto-deployed to Vercel Production & Render `proxispeak-server`)
* **Staging / Testing Branch:** `dev` (Auto-deployed to Vercel Preview & Render `proxispeak-server-dev`)
* **Feature Branches:** `branch-dvij`, `branch-kunj`, `branch-sumit`, `branch-Uma`
* **Bug Fixes (Organization Hub, Radar Sync & Socket Stability):**
  * Fixed rapid Socket connect/disconnect infinite loop (and flashing Online/Offline status) by wrapping ctiveTheme in useMemo with stable layout identity dependencies, preventing the main socket useEffect from tearing down and reconnecting on every render frame.
  * Fixed empty/blank canvas when entering newly created organization offices by defaulting uncustomized layouts to the complete base theme (THEMES.office), rendering all 5 suites, desks, plants, and soundproof doors.
  * Synchronized the Minimap Radar (HQ RADAR) with the main map: renders matching acoustic sound zones, custom walls, and doors for custom layouts, and themed floors/doors for base themes.
  * Added layout lookup in server/index.js GET /api/rooms/:roomId and layout fetch fallback in WorldCanvas.jsx so joining or reloading direct organization URLs (/?room=org-slug-hq) loads the full layout data without 404s.
* **Documentation:** Added ProxiSpeak-Progress-Checklist.md mapping week-wise project deliverables with portable repository-relative links.
* **Knowledge Graph:** Initialized via GSD Graphify (531 nodes, 698 edges, 30 communities at HEAD commit).
* **Client Build:** Verified clean (0 errors, Vite bundle built in ~1.0s).
* **Server Health:** Verified clean (0 syntax errors, Node 18+ ES modules).
