import { useRef, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { spatialAudio, MAX_DISTANCE } from './services/spatialAudio';
import { webrtc } from './services/webrtc';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 1200;
const H = 680;
const SPEED = 2.8;
const R = 14; // avatar radius
const ROOM_ID = 'main-office';

// Local dev  → empty string, Vite proxy routes /socket.io → localhost:5000
// Production on Vercel → fallback to deployed Render backend
const DEFAULT_SERVER_URL =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://proxispeak-server.onrender.com'
    : '';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL;
const MOVE_THROTTLE_MS = 50; // emit move at most every 50ms

// ─── Office Layout ────────────────────────────────────────────────────────────

const ROOM_FLOORS = [
  { x: 18, y: 18, w: W - 36, h: H - 36, color: '#f0ede8' },
  { x: 18, y: 18, w: 298, h: 248, color: '#ddedf7' },
  { x: 358, y: 18, w: 228, h: 215, color: '#f7f0e0' },
  { x: 868, y: 18, w: 314, h: 225, color: '#e0f0e8' },
  { x: 18, y: 492, w: 278, h: H - 510, color: '#fff4e0' },
  { x: 942, y: 490, w: 240, h: H - 508, color: '#f0e8f8' },
];

const ROOM_LABELS = [
  { text: 'Meeting Room',     x: 167, y: 40 },
  { text: "Manager's Office", x: 472, y: 40 },
  { text: 'Tech / Server',    x: 1025, y: 40 },
  { text: 'Lounge & Break',   x: 157, y: 515 },
  { text: 'Print / Copy',     x: 1062, y: 512 },
  { text: 'Open Workspace',   x: 630, y: 318 },
];

const WALLS = [
  { x: 10,      y: 10,     w: W - 20, h: 8   },
  { x: 10,      y: 10,     w: 8,      h: H-20 },
  { x: W - 18,  y: 10,     w: 8,      h: H-20 },
  { x: 10,      y: H - 18, w: W - 20, h: 8   },
  { x: 313, y: 18,  w: 8, h: 188 },
  { x: 18,  y: 261, w: 258, h: 8 },
  { x: 353, y: 18, w: 8, h: 215 },
  { x: 583, y: 18, w: 8, h: 215 },
  { x: 361, y: 228, w: 182, h: 8 },
  { x: 863, y: 18,  w: 8, h: 137 },
  { x: 871, y: 238, w: 311, h: 8 },
  { x: 18,  y: 487, w: 222, h: 8 },
  { x: 291, y: 487, w: 8,   h: H - 505 },
  { x: 937, y: 490, w: 8, h: 80 },
  { x: 945, y: 485, w: 237, h: 8 },
  { x: 863, y: 155, w: 8, h: 8 },
];

const FURNITURE = [
  { type: 'rect',   x: 55,  y: 80,  w: 200, h: 100, color: '#b5896a', rx: 6 },
  { type: 'chair',  x: 85,  y: 68 }, { type: 'chair', x: 145, y: 68 },
  { type: 'chair',  x: 205, y: 68 }, { type: 'chair', x: 85,  y: 192 },
  { type: 'chair',  x: 145, y: 192 },{ type: 'chair', x: 205, y: 192 },
  { type: 'chair',  x: 42,  y: 130 },{ type: 'chair', x: 268, y: 130 },
  { type: 'plant',  x: 290, y: 40,  r: 13 },{ type: 'plant', x: 290, y: 240, r: 13 },
  { type: 'rect',   x: 375, y: 55,  w: 170, h: 55, color: '#b5896a', rx: 4 },
  { type: 'rect',   x: 375, y: 55,  w: 55,  h: 100, color: '#b5896a', rx: 4 },
  { type: 'screen', x: 455, y: 50 }, { type: 'chair', x: 460, y: 125 },
  { type: 'plant',  x: 560, y: 50, r: 14 }, { type: 'plant', x: 365, y: 215, r: 11 },
  { type: 'rect', x: 890, y: 35, w: 32, h: 185, color: '#4a5568', rx: 2 },
  { type: 'rect', x: 938, y: 35, w: 32, h: 185, color: '#4a5568', rx: 2 },
  { type: 'rect', x: 986, y: 35, w: 32, h: 185, color: '#4a5568', rx: 2 },
  { type: 'rect', x: 1055, y: 45, w: 115, h: 80, color: '#5a6577', rx: 3 },
  { type: 'screen', x: 1095, y: 40 },
  { type: 'rect', x: 894, y: 50, w: 24, h: 4, color: '#22d3ee', rx: 1 },
  { type: 'rect', x: 894, y: 65, w: 24, h: 4, color: '#22d3ee', rx: 1 },
  { type: 'rect', x: 942, y: 50, w: 24, h: 4, color: '#4ade80', rx: 1 },
  { type: 'rect', x: 942, y: 65, w: 24, h: 4, color: '#4ade80', rx: 1 },
  { type: 'rect', x: 990, y: 50, w: 24, h: 4, color: '#f87171', rx: 1 },
  { type: 'rect', x: 990, y: 65, w: 24, h: 4, color: '#facc15', rx: 1 },
  { type: 'rect',  x: 370, y: 310, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 390, y: 305 }, { type: 'chair', x: 414, y: 372 },
  { type: 'rect',  x: 480, y: 310, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 500, y: 305 }, { type: 'chair', x: 524, y: 372 },
  { type: 'rect',  x: 590, y: 310, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 610, y: 305 }, { type: 'chair', x: 634, y: 372 },
  { type: 'rect',  x: 700, y: 310, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 720, y: 305 }, { type: 'chair', x: 744, y: 372 },
  { type: 'rect',  x: 370, y: 410, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 390, y: 420 }, { type: 'chair', x: 414, y: 398 },
  { type: 'rect',  x: 480, y: 410, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 500, y: 420 }, { type: 'chair', x: 524, y: 398 },
  { type: 'rect',  x: 590, y: 410, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 610, y: 420 }, { type: 'chair', x: 634, y: 398 },
  { type: 'rect',  x: 700, y: 410, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 720, y: 420 }, { type: 'chair', x: 744, y: 398 },
  { type: 'rect',  x: 700, y: 510, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 720, y: 505 }, { type: 'chair', x: 744, y: 572 },
  { type: 'rect',  x: 800, y: 510, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 820, y: 505 }, { type: 'chair', x: 844, y: 572 },
  { type: 'plant', x: 348, y: 280, r: 14 }, { type: 'plant', x: 810, y: 280, r: 14 },
  { type: 'plant', x: 810, y: 470, r: 14 }, { type: 'plant', x: 348, y: 480, r: 14 },
  { type: 'rect',  x: 30,  y: 540, w: 130, h: 38, color: '#d97706', rx: 8 },
  { type: 'rect',  x: 30,  y: 578, w: 38,  h: 80, color: '#d97706', rx: 8 },
  { type: 'rect',  x: 90,  y: 620, w: 80,  h: 45, color: '#92400e', rx: 4 },
  { type: 'plant', x: 265, y: 510, r: 14 }, { type: 'plant', x: 265, y: 650, r: 14 },
  { type: 'plant', x: 30,  y: 650, r: 12 },
  { type: 'rect',  x: 960, y: 512, w: 90, h: 60, color: '#9ca3af', rx: 4 },
  { type: 'rect',  x: 1065, y: 512, w: 100, h: 55, color: '#9ca3af', rx: 4 },
  { type: 'rect',  x: 960, y: 590, w: 205, h: 25, color: '#b0b8c4', rx: 2 },
  { type: 'plant', x: 1165, y: 490, r: 12 },
];

const DOOR_ARCS = [
  [276, 261, 40, -Math.PI / 2, 0],
  [543, 228, 43, -Math.PI / 2, 0],
  [863, 155, 70, 0, Math.PI / 2],
  [240, 487, 56, Math.PI, Math.PI * 1.5],
  [937, 570, 65, 0, Math.PI / 2],
];

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawPlant(ctx, x, y, r) {
  ctx.beginPath(); ctx.ellipse(x + 2, y + r + 2, r * 0.5, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
  ctx.beginPath(); ctx.rect(x - r * 0.45, y + r * 0.45, r * 0.9, r * 0.6);
  ctx.fillStyle = '#9a5c38'; ctx.fill();
  for (const [ox, oy, or_, col] of [
    [0, -r * 0.1, r * 0.85, '#2d7a3a'],
    [-r * 0.45, -r * 0.2, r * 0.6, '#3a9e4a'],
    [r * 0.45, -r * 0.15, r * 0.6, '#25693c'],
    [0, -r * 0.55, r * 0.55, '#44b85a'],
  ]) {
    ctx.beginPath(); ctx.arc(x + ox, y + oy, or_, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
  }
}

function drawRoundRect(ctx, x, y, w, h, r = 4) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawScreen(ctx, x, y) {
  ctx.fillStyle = '#0f172a'; ctx.fillRect(x - 14, y, 28, 18);
  ctx.fillStyle = '#1e3a5f'; ctx.fillRect(x - 12, y + 1, 24, 15);
  ctx.fillStyle = '#38bdf8'; ctx.fillRect(x - 9, y + 4, 18, 2);
  ctx.fillStyle = '#7dd3fc'; ctx.fillRect(x - 9, y + 8, 12, 2);
  ctx.fillStyle = '#4b5563'; ctx.fillRect(x - 3, y + 18, 6, 5);
  ctx.fillRect(x - 8, y + 23, 16, 3);
}

function drawFurniture(ctx) {
  for (const f of FURNITURE) {
    if (f.type === 'rect') {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
      drawRoundRect(ctx, f.x, f.y, f.w, f.h, f.rx ?? 3);
      ctx.fillStyle = f.color; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    } else if (f.type === 'chair') {
      ctx.beginPath(); ctx.arc(f.x, f.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#7c6050'; ctx.fill();
      ctx.strokeStyle = '#5a4038'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(f.x, f.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#a07860'; ctx.fill();
    } else if (f.type === 'plant') {
      drawPlant(ctx, f.x, f.y, f.r ?? 14);
    } else if (f.type === 'screen') {
      drawScreen(ctx, f.x, f.y);
    }
  }
}

function drawOffice(ctx) {
  ctx.fillStyle = '#1e2030'; ctx.fillRect(0, 0, W, H);
  for (const rf of ROOM_FLOORS) { ctx.fillStyle = rf.color; ctx.fillRect(rf.x, rf.y, rf.w, rf.h); }
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
  for (let gx = 18; gx < W - 18; gx += 36) {
    ctx.beginPath(); ctx.moveTo(gx, 18); ctx.lineTo(gx, H - 18); ctx.stroke();
  }
  for (let gy = 18; gy < H - 18; gy += 36) {
    ctx.beginPath(); ctx.moveTo(18, gy); ctx.lineTo(W - 18, gy); ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (const lbl of ROOM_LABELS) {
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillText(lbl.text.toUpperCase(), lbl.x, lbl.y);
  }
  drawFurniture(ctx);
  ctx.fillStyle = '#2c3050';
  for (const w of WALLS) ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (const w of WALLS) ctx.fillRect(w.x, w.y, w.w, 1);
  ctx.strokeStyle = 'rgba(100,140,200,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  for (const [cx, cy, rad, sa, ea] of DOOR_ARCS) {
    ctx.beginPath(); ctx.arc(cx, cy, rad, sa, ea); ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ─── Collision ────────────────────────────────────────────────────────────────
function collidesWithWall(nx, ny, walls) {
  for (const w of walls) {
    const cx = Math.max(w.x, Math.min(nx, w.x + w.w));
    const cy = Math.max(w.y, Math.min(ny, w.y + w.h));
    if ((nx - cx) ** 2 + (ny - cy) ** 2 < R * R) return true;
  }
  return false;
}

// ─── Avatar drawing with Audio Visualizers ─────────────────────────────────────
function drawAvatar(ctx, x, y, color, username, moving, isMe = false, isMuted = false, isSpeaking = false, volumeGain = 0, voiceIntensity = 0) {
  // Proximity earshot ring (only drawn around local player)
  if (isMe) {
    ctx.beginPath();
    ctx.arc(x, y, MAX_DISTANCE, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Soft audio range gradient
    const grad = ctx.createRadialGradient(x, y, 15, x, y, MAX_DISTANCE);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.05)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, MAX_DISTANCE, 0, Math.PI * 2);
    ctx.fill();
  }

  // Drop shadow
  ctx.beginPath(); ctx.ellipse(x + 2, y + 5, R, R * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();

  // Moving glow
  if (moving) {
    ctx.beginPath(); ctx.arc(x, y, R + 5, 0, Math.PI * 2);
    ctx.fillStyle = color + '25'; ctx.fill();
  }

  // Speaking sound waves (pulsing green aura scaled by voice intensity)
  if ((isSpeaking || voiceIntensity > 0.04) && !isMuted) {
    const intensityFactor = Math.max(0.1, voiceIntensity);
    const pulseRadius = R + 5 + intensityFactor * 16;

    ctx.beginPath();
    ctx.arc(x, y, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(34, 197, 94, ${0.4 + intensityFactor * 0.6})`;
    ctx.lineWidth = 2 + intensityFactor * 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, pulseRadius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(34, 197, 94, ${0.2 + intensityFactor * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // "Me" outer white ring
  if (isMe) {
    ctx.beginPath(); ctx.arc(x, y, R + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  }

  // Avatar circle
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.7)';
  ctx.lineWidth = isMe ? 2.5 : 1.5; ctx.stroke();

  // Inner face highlight
  ctx.beginPath(); ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();

  // Name tag with mic indicator and live equalizer bars
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  const isActuallySpeaking = !isMuted && (isSpeaking || voiceIntensity > 0.04);
  const micIcon = isMuted ? '🔇' : (isActuallySpeaking ? '🗣️' : '🎙️');
  const label = isMe ? `${username} (you)` : username;
  const fullTag = `${micIcon} ${label}`;
  const tw = ctx.measureText(fullTag).width;
  const extraForEq = !isMuted ? 16 : 0;
  const px = 8, tagX = x - (tw + extraForEq) / 2 - px, tagY = y - R - 28;
  const tagW = tw + extraForEq + px * 2, tagH = 22;

  ctx.fillStyle = isMe ? 'rgba(15,17,23,0.92)' : 'rgba(15,17,23,0.78)';
  drawRoundRect(ctx, tagX, tagY, tagW, tagH, 6);
  ctx.fill();

  if (isActuallySpeaking) {
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.fillStyle = isMe ? '#ffffff' : '#cbd5e1';
  ctx.fillText(fullTag, x - extraForEq / 2, tagY + tagH - 6);

  // 3-bar voice intensity equalizer
  if (!isMuted) {
    const eqX = tagX + tagW - 18;
    const eqCenterY = tagY + tagH / 2;
    for (let b = 0; b < 3; b++) {
      const thresh = (b + 1) * 0.2;
      const barH = voiceIntensity >= thresh ? 5 + b * 2.5 : 2;
      ctx.fillStyle = voiceIntensity >= thresh ? '#22c55e' : 'rgba(148, 163, 184, 0.35)';
      ctx.fillRect(eqX + b * 4, eqCenterY - barH / 2, 2.5, barH);
    }
  }

  // Volume indicator for remote peers within earshot
  if (!isMe && volumeGain > 0.05) {
    const volPct = Math.round(volumeGain * 100);
    ctx.font = '500 10px Inter, sans-serif';
    ctx.fillStyle = isActuallySpeaking ? '#22c55e' : '#10b981';
    ctx.fillText(`🔊 ${volPct}%`, x, y + R + 15);
  }
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WorldCanvas({ username, avatarColor = '#3b82f6' }) {
  const canvasRef   = useRef(null);
  const stateRef    = useRef({ x: 620, y: 390, keys: {}, moving: false });
  const peersRef    = useRef({}); // { socketId: { x, y, username, avatarColor, isMuted } }
  const peerVolumesRef = useRef({}); // peerId -> volume
  const peerIntensitiesRef = useRef({}); // peerId -> voiceIntensity
  const localIntensityRef = useRef(0);
  const rafRef      = useRef(null);
  const socketRef   = useRef(null);
  const lastEmitRef = useRef(0);

  // Audio & Mic States
  const [micActive, setMicActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [localIntensityState, setLocalIntensityState] = useState(0);
  const [inEarshotCount, setInEarshotCount] = useState(0);

  const isMutedRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const renderRef = useRef(null);
  const offscreenRef = useRef(null);

  // Render loop (reads from refs so it never changes identity when mute/speech states update)
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;

    // 1. Static office layer
    if (offscreenRef.current) {
      ctx.drawImage(offscreenRef.current, 0, 0);
    }

    // 2. Draw remote peers
    for (const [peerId, peer] of Object.entries(peersRef.current)) {
      const vol = peerVolumesRef.current[peerId] || 0;
      const intensity = peerIntensitiesRef.current[peerId] || 0;
      const peerSpeaking = intensity > 0.05;
      drawAvatar(
        ctx,
        peer.x,
        peer.y,
        peer.avatarColor,
        peer.username,
        false,
        false,
        peer.isMuted ?? false,
        peerSpeaking,
        vol,
        intensity
      );
    }

    // 3. Draw local avatar on top with live voice intensity
    const myIntensity = localIntensityRef.current;
    drawAvatar(
      ctx,
      s.x,
      s.y,
      avatarColor,
      username,
      s.moving,
      true,
      isMutedRef.current,
      isSpeakingRef.current,
      1,
      myIntensity
    );

    // 4. Movement guide bottom-left
    const userCount = Object.keys(peersRef.current).length + 1;
    ctx.fillStyle = 'rgba(15,17,23,0.75)';
    drawRoundRect(ctx, 16, H - 50, 270, 34, 6);
    ctx.fill();
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('W A S D  /  ↑ ↓ ← →  to move', 26, H - 32);
    ctx.fillStyle = '#64748b';
    ctx.fillText(`👥 ${userCount} user${userCount !== 1 ? 's' : ''} in room`, 26, H - 18);

    // 5. Connection indicator bottom-right
    const connected = socketRef.current?.connected;
    ctx.beginPath(); ctx.arc(W - 24, H - 24, 7, 0, Math.PI * 2);
    ctx.fillStyle = connected ? '#22c55e' : '#ef4444'; ctx.fill();
    ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'right';
    ctx.fillStyle = connected ? '#86efac' : '#fca5a5';
    ctx.fillText(connected ? 'Connected' : 'Offline', W - 36, H - 20);
  }, [username, avatarColor]);

  renderRef.current = render;

  // Audio Control Handlers
  const handleToggleMic = async () => {
    spatialAudio.ensureContext();

    if (!micActive) {
      try {
        await webrtc.startMicrophone();
        setMicActive(true);
        isMutedRef.current = false;
        setIsMuted(false);
      } catch (err) {
        alert('Microphone permission required for voice audio. Please allow microphone access in your browser settings.');
      }
    } else {
      const newMuted = webrtc.toggleMute(ROOM_ID);
      isMutedRef.current = newMuted;
      setIsMuted(newMuted);
    }
  };

  const handleToggleDeafen = () => {
    spatialAudio.ensureContext();
    const nextDeafened = !isDeafened;
    spatialAudio.setDeafened(nextDeafened);
    setIsDeafened(nextDeafened);
  };

  // ── Voice intensity polling (decoupled from RAF loop) ─────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const v = webrtc.getLocalVoiceIntensity();
      localIntensityRef.current = v;
      setLocalIntensityState(v);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.focus();

    // ── Pre-render static office ───────────────────────────────────────────
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    drawOffice(offscreen.getContext('2d'));
    offscreenRef.current = offscreen;

    // ── Socket.io connection ───────────────────────────────────────────────
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      timeout: 20000,
    });
    socketRef.current = socket;

    // Initialize WebRTC signaling
    webrtc.init(socket, {
      onRemoteTrack: (peerId, stream) => {
        spatialAudio.attachPeerStream(peerId, stream);
      },
      onMuteStatus: (peerId, peerIsMuted) => {
        if (peersRef.current[peerId]) {
          peersRef.current[peerId].isMuted = peerIsMuted;
        }
      },
      onVoiceActivity: (speaking) => {
        isSpeakingRef.current = speaking;
        setIsSpeaking(speaking);
      },
    });

    // Keep Render free tier awake
    const keepAliveTimer = setInterval(() => {
      if (SERVER_URL) {
        fetch(`${SERVER_URL}/health`).catch(() => {});
      }
    }, 2 * 60 * 1000);

    // Auto-resume AudioContext on first user click or keypress
    const unlockAudio = () => {
      spatialAudio.ensureContext();
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    socket.on('connect', () => {
      console.log('[Socket] connected:', socket.id);
      socket.emit('join-room', { username, avatarColor, roomId: ROOM_ID });
    });

    // Populate existing peers and initiate WebRTC connections (new joiner initiates to existing peers)
    socket.on('room-state', ({ selfId, users }) => {
      peersRef.current = {};
      for (const u of users) {
        if (u.id !== selfId) {
          peersRef.current[u.id] = {
            x: u.x,
            y: u.y,
            username: u.username,
            avatarColor: u.avatarColor,
            isMuted: u.isMuted ?? false,
          };
          webrtc.connectToPeer(u.id);
        }
      }
    });

    // Existing user gets notified of new peer (waits for new peer's offer to avoid collision)
    socket.on('user-joined', ({ id, username: uname, avatarColor: ucolor, x, y, isMuted: peerMuted }) => {
      peersRef.current[id] = {
        x,
        y,
        username: uname,
        avatarColor: ucolor,
        isMuted: peerMuted ?? false,
      };
      // Prepare peer connection in responder mode
      webrtc.getOrCreatePeer(id, false);
    });

    // Peer moves
    socket.on('user-moved', ({ id, x, y }) => {
      if (peersRef.current[id]) {
        peersRef.current[id].x = x;
        peersRef.current[id].y = y;
      }
    });

    // Peer mute status changed
    socket.on('user-mute-status', ({ id, isMuted: peerMuted }) => {
      if (peersRef.current[id]) {
        peersRef.current[id].isMuted = peerMuted;
      }
    });

    // Peer leaves
    socket.on('user-left', ({ id }) => {
      delete peersRef.current[id];
      delete peerVolumesRef.current[id];
      webrtc.removePeer(id);
      spatialAudio.removePeerStream(id);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] disconnected');
    });

    // Keyboard handlers
    const onKeyDown = (e) => {
      stateRef.current.keys[e.key] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => {
      stateRef.current.keys[e.key] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── 60 FPS Game & Spatial Audio Loop ──────────────────────────────────
    function tick() {
      const s = stateRef.current;
      const k = s.keys;
      let dx = 0, dy = 0;
      if (k['ArrowUp']    || k['w'] || k['W']) dy -= SPEED;
      if (k['ArrowDown']  || k['s'] || k['S']) dy += SPEED;
      if (k['ArrowLeft']  || k['a'] || k['A']) dx -= SPEED;
      if (k['ArrowRight'] || k['d'] || k['D']) dx += SPEED;

      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      s.moving = dx !== 0 || dy !== 0;

      const prevX = s.x, prevY = s.y;
      if (dx && !collidesWithWall(s.x + dx, s.y, WALLS)) s.x += dx;
      if (dy && !collidesWithWall(s.x, s.y + dy, WALLS)) s.y += dy;

      // Update Web Audio distance attenuation based on current positions
      const { inEarshotCount: currentInEarshot, peerVolumes, peerIntensities } = spatialAudio.updatePositions(s, peersRef.current);
      peerVolumesRef.current = peerVolumes;
      peerIntensitiesRef.current = peerIntensities || {};
      setInEarshotCount(currentInEarshot);

      const now = Date.now();
      if ((s.x !== prevX || s.y !== prevY) && now - lastEmitRef.current >= MOVE_THROTTLE_MS) {
        socket.emit('move', { x: s.x, y: s.y, roomId: ROOM_ID });
        lastEmitRef.current = now;
      }

      if (renderRef.current) {
        renderRef.current();
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      cancelAnimationFrame(rafRef.current);
      clearInterval(keepAliveTimer);
      socket.disconnect();
      webrtc.closeAll();
      spatialAudio.destroy();
    };
  }, [username, avatarColor]);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', padding:'16px' }}>
      {/* Top Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'24px' }}>🎙️</span>
          <h2 style={{ fontWeight:700, fontSize:'20px', color:'#f8fafc', letterSpacing:'-0.02em' }}>
            ProxiSpeak — Virtual Office
          </h2>
        </div>
        <div style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:'20px',
          padding:'5px 16px', fontSize:'13px', color:'#94a3b8', display:'flex', alignItems:'center', gap:'8px' }}>
          <span>Logged in as</span>
          <span style={{ color: avatarColor, fontWeight: 600 }}>{username}</span>
        </div>
      </div>

      {/* Canvas Area with Floating HUD Controls */}
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          tabIndex={0}
          style={{
            display:'block',
            borderRadius:'12px',
            outline:'none',
            border:'2px solid #1e293b',
            boxShadow:'0 24px 60px rgba(0,0,0,0.6)',
            cursor:'none',
            maxWidth:'100%',
          }}
        />

        {/* Floating Glassmorphic Audio Controls HUD */}
        <div
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(12px)',
            padding: '8px 18px',
            borderRadius: '40px',
            border: '1px solid rgba(51, 65, 85, 0.7)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
            zIndex: 10,
          }}
        >
          {/* Microphone Toggle Button */}
          <button
            onClick={handleToggleMic}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '25px',
              border: 'none',
              background: !micActive
                ? '#2563eb'
                : isMuted
                ? '#ef4444'
                : '#10b981',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: isSpeaking && !isMuted ? '0 0 15px rgba(34, 197, 94, 0.6)' : 'none',
            }}
            title={!micActive ? 'Click to grant microphone access' : isMuted ? 'Click to Unmute' : 'Click to Mute'}
          >
            <span style={{ fontSize: '15px' }}>
              {!micActive ? '🎙️' : isMuted ? '🔇' : (isSpeaking ? '🗣️' : '🎙️')}
            </span>
            <span>
              {!micActive ? 'Enable Mic' : isMuted ? 'Muted' : (isSpeaking ? 'Speaking...' : 'Mic On')}
            </span>
          </button>

          {/* Live Mic Voice Intensity Meter */}
          {micActive && !isMuted && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '20px',
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(51, 65, 85, 0.6)',
              }}
              title="Live voice intensity level"
            >
              <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>VOICE</span>
              <div style={{ width: '40px', height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.round(localIntensityState * 100)}%`,
                    height: '100%',
                    background: localIntensityState > 0.6 ? '#f59e0b' : '#22c55e',
                    transition: 'width 0.05s ease-out',
                  }}
                />
              </div>
            </div>
          )}

          {/* Deafen Toggle Button */}
          <button
            onClick={handleToggleDeafen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '25px',
              border: '1px solid #334155',
              background: isDeafened ? '#ef4444' : '#1e293b',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            title={isDeafened ? 'Click to un-deafen' : 'Click to mute all incoming audio'}
          >
            <span>{isDeafened ? '🔕' : '🎧'}</span>
            <span>{isDeafened ? 'Deafened' : 'Audio On'}</span>
          </button>

          {/* In-Earshot Proximity Counter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '6px 14px',
              borderRadius: '20px',
              background: 'rgba(30, 41, 59, 0.7)',
              fontSize: '12px',
              color: '#cbd5e1',
              border: '1px solid rgba(51, 65, 85, 0.5)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: inEarshotCount > 0 ? '#10b981' : '#64748b',
                boxShadow: inEarshotCount > 0 ? '0 0 8px #10b981' : 'none',
              }}
            />
            <span>{inEarshotCount} in earshot</span>
          </div>

          {/* Proximity Distance Hint */}
          <div style={{ fontSize: '11px', color: '#64748b', paddingLeft: '4px' }}>
            🔊 Distance attenuation active
          </div>
        </div>
      </div>
    </div>
  );
}
