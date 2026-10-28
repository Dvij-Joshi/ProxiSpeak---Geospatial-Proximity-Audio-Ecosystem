# ProxiSpeak Dedicated Voice Transfer Server

A high-performance, low-latency WebSocket & Web Audio PCM binary voice relay microservice designed specifically for hosting on Render (or any cloud container provider) without third-party TURN API dependencies.

---

## 🌟 Why This Architecture?

Traditional WebRTC mesh calls rely on STUN/TURN servers (like Metered.ca or Coturn) to pierce NATs and symmetric firewalls. However:
1. Third-party TURN providers charge per gigabyte or enforce rate limits.
2. Standard Render Web Services only route TCP traffic over port 443 / 10000, which cannot forward arbitrary dynamic UDP ports required by standard Coturn relays.

### Solution: Direct WebSocket PCM Binary Relay
- Users stream 16-bit / 32-bit Float PCM audio chunks directly over standard WebSocket / TLS connections.
- 100% firewall and corporate VPN traversal (uses standard HTTPS / WSS port 443).
- Zero third-party metered API keys required.
- Near-zero latency with direct client-side Web Audio API rendering.

---

## 🚀 Render Deployment Guide

Follow these simple steps to deploy this voice microservice on Render:

### 1. Log In to Render
- Navigate to [dashboard.render.com](https://dashboard.render.com).

### 2. Create a New Web Service
- Click **New +** -> **Web Service**.
- Connect your GitHub repository (`ProxiSpeak`).

### 3. Service Configuration Details
Fill in the following exact settings:

| Field | Recommended Value |
|---|---|
| **Name** | `proxispeak-voice-server` |
| **Region** | Choose the closest region to your users (e.g., `Singapore`, `Frankfurt`, or `Oregon`) |
| **Branch** | `branch-dvij` (or `main` after merging) |
| **Root Directory** | `voice-server` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | `Free` (or Starter for 24/7 dedicated) |

### 4. Advanced Settings
- **Health Check Path:** `/health`
- **Environment Variables:**
  - `PORT`: `10000` (Render defaults to 10000)
  - `RENDER_EXTERNAL_URL`: *(Leave blank or set to your Render URL after creation)*

### 5. Deploy & Connect
- Click **Deploy Web Service**.
- Render will install dependencies and start the voice server in ~45 seconds.
- Your public service URL will look like:
  ```
  https://proxispeak-voice-server.onrender.com
  ```
- Test health by opening:
  ```
  https://proxispeak-voice-server.onrender.com/health
  ```
  *(Returns `{"status":"ok","service":"proxispeak-voice-server",...}`)*

### 6. Connect in ProxiSpeak
- In your client application or test bench (`/voice-test`), enter your Render URL:
  ```
  https://proxispeak-voice-server.onrender.com
  ```
- Or set `VITE_VOICE_SERVER_URL` in your client `.env` / Render client environment variables!
