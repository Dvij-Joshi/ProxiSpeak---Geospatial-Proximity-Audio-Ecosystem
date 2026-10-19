// ─── Client Configuration ──────────────────────────────────────────────────
export const DEFAULT_SERVER_URL =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://proxispeak-server.onrender.com'
    : '';

export const SERVER_URL = import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL;

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
