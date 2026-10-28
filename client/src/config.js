// ─── Client Configuration ──────────────────────────────────────────────────
export const PRODUCTION_SERVER_URL = 'https://proxispeak-geospatial-proximity-audio-2i7g.onrender.com';
export const PRODUCTION_VOICE_SERVER_URL = 'https://proxispeak-geospatial-proximity-audio-wb2s.onrender.com';

function resolveServerUrl() {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  // In the browser, check if we are developing locally or on a local area network (LAN)
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
    const isLAN =
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.2') ||
      hostname.startsWith('172.3') ||
      hostname.endsWith('.local');

    if (isLoopback) {
      // Vite dev server proxies /api and /socket.io to localhost:5000
      if (window.location.port === '5173') {
        return '';
      }
      return 'http://localhost:5000';
    }

    if (isLAN) {
      // Connect to the local backend on the same host machine
      return `http://${hostname}:5000`;
    }
  }
  // Default to deployed Render backend
  return PRODUCTION_SERVER_URL;
}

export const SERVER_URL = resolveServerUrl();

export function resolveVoiceServerUrl() {
  if (import.meta.env.VITE_VOICE_SERVER_URL) {
    return import.meta.env.VITE_VOICE_SERVER_URL;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLoopback) {
      return 'http://localhost:10000';
    }
  }
  return PRODUCTION_VOICE_SERVER_URL;
}

export const VOICE_SERVER_URL = resolveVoiceServerUrl();

export const AVATAR_COLORS = [
  '#3b82f6', // Electric Blue
  '#10b981', // Emerald Green
  '#f59e0b', // Amber Orange
  '#ef4444', // Ruby Red
  '#8b5cf6', // Violet Purple
  '#ec4899', // Bright Pink
  '#06b6d4', // Cyan
  '#84cc16', // Lime
];
