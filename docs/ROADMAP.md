# ProxiSpeak — Feature Roadmap

> Last updated after team feature planning session — October 2025

This roadmap captures all features discussed and tentatively agreed upon by the team. Items marked **In Scope** will be built within the 4-week project timeline. Items marked **Post-MVP** are stretch goals for v2.0.

---

## ✅ Core (Already Planned — Weeks 1–4)

These were part of the original project spec and are actively being built.

| Feature | Description | Status |
|---|---|---|
| Real-time avatar movement | Keyboard/mouse-driven movement on 2D canvas | 🔨 In Progress |
| Geospatial proximity clustering | MongoDB `$near` to detect earshot (100px radius) | 🔨 In Progress |
| WebRTC P2P audio | Direct browser-to-browser audio via signaling server | 🔨 In Progress |
| Dynamic volume attenuation | Gain drops linearly with distance | 🔨 In Progress |
| Stereo panning | Left/right ear placement based on avatar position | 🔨 In Progress |
| Room persistence | Save office layouts and furniture to MongoDB | 📋 Planned |
| 60 FPS canvas rendering | Delta-time smoothed `requestAnimationFrame` loop | 📋 Planned |

---

## 🆕 Tentative Features (Agreed After Team Discussion)

### 🔒 Locked Rooms with Knock System
*Priority: High — Target: Week 3*

A room zone can be locked by the occupants during sensitive conversations.
- No audio escapes the zone while locked
- External users see a 🔒 lock icon over the zone
- A "Knock" button sends a subtle ping request to users inside
- Insiders can **Accept** (temporarily opens audio channel) or **Decline**
- Room lock state stored in MongoDB; broadcast via Socket.io

---

### 💬 Chat Bubbles & Real-time Subtitles
*Priority: Medium — Target: Week 4*

Live speech-to-text captions displayed as floating bubbles above avatars.
- Uses browser **Web Speech API** (`SpeechRecognition`)
- Captions fade after ~5 seconds of silence
- Secondary use: meeting transcript / recap generation
- Accessible to users with hearing difficulties

---

### 📶 Bad Network Indicator
*Priority: High — Target: Week 2*

Visual signal degradation icon above avatars with poor connectivity.
- Backend reads **WebRTC stats** (`RTCPeerConnection.getStats()`)
- Emits `network-quality` Socket.io event with a quality score (`good` / `degraded` / `poor`)
- Canvas renders a signal icon (📶 → 📵) above the affected avatar
- Helps teammates understand audio issues aren't caused by the speaker

---

### 🆘 Contextual Help Beacon
*Priority: Medium — Target: Week 3*

A spatial SOS system for getting help from nearby teammates.
- User clicks "Need Help" → selects a topic: `debugging`, `design review`, `code question`
- A pulsing beacon appears on the canvas at the user's location
- Nearby colleagues whose skill tags match the topic see a notification
- Available teammates walk over to help; beacon auto-dismisses on resolution
- Requires a `Beacon` MongoDB model and a new Socket.io event `beacon-created`

---

### 📌 Spatial Knowledge Pins
*Priority: Medium — Target: Week 4 (stretch)*

Sticky notes anchored to specific map coordinates, visible to all room members.
- Any user can drop a pin anywhere on the canvas
- Pin types: `bug-report`, `task`, `update`, `question`, `announcement`
- Clicking a pin expands it to show full note content + author + timestamp
- Pins persist in MongoDB; loaded when any user joins the room
- Requires a `Pin` MongoDB model and REST endpoints

---

### 🔍 Find My Colleague
*Priority: Low — Target: Week 4*

Search and navigate to any active teammate in the virtual office.
- Search bar filters online users by username
- Selecting a result highlights the target avatar with a pulsing ring
- Optional: display a suggested path arrow routing around walls
- Simple query against MongoDB by `username` + `roomId`

---

## 🤖 AI-Powered Features (Post-MVP / v2.0)

These features require external AI/ML integrations and are out of scope for the current 4-week sprint. They are documented here for future planning.

---

### 🌐 Live Translation Captions
*Priority: Low — Target: Post-MVP*

Real-time translated subtitles for multilingual teams.
- Extends the Chat Bubbles feature with a translation layer
- Integration candidates: **Google Cloud Translation API**, **DeepL API**
- Users can toggle between original language and translated captions
- Translation happens client-side (API call) to avoid server bottleneck
- Privacy consideration: only translate if user opts in

---

### 🔄 Conversation Thread Handoff
*Priority: Low — Target: Post-MVP / v2.0*

AI-generated context cards for late-joining conversation participants.
- When a new avatar walks into an active conversation zone, a prompt appears: *"Get a recap?"*
- System generates a **one-sentence summary** of the recent conversation
- Shows previously agreed decisions (if conversation memory is enabled, opt-in)
- Participants can explicitly share transcript snippets or notes with the newcomer
- Integration: **LLM API** (e.g. Gemini, GPT-4o) with conversation history stored in MongoDB
- Requires careful privacy design — conversation recording is always opt-in

---

## Summary

| Category | Count |
|---|---|
| Core features (in progress) | 7 |
| Tentative new features (in scope) | 5 |
| AI-powered features (post-MVP) | 2 |
| **Total** | **14** |
