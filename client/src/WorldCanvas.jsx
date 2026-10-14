import { useRef, useEffect } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 1200;
const H = 680;
const SPEED = 2.8;
const R = 14; // avatar radius

// ─── Office Layout ────────────────────────────────────────────────────────────

// Room floor zones drawn before walls (gives them their colour)
const ROOM_FLOORS = [
  // Main open workspace (whole inner area, neutral)
  { x: 18, y: 18, w: W - 36, h: H - 36, color: '#f0ede8' },

  // ── Top-left: Meeting Room
  { x: 18, y: 18, w: 298, h: 248, color: '#ddedf7' },

  // ── Top-center: Manager's Office
  { x: 358, y: 18, w: 228, h: 215, color: '#f7f0e0' },

  // ── Top-right: Server / Tech Room
  { x: 868, y: 18, w: 314, h: 225, color: '#e0f0e8' },

  // ── Bottom-left: Lounge & Break
  { x: 18, y: 492, w: 278, h: H - 510, color: '#fff4e0' },

  // ── Bottom-right: Print / Copy
  { x: 942, y: 490, w: 240, h: H - 508, color: '#f0e8f8' },
];

// Room label definitions
const ROOM_LABELS = [
  { text: 'Meeting Room',     x: 167, y: 40 },
  { text: "Manager's Office", x: 472, y: 40 },
  { text: 'Tech / Server',    x: 1025, y: 40 },
  { text: 'Lounge & Break',   x: 157, y: 515 },
  { text: 'Print / Copy',     x: 1062, y: 512 },
  { text: 'Open Workspace',   x: 630, y: 318 },
];

// Walls — solid rectangles; avatar cannot enter these
const WALLS = [
  // ── Outer boundary ──────────────────────────────────────────────
  { x: 10,      y: 10,     w: W - 20, h: 8   }, // top
  { x: 10,      y: 10,     w: 8,      h: H-20 }, // left
  { x: W - 18,  y: 10,     w: 8,      h: H-20 }, // right
  { x: 10,      y: H - 18, w: W - 20, h: 8   }, // bottom

  // ── Meeting Room (top-left 18→316 × 18→266) ─────────────────────
  // Right wall: full height minus door gap (door at bottom: y 206→266)
  { x: 313, y: 18,  w: 8, h: 188 },
  // Bottom wall: full width minus door gap (door at right: x 276→316)
  { x: 18,  y: 261, w: 258, h: 8 },

  // ── Manager's Office (top-center 358→586 × 18→233) ──────────────
  // Left divider wall
  { x: 353, y: 18, w: 8, h: 215 },
  // Right wall
  { x: 583, y: 18, w: 8, h: 215 },
  // Bottom wall with door gap (right side: x 543→586)
  { x: 361, y: 228, w: 182, h: 8 },

  // ── Server Room (top-right 868→1182 × 18→243) ───────────────────
  // Left wall with door gap (bottom portion: y 155→243)
  { x: 863, y: 18,  w: 8, h: 137 },
  // Bottom wall full
  { x: 871, y: 238, w: 311, h: 8 },

  // ── Lounge (bottom-left 18→296 × 492→H-18) ──────────────────────
  // Top wall with door gap at right (x 240→296)
  { x: 18,  y: 487, w: 222, h: 8 },
  // Right wall full
  { x: 291, y: 487, w: 8,   h: H - 505 },

  // ── Print Room (bottom-right 942→1182 × 490→H-18) ───────────────
  // Left wall with door gap (y 570→635)
  { x: 937, y: 490, w: 8, h: 80 },
  // Top wall full
  { x: 945, y: 485, w: 237, h: 8 },

  // ── Interior corridor divider (separates top offices from open floor)
  // Short pillar left of server room entry
  { x: 863, y: 155, w: 8, h: 8 },
];

// ─── Furniture ────────────────────────────────────────────────────────────────

// Each item: type, position, dimensions, color
// Plants: type='plant'
// Tables/desks: type='rect'
// Chairs: type='chair' (small circle)
// Screens: type='screen'

const FURNITURE = [
  // ── Meeting Room: large conference table + chairs ──────────────────
  { type: 'rect',   x: 55,  y: 80,  w: 200, h: 100, color: '#b5896a', rx: 6 },
  { type: 'chair',  x: 85,  y: 68 },
  { type: 'chair',  x: 145, y: 68 },
  { type: 'chair',  x: 205, y: 68 },
  { type: 'chair',  x: 85,  y: 192 },
  { type: 'chair',  x: 145, y: 192 },
  { type: 'chair',  x: 205, y: 192 },
  { type: 'chair',  x: 42,  y: 130 },
  { type: 'chair',  x: 268, y: 130 },
  { type: 'plant',  x: 290, y: 40,  r: 13 },
  { type: 'plant',  x: 290, y: 240, r: 13 },

  // ── Manager's Office: L-desk + screen ─────────────────────────────
  { type: 'rect',   x: 375, y: 55,  w: 170, h: 55,  color: '#b5896a', rx: 4 },
  { type: 'rect',   x: 375, y: 55,  w: 55,  h: 100, color: '#b5896a', rx: 4 },
  { type: 'screen', x: 455, y: 50 },
  { type: 'chair',  x: 460, y: 125 },
  { type: 'plant',  x: 560, y: 50,  r: 14 },
  { type: 'plant',  x: 365, y: 215, r: 11 },

  // ── Server Room: server rack columns ──────────────────────────────
  { type: 'rect', x: 890, y: 35, w: 32, h: 185, color: '#4a5568', rx: 2 },
  { type: 'rect', x: 938, y: 35, w: 32, h: 185, color: '#4a5568', rx: 2 },
  { type: 'rect', x: 986, y: 35, w: 32, h: 185, color: '#4a5568', rx: 2 },
  { type: 'rect', x: 1055, y: 45, w: 115, h: 80, color: '#5a6577', rx: 3 }, // workstation
  { type: 'screen', x: 1095, y: 40 },
  // LED lights on racks (decorative rects)
  { type: 'rect', x: 894, y: 50, w: 24, h: 4, color: '#22d3ee', rx: 1 },
  { type: 'rect', x: 894, y: 65, w: 24, h: 4, color: '#22d3ee', rx: 1 },
  { type: 'rect', x: 942, y: 50, w: 24, h: 4, color: '#4ade80', rx: 1 },
  { type: 'rect', x: 942, y: 65, w: 24, h: 4, color: '#4ade80', rx: 1 },
  { type: 'rect', x: 990, y: 50, w: 24, h: 4, color: '#f87171', rx: 1 },
  { type: 'rect', x: 990, y: 65, w: 24, h: 4, color: '#facc15', rx: 1 },

  // ── Open Workspace: 2×4 desk cluster (left cluster) ───────────────
  { type: 'rect',  x: 370, y: 310, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 390, y: 305 },
  { type: 'chair', x: 414, y: 372 },

  { type: 'rect',  x: 480, y: 310, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 500, y: 305 },
  { type: 'chair', x: 524, y: 372 },

  { type: 'rect',  x: 590, y: 310, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 610, y: 305 },
  { type: 'chair', x: 634, y: 372 },

  { type: 'rect',  x: 700, y: 310, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 720, y: 305 },
  { type: 'chair', x: 744, y: 372 },

  // Second row of desks (facing opposite)
  { type: 'rect',  x: 370, y: 410, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 390, y: 420 },
  { type: 'chair', x: 414, y: 398 },

  { type: 'rect',  x: 480, y: 410, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 500, y: 420 },
  { type: 'chair', x: 524, y: 398 },

  { type: 'rect',  x: 590, y: 410, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 610, y: 420 },
  { type: 'chair', x: 634, y: 398 },

  { type: 'rect',  x: 700, y: 410, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 720, y: 420 },
  { type: 'chair', x: 744, y: 398 },

  // Right cluster (near server room)
  { type: 'rect',  x: 700, y: 510, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 720, y: 505 },
  { type: 'chair', x: 744, y: 572 },

  { type: 'rect',  x: 800, y: 510, w: 88, h: 50, color: '#c9a67a', rx: 3 },
  { type: 'screen',x: 820, y: 505 },
  { type: 'chair', x: 844, y: 572 },

  // Plants in open area
  { type: 'plant', x: 348, y: 280, r: 14 },
  { type: 'plant', x: 810, y: 280, r: 14 },
  { type: 'plant', x: 810, y: 470, r: 14 },
  { type: 'plant', x: 348, y: 480, r: 14 },

  // ── Lounge: sofa + coffee table ────────────────────────────────────
  { type: 'rect',  x: 30,  y: 540, w: 130, h: 38, color: '#d97706', rx: 8 }, // main sofa
  { type: 'rect',  x: 30,  y: 578, w: 38,  h: 80, color: '#d97706', rx: 8 }, // left arm
  { type: 'rect',  x: 90,  y: 620, w: 80,  h: 45, color: '#92400e', rx: 4 }, // coffee table
  { type: 'plant', x: 265, y: 510, r: 14 },
  { type: 'plant', x: 265, y: 650, r: 14 },
  { type: 'plant', x: 30,  y: 650, r: 12 },

  // ── Print Room: printer + shelves ─────────────────────────────────
  { type: 'rect',  x: 960, y: 512, w: 90, h: 60, color: '#9ca3af', rx: 4 }, // printer
  { type: 'rect',  x: 1065, y: 512, w: 100, h: 55, color: '#9ca3af', rx: 4 }, // copier
  { type: 'rect',  x: 960, y: 590, w: 205, h: 25, color: '#b0b8c4', rx: 2 }, // shelf
  { type: 'plant', x: 1165, y: 490, r: 12 },
];

// Door swing arcs: [cx, cy, radius, startAngle, endAngle]
const DOOR_ARCS = [
  // Meeting room — bottom-right corner
  [276, 261, 40, -Math.PI / 2, 0],
  // Manager — bottom-right
  [543, 228, 43, -Math.PI / 2, 0],
  // Server room — left wall, bottom of gap
  [863, 155, 70, 0, Math.PI / 2],
  // Lounge — top wall, right end
  [240, 487, 56, Math.PI, Math.PI * 1.5],
  // Print room — left wall, bottom of gap
  [937, 570, 65, 0, Math.PI / 2],
];

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawPlant(ctx, x, y, r) {
  // Shadow
  ctx.beginPath(); ctx.ellipse(x + 2, y + r + 2, r * 0.5, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
  // Pot
  ctx.beginPath(); ctx.rect(x - r * 0.45, y + r * 0.45, r * 0.9, r * 0.6);
  ctx.fillStyle = '#9a5c38'; ctx.fill();
  // Foliage circles
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
  // Monitor
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x - 14, y, 28, 18);
  ctx.fillStyle = '#1e3a5f';
  ctx.fillRect(x - 12, y + 1, 24, 15);
  // Screen glow lines
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(x - 9, y + 4, 18, 2);
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(x - 9, y + 8, 12, 2);
  // Stand
  ctx.fillStyle = '#4b5563';
  ctx.fillRect(x - 3, y + 18, 6, 5);
  ctx.fillRect(x - 8, y + 23, 16, 3);
}

function drawFurniture(ctx) {
  for (const f of FURNITURE) {
    if (f.type === 'rect') {
      // Drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      drawRoundRect(ctx, f.x, f.y, f.w, f.h, f.rx ?? 3);
      ctx.fillStyle = f.color;
      ctx.fill();
      // Highlight edge
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else if (f.type === 'chair') {
      ctx.beginPath(); ctx.arc(f.x, f.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#7c6050'; ctx.fill();
      ctx.strokeStyle = '#5a4038'; ctx.lineWidth = 1.5; ctx.stroke();
      // seat cushion
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
  // 1. Outer dark surround
  ctx.fillStyle = '#1e2030';
  ctx.fillRect(0, 0, W, H);

  // 2. Room floors
  for (const rf of ROOM_FLOORS) {
    ctx.fillStyle = rf.color;
    ctx.fillRect(rf.x, rf.y, rf.w, rf.h);
  }

  // 3. Subtle floor grid on neutral floor only
  ctx.strokeStyle = 'rgba(0,0,0,0.05)';
  ctx.lineWidth = 1;
  for (let gx = 18; gx < W - 18; gx += 36) {
    ctx.beginPath(); ctx.moveTo(gx, 18); ctx.lineTo(gx, H - 18); ctx.stroke();
  }
  for (let gy = 18; gy < H - 18; gy += 36) {
    ctx.beginPath(); ctx.moveTo(18, gy); ctx.lineTo(W - 18, gy); ctx.stroke();
  }

  // 4. Room labels
  ctx.textAlign = 'center';
  for (const lbl of ROOM_LABELS) {
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillText(lbl.text.toUpperCase(), lbl.x, lbl.y);
  }

  // 5. Furniture
  drawFurniture(ctx);

  // 6. Walls
  ctx.fillStyle = '#2c3050';
  for (const w of WALLS) ctx.fillRect(w.x, w.y, w.w, w.h);

  // Wall highlight (top edge of each wall = lighter)
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (const w of WALLS) ctx.fillRect(w.x, w.y, w.w, 1);

  // 7. Door arcs (swing indicators)
  ctx.strokeStyle = 'rgba(100,140,200,0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (const [cx, cy, rad, sa, ea] of DOOR_ARCS) {
    ctx.beginPath(); ctx.arc(cx, cy, rad, sa, ea); ctx.stroke();
  }
  ctx.setLineDash([]);
}

// ─── Collision helpers ────────────────────────────────────────────────────────
function collidesWithWall(nx, ny, walls) {
  for (const w of walls) {
    const cx = Math.max(w.x, Math.min(nx, w.x + w.w));
    const cy = Math.max(w.y, Math.min(ny, w.y + w.h));
    if ((nx - cx) ** 2 + (ny - cy) ** 2 < R * R) return true;
  }
  return false;
}

// ─── Avatar drawing ───────────────────────────────────────────────────────────
function drawAvatar(ctx, x, y, color, username, moving) {
  // Proximity ring (earshot radius — 100px)
  ctx.beginPath(); ctx.arc(x, y, 100, 0, Math.PI * 2);
  ctx.strokeStyle = color + '30';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Drop shadow
  ctx.beginPath(); ctx.ellipse(x + 2, y + 5, R, R * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();

  // Body glow when moving
  if (moving) {
    ctx.beginPath(); ctx.arc(x, y, R + 5, 0, Math.PI * 2);
    ctx.fillStyle = color + '25'; ctx.fill();
  }

  // Avatar circle
  ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke();

  // Inner face highlight
  ctx.beginPath(); ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();

  // Name tag
  const label = username;
  ctx.font = '600 12px Inter, sans-serif';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(label).width;
  const px = 8, py = 4;
  const tagX = x - tw / 2 - px;
  const tagY = y - R - 26;
  const tagW = tw + px * 2;
  const tagH = 20;

  ctx.fillStyle = 'rgba(15,17,23,0.75)';
  drawRoundRect(ctx, tagX, tagY, tagW, tagH, 5);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.fillText(label, x, tagY + tagH - py - 1);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function WorldCanvas({ username, avatarColor = '#3b82f6' }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef({ x: 620, y: 390, keys: {} });
  const rafRef    = useRef(null);

  useEffect(() => {
    const onKeyDown = e => {
      const k = e.key;
      stateRef.current.keys[k] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
    };
    const onKeyUp = e => { stateRef.current.keys[e.key] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Pre-draw the static office layer onto an offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width  = W;
    offscreen.height = H;
    const offCtx = offscreen.getContext('2d');
    drawOffice(offCtx);

    function tick() {
      const s = stateRef.current;
      const k = s.keys;

      let dx = 0, dy = 0;
      if (k['ArrowUp']    || k['w'] || k['W']) dy -= SPEED;
      if (k['ArrowDown']  || k['s'] || k['S']) dy += SPEED;
      if (k['ArrowLeft']  || k['a'] || k['A']) dx -= SPEED;
      if (k['ArrowRight'] || k['d'] || k['D']) dx += SPEED;

      // Normalize diagonal
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }

      const moving = dx !== 0 || dy !== 0;

      // Axis-separated collision
      if (dx && !collidesWithWall(s.x + dx, s.y, WALLS)) s.x += dx;
      if (dy && !collidesWithWall(s.x, s.y + dy, WALLS)) s.y += dy;

      // ── Render ──────────────────────────────────────────────────
      // Blit offscreen (static) office
      ctx.drawImage(offscreen, 0, 0);

      // Avatar on top
      drawAvatar(ctx, s.x, s.y, avatarColor, username, moving);

      // HUD
      ctx.fillStyle = 'rgba(15,17,23,0.7)';
      drawRoundRect(ctx, 16, H - 44, 230, 28, 6);
      ctx.fill();
      ctx.font = '12px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'left';
      ctx.fillText('W A S D  /  ↑ ↓ ← →  to move', 26, H - 25);

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [username, avatarColor]);

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
