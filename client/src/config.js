// ─── Client Configuration ──────────────────────────────────────────────────
export const PRODUCTION_SERVER_URL = 'https://proxispeak-server.onrender.com';

function resolveServerUrl() {
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  // In the browser, check if we are developing locally
  if (typeof window !== 'undefined') {
    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    if (isLocal) {
      return ''; // Vite proxy handles /api and /socket.io in local dev
    }
  }
  // Default to deployed Render backend
  return PRODUCTION_SERVER_URL;
}

export const SERVER_URL = resolveServerUrl();

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

