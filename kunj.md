# Kunj Kachhiya — ProxiSpeak Contributor

Hi, I'm **Kunj Kachhiya**, a developer contributing to the ProxiSpeak project. ProxiSpeak is a geospatial proximity-based audio ecosystem that enables real-time spatial voice communication inside virtual office workspaces. Participants move avatars on a shared canvas and hear each other based on proximity, with volume attenuating naturally as distance increases — just like a real office.

## Spatial Audio & Proximity Architecture

- **Acoustic Attenuation Model** — Integrated Web Audio API gain curve nodes where volume falloff is mathematically computed based on Euclidean distance between local and remote avatars.
- **Room Boundary Raycasting** — Handled spatial audio isolation across distinct office zones (Meeting Room, Manager's Office, Tech Server Room, Lounge) with doorway occlusion and wall obstruction filters.
- **MongoDB Geospatial Proximity** — Implemented the `GET /api/proximity/:userId` endpoint leveraging MongoDB 2dsphere indexes and `$near` queries to compute nearby participants dynamically.
- **60fps World Rendering** — Synchronized avatar positions with smooth linear interpolation (LERP factor 0.20) for jitter-free movement and responsive audio panning.
