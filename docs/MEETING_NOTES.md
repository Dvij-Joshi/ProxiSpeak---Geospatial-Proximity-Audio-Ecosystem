# Team Meeting Notes — Feature Planning Session

**Date:** October 10, 2025
**Attendees:** Dvij Joshi, Team
**Topic:** ProxiSpeak v0.2+ Feature Brainstorming & Prioritization

---

## Context

After the Week 1 backend and frontend scaffolds were functional, the team held a session to discuss what additional features could elevate ProxiSpeak from a basic proximity audio tool into a fully immersive virtual office experience. Below are the raw notes and decisions from that session.

---

## Features Discussed

### 🔒 Locked Rooms
- Users should be able to lock a "room zone" during sensitive conversations
- No audio bleeds out; incoming users see a lock indicator
- Latecomers can send a "knock" request — a subtle ping to the people inside
- People inside can **accept** (unlock temporarily) or **decline**
- **Decision:** Include in Week 3 scope. Backend needs a room-state field.

### 💬 Real-time Chat Bubbles / Subtitles
- While moving, show live speech-to-text captions above avatars
- Subtitles persist for ~5 seconds after speaking stops
- Dual use: accessibility + meeting recaps
- **Decision:** Deprioritised to Week 4. Requires Web Speech API integration.

### 📶 Bad Network Indicator
- Show a degraded signal icon above avatars experiencing packet loss or high latency
- Backend monitors WebRTC stats; emits a `network-quality` event
- **Decision:** Low effort, high value. Add in Week 2 alongside WebRTC.

### 🆘 Contextual Help Beacon
- User clicks "Need Help", picks a topic (debugging, design review, code question)
- Broadcasts a spatial beacon visible to nearby colleagues with matching skills
- Beacon disappears when resolved or cancelled
- **Decision:** Novel feature, plan for Week 3. Needs a `Beacon` MongoDB model.

### 📌 Spatial Knowledge Pins
- Sticky notes anchored to map coordinates
- Anyone can drop a pin: bug report near a dev desk, task beside a whiteboard
- Pins visible to all in the room; clickable to expand
- **Decision:** Nice UX differentiator. Add as a stretch goal in Week 4.

### 🔍 Find My Colleague
- Search bar to locate any online teammate
- App highlights their avatar and optionally suggests a path around walls
- **Decision:** Week 4. Simple query; pathfinding is optional for MVP.

### 🌐 Live Translation Captions (AI-based)
- Translate captions in real-time for multilingual teams
- Show both original and translated text as an option
- **Decision:** Post-MVP. Requires integration with a translation API (e.g. Google Translate).

### 🔄 Conversation Thread Handoff (AI-based)
- When a new person walks into an ongoing conversation, they can request a recap
- System shows a one-sentence context card + prior agreed decisions
- Requires conversation memory (opt-in) and a summarisation model
- **Decision:** Post-MVP / v2.0. High complexity; needs LLM integration.

---

## Priority Matrix

| Feature | Priority | Week Target |
|---|---|---|
| Bad Network Indicator | High | Week 2 |
| Locked Rooms + Knock | High | Week 3 |
| Contextual Help Beacon | Medium | Week 3 |
| Spatial Knowledge Pins | Medium | Week 4 (stretch) |
| Chat Bubbles / Subtitles | Medium | Week 4 |
| Find My Colleague | Low | Week 4 |
| Live Translation (AI) | Low | Post-MVP |
| Conversation Thread Handoff (AI) | Low | Post-MVP / v2.0 |

---

## Action Items

- [ ] Dvij — Add `isLocked` and `pendingKnocks` fields to Room schema
- [ ] Dvij — Create `Beacon` MongoDB model for Help Beacon feature
- [ ] Dvij — Add `Pin` model and REST endpoints for Spatial Knowledge Pins
- [ ] Team — Review Web Speech API browser compatibility for subtitles
- [ ] Team — Evaluate translation API costs for Live Translation feature

---

## Next Meeting
Scheduled after Mid-Project Review to reassess scope and progress.
