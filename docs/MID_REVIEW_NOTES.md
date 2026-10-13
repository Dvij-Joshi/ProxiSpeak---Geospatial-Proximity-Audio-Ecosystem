# ProxiSpeak — Mid-Project Review Notes

**Date:** October 13, 2025
**Attendees:** Kunj Kachhiya (Frontend), Dvij Joshi (Backend)
**Review Type:** Mid-Project Checkpoint — End of Week 2

---

## 🎨 Frontend Audit — Audio Check

### Goal
Demonstrate two browsers successfully establishing a WebRTC audio connection via the signaling server.

### Results

| Check | Status | Notes |
|---|---|---|
| Two tabs connect to same room | ✅ Pass | `main-office` room joins confirmed |
| Moving within 100px triggers offer/answer | ✅ Pass | Offer/answer exchanged in ~1.1s avg |
| Live mic audio heard in second tab | ✅ Pass | Confirmed with Chrome DevTools audio output |
| Peer connection closes on exit | ✅ Pass | No zombie RTCPeerConnections in memory snapshot |

### Notes
- `webrtcManager.js` handles full RTCPeerConnection lifecycle correctly
- ICE candidate relay through signaling server working without drops
- Tested on Chrome 119 + Firefox 120 — both functional
- One edge case: rapid avatar movement (teleporting across the 100px boundary multiple times in < 200ms) caused duplicate offer events. Workaround: added a debounce on `inEarshot` event processing. To be cleaned up in Week 3.

---

## 🖥️ Backend Audit — Spatial Audit

### Results (Dvij's notes, summarised)

| Users Simulated | Avg Query Time | p95 Latency | Result |
|---|---|---|---|
| 10 | 4.2ms | 7.1ms | ✅ Pass |
| 25 | 8.9ms | 13.4ms | ✅ Pass |
| 50 | 12.7ms | 18.1ms | ✅ Pass |

- `2dsphere` index confirmed active via `explain()` — IXSCAN used
- No false positives or negatives detected in boundary tests
- `$near` query consistently sub-20ms at 50 users

---

## Decisions for Week 3

### Frontend (Kunj)
- Start `audioMixer.js` — Web Audio API service for spatial mixing
- Implement `GainNode` + `StereoPannerNode` pipeline per peer stream
- Hook into `user-moved` events to call `setGainAndPan()` in real-time
- Target: at 50px distance, volume at 50%; at 100px, silence
- Fix the earshot debounce edge case identified in audio check

### Backend (Dvij)
- Set up Redis adapter for multi-node Socket.io
- Configure `cluster` module for multi-core support
- Load test with 50 users after Redis integration

---

## Open Issues / Blockers

| Issue | Owner | Priority |
|---|---|---|
| Debounce edge case on rapid boundary crossing | Kunj | Medium |
| Firefox mic permission prompt flow slightly broken on first load | Kunj | Low |
| Redis install needed before backend can test clustering | Dvij | High |

---

## Overall Assessment

Both backend and frontend are on track. Proximity clustering is well within the 20ms target and WebRTC signaling is stable. Week 3 will shift focus to spatial audio mixing on the frontend and server scaling on the backend. No scope changes needed at this point.
