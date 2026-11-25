# ProxiSpeak - Geospatial Proximity Audio Ecosystem

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-purple)](https://vitejs.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-brightgreen)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-black)](https://socket.io/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Mesh-orange)](https://webrtc.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3.4-38bdf8)](https://tailwindcss.com/)

> An interactive 2D spatial workspace where peer-to-peer WebRTC audio naturally attenuates, pans, and occludes through physical walls and soundproof doors based on avatar coordinates in real time.

---

## 1. Problem Statement

Traditional video conferencing platforms force teams into rigid, single-speaker call rooms where only one person can speak comfortably at a time. They lack the spontaneous, spatial dynamics of a physical office—where you can naturally overhear nearby conversations, walk over to collaborate, step into soundproof rooms for private strategy, or relax in social spaces without interrupting ongoing discussions.

---

## 2. System Architecture

ProxiSpeak strictly separates the **Control Plane** (signaling, movement, authentication) from the **Media Plane** (audio streams):

```
+--------------------------------------------------------------------------+
|                             CLIENT (React 18)                            |
|                                                                          |
|  +------------------+  +------------------+  +------------------------+  |
|  |   WorldCanvas    |  |   WebRTC Mesh    |  |  Spatial Audio Engine  |  |
|  | (60fps LERP 2D)  |  |  (RTCPeerConn.)  |  |  (Web Audio API DSP)   |  |
|  +--------+---------+  +--------+---------+  +-----------+------------+  |
|           | coordinates         | SDP & ICE candidates   | gain, pan,    |
|           | (20 Hz throttled)   | signaling              | low-pass filter
+-----------+---------------------+------------------------+---------------+
            |                     |                        |
            v                     v                        v
+--------------------------------------------------------------------------+
|                    CONTROL PLANE (Node.js + Express)                     |
|                                                                          |
|  - Socket.IO signaling broker & coordinate relay                         |
|  - JWT authentication & bcrypt salted credential verification            |
|  - Anti-spam throttled event routing & session deduplication             |
|  - Room chat relay & interactive door state coordination                 |
|  - Multi-tenant organization engine & meeting calendar scheduler         |
|  * ZERO audio bytes touch or pass through this server                    |
+------------------------------------+-------------------------------------+
                                     |
                                     v
+--------------------------------------------------------------------------+
|                        DATA TIER (MongoDB Atlas)                         |
|                                                                          |
|  - Accounts: usernameLower, email, bcrypt passwordHash, avatarColor      |
|  - Organizations: orgId, name, slug, owner, members, custom settings    |
|  - OfficeLayouts: walls, doors, workstation pods, sound zones, rotation  |
|  - Meetings: scheduled calls, status, template, host, duration tracking  |
|  - Rooms: persistent hosted workspace definitions & themes               |
|  - Users: active presence, socketId, location: [x, y] (2d planar index)  |
+--------------------------------------------------------------------------+
```

---

## 3. Core Architectural Pillars

### Pillar 1: Spatial Audio Digital Signal Processing (Web Audio API)
* **Open Workspace Falloff:** Calibrated to a natural 320 px earshot radius.
  $$\text{gain} = \max\left(0.04, \left(1 - \frac{d - 25}{295}\right)^{0.75}\right)$$
  Audio maintains comfortable presence across desk clusters and drops smoothly to total silence beyond 320 px.
* **Enclosed Meeting Room Acoustics:** Enclosed suites provide an expanded 850 px acoustic zone:
  $$\text{gain} = \max\left(0.45, \left(1 - \frac{d - 25}{825}\right)^{0.75}\right)$$
  Ensures every member around boardroom tables hears colleagues with high clarity (45% to 100% volume).
* **3D Stereo Directionality:** Horizontal delta-X offset maps dynamically to binaural left/right panning using `StereoPannerNode`:
  $$\text{pan} = \max\left(-1.0, \min\left(1.0, \frac{x_{\text{peer}} - x_{\text{local}}}{0.75 \times \text{MAX\_DISTANCE}}\right)\right)$$
* **Acoustic Wall Raycasting:** 2D line-segment intersection tests trace the direct acoustic path between avatars. Intervening drywall and masonry apply $0.35^{\text{hits}}$ volume decay and trigger a `BiquadFilterNode` lowpass cutoff reduction (from 20,000 Hz down to 450 Hz) to simulate realistic architectural sound absorption.
* **Soundproof Doors & Knock-to-Enter:** Enclosed rooms feature interactive doors. When closed, doors enforce complete soundproofing (0% transmission). Outside visitors must knock (`knock-door`); occupants can welcome (`welcome-visitor`) or decline entry.
* **De-Zippering:** Audio parameter changes are scheduled using `setTargetAtTime(targetGain, currentTime, 0.03)` with a 30 ms exponential time constant, eliminating audible audio clicking during fast avatar motion.

### Pillar 2: Resilient WebRTC Audio Mesh & NAT Traversal
* **Pure P2P Mesh:** Encrypted browser-to-browser SRTP media transport using the Opus 48 kHz stereo codec.
* **Bandwidth Optimization:** Target bitrate is clamped to 48 kbps per peer (`RTCRtpSender.setParameters({ maxBitrate: 48000 })`), maintaining high speech fidelity while conserving upstream mesh bandwidth.
* **Metered OpenRelay TURN Fallback:** High-availability TURN relay servers (UDP, TCP, and TLS on ports 80 and 443) are integrated as automated fallbacks, ensuring media traversal across symmetric NAT, carrier-grade NAT (CGNAT), and enterprise firewalls.
* **Serialized Negotiation Queue:** Implements `_queueNegotiation(peerId, operation)` across offer, answer, and ICE restart operations to eliminate offer/answer race conditions (glare).
* **Dual-Engine Audio Playback:** Web Audio API handles spatial DSP on desktop browsers, while direct HTML5 audio element decoding provides reliable unmuted hardware playback on iOS/WebKit.

### Pillar 3: V2 2200x1300 World Viewport & Movement Engine
* **60 FPS Linear Interpolation (LERP):** Coordinates are transmitted over WebSockets at a bandwidth-efficient 20 Hz throttled rate. The local client glides avatars smoothly each 16.6 ms frame toward the target position:
  $$\text{renderX} \leftarrow \text{renderX} + (\text{targetX} - \text{renderX}) \times 0.20$$
* **Dynamic Camera & Radar:** Follow camera centers the user's avatar, with smooth zoom scaling (0.5x to 2.0x) and fullscreen mode. The Minimap Radar (HQ Radar) synchronizes layout barriers, sound zones, and live avatar blips.
* **Interactive Meeting Actions:**
  * Chair Seating: Automatic coordinate snapping and facing orientation when sitting at boardroom tables and desks.
  * Hand-Raising Queue: Visual hand indicators and notification chimes for structured speaking turns.
  * Spatial Sound Effects: Synthesized Web Audio chimes for knocking, clapping reactions, and room entry.
* **Studio Multi-Tool Side Panel:** Edge-to-edge docked panel featuring:
  * People Directory: Searchable list of connected peers, room locations, and earshot distance telemetry.
  * Chat & Direct Messages: Room-wide text broadcast and encrypted private 1-on-1 direct messages.
  * Settings & Soundstage: Microphone hardware device selector, live input level meter, audio context diagnostics, and keyboard hotkeys reference.

### Pillar 4: Custom In-App Office Designer
* **Visual Blueprint Builder:** Full in-app CAD editor supporting 10 architectural components (walls, knock-to-enter doors, workstation pods, conference tables, breakout sofas, server racks, biophilic plants, sound zones, and spawn points).
* **Directional Wall Expansion:** Select any placed wall segment to display interactive directional handles. Clicking handles instantiates connected segments (straight extensions or 90-degree corner turns) with zero gap.
* **SAT 2D Collision Detection:** Separating Axis Theorem mathematical collision engine blocks invalid overlaps between furniture and walls while permitting valid architectural contacts (doors on walls, edge-to-edge corner joints).
* **Rotation & Alignment:** 45-degree component rotation using mouse scroll or [R] hotkey, 20px grid snapping, and translucent cursor ghost previews.

### Pillar 5: Multi-Tenant Organization Engine & Dashboard
* **Enterprise Identity:** Corporate domain authentication (`@company.com`) with role-based access control (`owner`, `admin`, `member`).
* **Admin Management Dashboard:** Automated provisioning of official company credentials, member role assignments, and organization settings.
* **Team Meeting Scheduler:** Instant meeting launcher, scheduled calendar sync with countdown timers, and duration history logs.
* **Personalized Multi-Tier Dashboard:**
  * Personal User View: Tailored for consumer webmail accounts (Gmail, Yahoo, Outlook). Features live microphone input level meters, speaker test chimes, instant personal room launcher, quick code join, and an upgrade pathway to create a corporate headquarters.
  * Enterprise User View: Tailored for organization members and company email domains. Features one-click company headquarters launch, scheduled meetings calendar, colleague directory with role badges, and custom architectural layout management.
  * Interactive Preview Switcher: Allows evaluating both user perspectives (`Auto`, `Personal`, `Enterprise`) on demand.

---

## 4. Technical Capabilities Matrix

| Capability | Architecture / Protocol | Technical Specification |
|:---|:---|:---|
| Audio Transport | WebRTC Full-Mesh | Opus 48 kHz stereo, 48 kbps clamped bitrate |
| NAT Traversal | ICE / STUN / TURN | Google STUN, Cloudflare STUN, Metered OpenRelay TURN (UDP/TCP/TLS) |
| Signaling Broker | Socket.IO (WebSockets) | 20 Hz throttled coordinates, SDP offer/answer, trickle ICE |
| Spatial Audio DSP | Web Audio API | 320 px open earshot, 850 px enclosed room, 3D stereo panning |
| Obstacle Occlusion | 2D Raycasting | $0.35^{\text{hits}}$ volume decay, 450 Hz lowpass biquad filter |
| Soundproof Doors | Dynamic Barrier Geometry | -18 dB closed door isolation, Knock-to-Enter protocol |
| Rendering Engine | HTML5 Canvas 2D | 60 FPS LERP smoothing, follow camera, 2200x1300 coordinate space |
| Collision Detection | SAT (Separating Axis) | Convex polygon and circle collision with 2px margin tolerance |
| Authentication | bcrypt + JWT | 10 salt rounds, Bearer tokens, case-insensitive credentials |
| Data Persistence | MongoDB Atlas + Mongoose | Planar 2D index (`location: '2d'`), dual-layer disk cache fallback |
| Client Build | Vite 5.4 + React 18 | Code-split modular bundles (WorldCanvas, OfficeDesigner, Dashboard) |
| Styling System | Tailwind CSS v3 + Fonts | Barlow Condensed, DM Sans, Material Symbols |

---

## 5. Project Directory Structure

```
ProxiSpeak/
├── server/
│   ├── config/
│   │   └── db.js                 # MongoDB Atlas Mongoose connection & lifecycle
│   ├── controllers/
│   │   └── proximityController.js# Geospatial distance queries
│   ├── models/
│   │   ├── Account.js            # User credentials, bcrypt hash, usernameLower index
│   │   ├── Organization.js       # Multi-tenant organizations, members, slugs, roles
│   │   ├── OfficeLayout.js       # Custom floor plans, wall segments, furniture, zones
│   │   ├── Meeting.js            # Scheduled & instant meetings, templates, duration logs
│   │   ├── Room.js               # Formally hosted workspace definitions & themes
│   │   └── User.js               # Active sessions, socketId, 2d planar indexed location
│   ├── meetingActions.js         # Chair seating, hand-raising queue, reaction sound broker
│   ├── security.js               # Rate limiters, DDoS protection, input sanitation
│   └── index.js                  # Express API, Socket.IO signaling, dashboard summaries
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx     # Multi-tier personalized dashboard (Personal vs Enterprise)
│   │   │   ├── MeetingLobby.jsx  # Workspace directory, quick join, host modal, audio guide
│   │   │   ├── OfficeDesigner.jsx# 2D CAD visual office builder, wall expansion, SAT engine
│   │   │   ├── OrganizationHub.jsx# Organization switcher, admin dashboard, meeting center
│   │   │   ├── AuthModal.jsx     # Registration & sign-in with live squircle avatar preview
│   │   │   ├── WorkspaceArt.jsx  # Canvas vignettes and avatar portrait components
│   │   │   ├── designerGeometry.js# SAT collision detection, wall expansion, snap math
│   │   │   ├── modelCatalog.js   # 2D model geometry catalog for office designer
│   │   │   └── layoutModels.js   # Architectural layout models and presets
│   │   ├── world/
│   │   │   ├── character.js      # Player avatar rendering, walking animations, badges
│   │   │   ├── models.js         # Canvas model renderers for desks, chairs, sofas, screens
│   │   │   ├── renderScene.js    # World collision detection, scene paint pipeline
│   │   │   ├── roomGeometry.js   # Room bounding boxes and door coordinate mappings
│   │   │   └── scenes.js         # Corporate Office, Auditorium, Sky Rooftop theme scenes
│   │   ├── services/
│   │   │   ├── spatialAudio.js   # Web Audio DSP pipeline, raycasting, acoustic earshot
│   │   │   ├── webrtc.js         # WebRTC mesh manager, negotiation queue, STUN/TURN
│   │   │   └── meetingSounds.js  # Synthesized Web Audio chimes, reactions, audio cues
│   │   ├── utils/
│   │   │   └── userType.js       # Corporate domain classification & user type helpers
│   │   ├── App.jsx               # Top-level state router, session validation, view switcher
│   │   ├── WorldCanvas.jsx       # 2200x1300 60 FPS viewport, follow camera, side panel
│   │   ├── config.js             # Environment endpoints & tunnel URL fallbacks
│   │   └── index.css             # Architectural styling system & Tailwind CSS directives
│   ├── tests/
│   │   ├── world.test.js         # World geometry connectivity & acoustics tests
│   │   ├── negotiation.test.js   # WebRTC SDP negotiation queue serialization tests
│   │   ├── meeting-actions.test.js# Seating, hand-raising, and reaction action tests
│   │   └── dashboard.test.js     # Email domain classification & account categorization tests
│   ├── index.html                # HTML5 entrypoint & typography definitions
│   ├── tailwind.config.js        # Tailwind CSS design system tokens
│   └── vite.config.js            # Vite build pipeline & reverse proxy configuration
│
├── docs/
│   ├── ARCHITECTURE.md           # Deep-dive architectural documentation & DSP mathematics
│   ├── API.md                    # REST endpoints & Socket.IO event dictionary
│   ├── DEVELOPMENT_PLAN.md       # Deliverable completion records & milestone roadmap
│   └── ROADMAP.md                # Feature roadmap, scope boundaries & post-MVP goals
│
├── context.md                    # Single source of engineering truth & project history
├── package.json                  # Root dependencies, scripts, and server configuration
└── LICENSE                       # MIT License
```

---

## 6. Getting Started

### Prerequisites
* **Node.js**: 18.0 or higher
* **MongoDB**: Local MongoDB instance or MongoDB Atlas cluster URI
* **Browser**: Modern Chromium, Firefox, or Safari browser with WebRTC and Web Audio API support

### 1. Clone the Repository
```bash
git clone https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem.git
cd ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:
```env
PORT=5000
MONGODB_URI=your_mongodb_atlas_connection_string
JWT_SECRET=your_secure_jwt_secret_key
CLIENT_URL=http://localhost:5173
METERED_DOMAIN=your_metered_app_name.metered.live
METERED_SECRET_KEY=your_metered_api_key
```

### 3. Install Dependencies
```bash
# Install root dependencies (Express, Socket.IO, Mongoose, bcryptjs, JWT)
npm install

# Install client dependencies (React, Vite, Tailwind CSS, Fontsource)
npm --prefix client install
```

### 4. Run Automated Test Suites
```bash
node client/tests/world.test.js
node client/tests/negotiation.test.js
node client/tests/meeting-actions.test.js
node client/tests/dashboard.test.js
```

### 5. Start the Development Servers
```bash
# Start backend server on http://localhost:5000
npm run server

# In a separate terminal, start frontend client on http://localhost:5173
npm run client
```

Open [`http://localhost:5173`](http://localhost:5173) in your browser to enter the workspace.

---

## 7. Verification & Build Integrity

Production bundle compilation is verified with code-splitting across primary modules:
```bash
npm --prefix client run build
```
Build chunks output:
* `WorldCanvas` (Viewport engine & spatial side panel)
* `OfficeDesigner` (2D architectural blueprint editor)
* `Dashboard` (Multi-tier personal vs enterprise workspace view)
* `webrtc` (P2P mesh signaling & audio transceiver manager)

---

## 8. License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.
