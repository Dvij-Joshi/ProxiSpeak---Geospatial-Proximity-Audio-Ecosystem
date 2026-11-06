# Kunj Kachhiya — ProxiSpeak Contributor

Hi, I'm **Kunj Kachhiya**, a developer contributing to the ProxiSpeak project. ProxiSpeak is a geospatial proximity-based audio ecosystem that enables real-time spatial voice communication inside virtual office workspaces. Participants move avatars on a shared canvas and hear each other based on proximity, with volume attenuating naturally as distance increases — just like a real office.

## Key Engineering Contributions

- **WebRTC Audio Synchronization** — Fixed critical peer-to-peer audio synchronization where new participants joining ongoing meetings could not establish bidirectional audio. Resolved transceiver direction desynchronization (`currentDirection` vs `direction`), Perfect Negotiation glare handling with `meta.isIgnoringOffer`, and remote track `onunmute` event bindings.
- **Duplicate Avatar Elimination** — Solved multi-avatar rendering bugs across page reloads and network reconnections. Introduced stable participant identity tracking (`userId`) across Socket.io signals and added render-loop `Set` deduplication.
- **Mesh Network Stability** — Optimized the peer connection lifecycle with targeted ICE restarts (`pc.restartIce()`) instead of destructive resets, and implemented automated stale socket cleanup on the backend.
- **Spatial Audio & Proximity Architecture** — Integrated Web Audio API gain curve attenuation, room boundary raycasting with doorway acoustic filtering, and MongoDB `$near` geospatial proximity endpoints.

## Testing & Quality Assurance Rigor

- **Automated Multi-Peer Test Harness** — Authored `tests/test_multi_peer_dedup.mjs` to simulate active meeting lifecycles: 4 concurrent peers connecting, participant page reloads under new socket IDs, 5th participant join handling, and clean peer disconnections.
- **Zero-Glitch Verification** — Verified bidirectional WebRTC audio handshake reliability under impolite/polite peer collisions and guaranteed that exactly one avatar per unique participant is rendered at 60fps.
- **Audio Pipeline Diagnostics** — Validated track attachment states, browser autoplay policy unlock mechanisms, and audio context resume flows across mobile and desktop clients.

## Technical Skills & Stack

| Layer     | Technologies                                      |
|-----------|----------------------------------------------------|
| Frontend  | React 18, Vite, HTML5 Canvas, Web Audio API, WebRTC |
| Backend   | Node.js, Express, Socket.io, MongoDB, Mongoose    |
| Signaling | SDP Offer/Answer Exchange, ICE Candidate Routing  |
| Auth      | JWT, bcrypt, persistent session tokens            |
| DevOps    | Git, GitHub, Render cloud deployment               |

## Contributor Information

- **Name:** Kunj Kachhiya
- **GitHub:** [Kunj182](https://github.com/Kunj182)
- **Email:** kunjkachhia@gmail.com
- **Role:** Full-Stack & WebRTC Spatial Audio Engineer
