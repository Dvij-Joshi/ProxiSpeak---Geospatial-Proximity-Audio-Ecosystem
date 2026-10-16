# 🎙️ ProxiSpeak — Geospatial Proximity Audio Ecosystem
![Version](https://img.shields.io/badge/version-1.0.1-blue)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-blue)](https://reactjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.x-brightgreen)](https://www.mongodb.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-black)](https://socket.io/)
[![WebRTC](https://img.shields.io/badge/WebRTC-Enabled-orange)](https://webrtc.org/)

> **Remote collaboration reimagined** — a 2D virtual office where audio naturally fades in and out based on your avatar's physical proximity to others.

---

## 🌐 Problem Statement

Remote collaboration tools (like Zoom) force users into rigid "rooms" where only one person can speak at a time. They lack the **spontaneous, spatial dynamics** of a real office where you can hear people talking nearby and organically walk over to join a conversation.

---

## 💡 What is ProxiSpeak?

**ProxiSpeak** is a real-time, geospatially-aware audio communication platform. Users navigate a **2D virtual office** rendered via React Canvas. As your avatar moves closer to a colleague, WebRTC audio dynamically **crossfades and becomes louder**. Walk away, and it fades. No rooms. No buttons. Just natural spatial presence.

---

## 🏗️ Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (React)                       │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ WorldCanvas  │  │  WebRTC Mgr    │  │  Audio Mixer   │  │
│  │ (HTML5 2D)   │  │  (P2P Streams) │  │  (Web Audio)   │  │
│  └──────┬───────┘  └───────┬────────┘  └───────┬────────┘  │
│         │  coordinates     │ offer/answer       │ gain/pan  │
└─────────┼──────────────────┼────────────────────┼───────────┘
          │                  │                    │
          ▼        Socket.io / WebSocket          │
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (Node.js + Express)               │
│  ┌──────────────────┐       ┌───────────────────────────┐   │
│  │  Signaling Srvr  │       │  Geospatial Engine        │   │
│  │  (Socket.io)     │       │  (MongoDB $near/$geoW.)   │   │
│  └──────────────────┘       └───────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                        ┌─────▼─────┐
                        │  MongoDB  │
                        │ (GeoJSON) │
                        └───────────┘
```

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for a detailed breakdown.

---

## ✨ Key Features

| Feature | Technology |
|---|---|
| Real-time avatar movement | React + HTML5 Canvas |
| Geospatial proximity clustering | MongoDB `$near` + `$geoWithin` |
| P2P audio streaming | WebRTC (getUserMedia) |
| Dynamic volume based on distance | Web Audio API (GainNode) |
| 3D stereo panning (L/R ear) | Web Audio API (StereoPannerNode) |
| Scalable WebSocket signaling | Socket.io + Redis Pub/Sub |
| 50+ concurrent users | Node.js cluster + Redis |

---

## 🔑 Key Modules

### 1. Geospatial Engine (MongoDB `$near` & `$geoWithin`)
Tracks real-time X/Y coordinates of all users and calculates physical proximity clusters using MongoDB's native geospatial operators.

### 2. Signaling Server (Node.js & Socket.io)
Orchestrates WebRTC peer-to-peer connection handshakes based on who is within **"earshot"** (100-pixel radius).

### 3. Spatial Audio Mixer (Web Audio API)
Frontend module that dynamically adjusts the **gain (volume)** and **3D panning (left/right ear)** of peer audio tracks based on relative avatar distance.

### 4. 2D Virtual World (React & HTML5 Canvas)
A high-performance rendering engine for the virtual office map and real-time avatar movements at a steady **60 FPS**.

---

## 🗂️ Project Structure

```
ProxiSpeak/
├── server/                    # Node.js + Express backend
│   ├── config/
│   │   └── db.js              # MongoDB connection
│   ├── controllers/
│   │   └── proximityController.js
│   ├── models/
│   │   └── User.js            # GeoJSON user schema
│   ├── routes/
│   │   └── proximity.js       # /api/proximity endpoints
│   ├── socket/
│   │   └── signalingServer.js # WebRTC signaling via Socket.io
│   └── index.js               # Entry point
│
├── client/                    # React frontend
│   └── src/
│       ├── components/
│       │   ├── WorldCanvas.jsx  # HTML5 Canvas 2D world
│       │   └── Avatar.jsx       # Avatar rendering & movement
│       ├── services/
│       │   ├── webrtcManager.js # WebRTC P2P connections
│       │   └── audioMixer.js    # Web Audio API spatial mixing
│       ├── App.jsx
│       └── index.jsx
│
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── DEVELOPMENT_PLAN.md
│
├── .env.example               # Environment variable template
├── .gitignore
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
└── README.md
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB 6.x (local or Atlas)
- A modern browser with WebRTC support

### 1. Clone the Repository
```bash
git clone https://github.com/Dvij-Joshi/ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem.git
cd ProxiSpeak---Geospatial-Proximity-Audio-Ecosystem
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your MongoDB URI and other values
```

### 3. Start the Backend
```bash
cd server
npm install
npm run dev
```

### 4. Start the Frontend
```bash
cd client
npm install
npm run dev
```

### 5. Open in Browser
Navigate to `http://localhost:5173` and allow microphone access.

---

## 📅 Development Timeline

| Week | Backend | Frontend |
|------|---------|----------|
| Week 1 | Signaling & Movement | World Rendering |
| Week 2 | Proximity Calculations | WebRTC Integration |
| Mid-Review | Spatial Audit (<20ms) | Audio Check |
| Week 3 | Mesh Scaling + Redis | Dynamic Attenuation |
| Week 4 | Room Persistence | Refine & Polish (60 FPS) |

See [DEVELOPMENT_PLAN.md](./docs/DEVELOPMENT_PLAN.md) for detailed weekly goals.

---

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before submitting a PR.

---

## 📄 License

This project is licensed under the MIT License — see [LICENSE](./LICENSE) for details.

---

<div align="center">
  Made with ❤️ as part of the Infotact Solutions internship program
</div>
