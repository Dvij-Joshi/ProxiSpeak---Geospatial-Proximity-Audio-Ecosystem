import { useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 1200;
const H = 680;
const SPEED = 2.8;
const R = 14; // avatar radius
const ROOM_ID = 'main-office';
// Use empty string so socket.io connects via Vite proxy (works for localhost AND network IPs)
const SERVER_URL = '';
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

// ─── Avatar drawing ───────────────────────────────────────────────────────────
function drawAvatar(ctx, x, y, color, username, moving, isMe = false) {
  // Proximity ring
  ctx.beginPath(); ctx.arc(x, y, 100, 0, Math.PI * 2);
  ctx.strokeStyle = color + '30'; ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]);

  // Drop shadow
  ctx.beginPath(); ctx.ellipse(x + 2, y + 5, R, R * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();

  // Moving glow
  if (moving) {
    ctx.beginPath(); ctx.arc(x, y, R + 5, 0, Math.PI * 2);
    ctx.fillStyle = color + '25'; ctx.fill();
  }

  // "Me" outer ring indicator
  if (isMe) {
    ctx.beginPath(); ctx.arc(x, y, R + 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  }

  // Avatar circle
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.6)';
  ctx.lineWidth = isMe ? 2.5 : 1.5; ctx.stroke();

  // Inner highlight
  ctx.beginPath(); ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();

  // Name tag
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  const label = isMe ? `${username} (you)` : username;
  const tw = ctx.measureText(label).width;
  const px = 8, tagX = x - tw / 2 - px, tagY = y - R - 26;
  const tagW = tw + px * 2, tagH = 20;
  ctx.fillStyle = isMe ? 'rgba(15,17,23,0.9)' : 'rgba(15,17,23,0.75)';
  drawRoundRect(ctx, tagX, tagY, tagW, tagH, 5); ctx.fill();
  ctx.fillStyle = isMe ? '#fff' : '#cbd5e1';
  ctx.fillText(label, x, tagY + tagH - 5);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WorldCanvas({ username, avatarColor = '#3b82f6' }) {
  const canvasRef   = useRef(null);
  const stateRef    = useRef({ x: 620, y: 390, keys: {}, moving: false });
  const peersRef    = useRef({}); // { socketId: { x, y, username, avatarColor } }
  const rafRef      = useRef(null);
  const socketRef   = useRef(null);
  const lastEmitRef = useRef(0);

  // Draw a single frame
  const offscreenRef = useRef(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;

    // Blit static office
    ctx.drawImage(offscreenRef.current, 0, 0);

    // Draw all remote peers (behind local avatar)
    for (const peer of Object.values(peersRef.current)) {
      drawAvatar(ctx, peer.x, peer.y, peer.avatarColor, peer.username, false, false);
    }

    // Draw local avatar on top
    drawAvatar(ctx, s.x, s.y, avatarColor, username, s.moving, true);

    // HUD bottom-left
    const userCount = Object.keys(peersRef.current).length + 1;
    ctx.fillStyle = 'rgba(15,17,23,0.75)';
    drawRoundRect(ctx, 16, H - 50, 270, 34, 6); ctx.fill();
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'left';
    ctx.fillText('W A S D  /  ↑ ↓ ← →  to move', 26, H - 32);
    ctx.fillStyle = '#64748b';
    ctx.fillText(`👥 ${userCount} user${userCount !== 1 ? 's' : ''} in room`, 26, H - 18);

    // Connection dot
    const connected = socketRef.current?.connected;
    ctx.beginPath(); ctx.arc(W - 24, H - 24, 7, 0, Math.PI * 2);
    ctx.fillStyle = connected ? '#22c55e' : '#ef4444'; ctx.fill();
    ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'right';
    ctx.fillStyle = connected ? '#86efac' : '#fca5a5';
    ctx.fillText(connected ? 'Connected' : 'Offline', W - 36, H - 20);
  }, [username, avatarColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.focus();

    // ── Build static offscreen ─────────────────────────────────────────────
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    drawOffice(offscreen.getContext('2d'));
    offscreenRef.current = offscreen;

    // ── Socket.io connection ───────────────────────────────────────────────
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[Socket] connected:', socket.id);
      socket.emit('join-room', { username, avatarColor, roomId: ROOM_ID });
    });

    // Initial room state — populate all existing peers
    socket.on('room-state', ({ selfId, users }) => {
      peersRef.current = {};
      for (const u of users) {
        if (u.id !== selfId) {
          peersRef.current[u.id] = { x: u.x, y: u.y, username: u.username, avatarColor: u.avatarColor };
        }
      }
    });

    // New user joined
    socket.on('user-joined', ({ id, username: uname, avatarColor: ucolor, x, y }) => {
      peersRef.current[id] = { x, y, username: uname, avatarColor: ucolor };
    });

    // Remote user moved — update their position instantly
    socket.on('user-moved', ({ id, x, y }) => {
      if (peersRef.current[id]) {
        peersRef.current[id].x = x;
        peersRef.current[id].y = y;
      }
    });

    // User left
    socket.on('user-left', ({ id }) => {
      delete peersRef.current[id];
    });

    socket.on('disconnect', () => {
      console.log('[Socket] disconnected');
    });

    // ── Keyboard handlers ─────────────────────────────────────────────────
    const onKeyDown = e => {
      stateRef.current.keys[e.key] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    };
    const onKeyUp = e => { stateRef.current.keys[e.key] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // ── Game loop ─────────────────────────────────────────────────────────
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

      // Throttled emit: only emit if position changed and throttle window passed
      const now = Date.now();
      if ((s.x !== prevX || s.y !== prevY) && now - lastEmitRef.current >= MOVE_THROTTLE_MS) {
        socket.emit('move', { x: s.x, y: s.y, roomId: ROOM_ID });
        lastEmitRef.current = now;
      }

      render();
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      cancelAnimationFrame(rafRef.current);
      socket.disconnect();
    };
  }, [username, avatarColor, render]);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', padding:'16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
        <span style={{ fontSize:'22px' }}>🎙️</span>
        <h2 style={{ fontWeight:700, fontSize:'20px', color:'#f8fafc' }}>ProxiSpeak — Virtual Office</h2>
        <div style={{ background:'#1e293b', border:'1px solid #334155', borderRadius:'20px',
          padding:'4px 14px', fontSize:'13px', color:'#64748b' }}>
          Logged in as <span style={{ color: avatarColor, fontWeight: 600 }}>{username}</span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        tabIndex={0}
        style={{
          display:'block', borderRadius:'10px', outline:'none',
          border:'2px solid #1e293b',
          boxShadow:'0 24px 60px rgba(0,0,0,0.6)',
          cursor:'none',
          maxWidth:'100%',
        }}
      />
    </div>
  );
}
