import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { spatialAudio, MAX_DISTANCE, DOORS, isDoorOpen, getRoomAt, playKnockSound, playUiChime } from './services/spatialAudio';
import { webrtc } from './services/webrtc';
import { SERVER_URL } from './config';
import { drawArchitecturalWall, drawArchitecturalDoor, drawArchitecturalZone, drawArchitecturalFurniture, drawArchitecturalSpawn } from './components/architecturalComponents';

// ─── Constants ─────────────────────────────────────────────────────────────────
const W = 2200;
const H = 1300;
const SPEED = 3.6; // Responsive movement speed for 2200x1300 world
const R = 15; // avatar radius
const MOVE_THROTTLE_MS = 50; // emit move at most every 50ms

// ─── Office Theme Layout (Expanded 2200x1300 World) ──────────────────────────
const OFFICE_FLOORS = [
  { x: 18, y: 18, w: W - 36, h: H - 36, color: '#f8fafc' },
  // Meeting Room (Top-Left)
  { x: 18, y: 18, w: 580, h: 480, color: '#e0f2fe' },
  // Manager's Office (Top-Center)
  { x: 678, y: 18, w: 450, h: 420, color: '#fef3c7' },
  // Tech / Server Lab (Top-Right)
  { x: 1620, y: 18, w: 562, h: 440, color: '#dcfce7' },
  // Lounge & Cafeteria (Bottom-Left)
  { x: 18, y: 920, w: 560, h: 362, color: '#ffedd5' },
  // Print & Design Studio (Bottom-Right)
  { x: 1720, y: 920, w: 462, h: 362, color: '#f3e8ff' },
];

const OFFICE_LABELS = [
  { text: 'Executive Boardroom', x: 300, y: 46 },
  { text: "Manager's Suite", x: 900, y: 46 },
  { text: 'Cloud Infrastructure & Server Lab', x: 1900, y: 46 },
  { text: 'Cafeteria & Lounge', x: 290, y: 948 },
  { text: 'Design & Print Studio', x: 1940, y: 948 },
  { text: 'Central Collaboration Floor', x: 1100, y: 510 },
];

const OFFICE_WALLS = [
  { x: 10, y: 10, w: W - 20, h: 8 },
  { x: 10, y: 10, w: 8, h: H - 20 },
  { x: W - 18, y: 10, w: 8, h: H - 20 },
  { x: 10, y: H - 18, w: W - 20, h: 8 },
  // Meeting Room (Top-Left)
  { x: 598, y: 18, w: 8, h: 480 },
  { x: 18, y: 498, w: 490, h: 8 },
  // Manager's Office (Top-Center)
  { x: 670, y: 18, w: 8, h: 420 },
  { x: 1128, y: 18, w: 8, h: 420 },
  { x: 678, y: 438, w: 350, h: 8 },
  // Tech / Server Room (Top-Right)
  { x: 1612, y: 18, w: 8, h: 320 },
  { x: 1620, y: 458, w: 562, h: 8 },
  // Lounge & Break (Bottom-Left)
  { x: 18, y: 912, w: 460, h: 8 },
  { x: 578, y: 920, w: 8, h: 362 },
  // Print & Copy (Bottom-Right)
  { x: 1720, y: 912, w: 462, h: 8 },
  { x: 1712, y: 920, w: 8, h: 250 },
];

const OFFICE_FURNITURE = [
  // ── Meeting Room (Top-Left): Large Boardroom Table + 10 Chairs + Screen ──
  { type: 'rect', x: 110, y: 150, w: 360, h: 180, color: '#b5896a', rx: 8 },
  { type: 'screen', x: 290, y: 46 },
  { type: 'chair', x: 160, y: 136 }, { type: 'chair', x: 230, y: 136 }, { type: 'chair', x: 300, y: 136 }, { type: 'chair', x: 370, y: 136 },
  { type: 'chair', x: 160, y: 344 }, { type: 'chair', x: 230, y: 344 }, { type: 'chair', x: 300, y: 344 }, { type: 'chair', x: 370, y: 344 },
  { type: 'chair', x: 94,  y: 240 }, { type: 'chair', x: 486, y: 240 },
  { type: 'plant', x: 540, y: 60, r: 16 }, { type: 'plant', x: 60, y: 60, r: 16 }, { type: 'plant', x: 60, y: 440, r: 16 },

  // ── Manager's Executive Suite (Top-Center): L-Desk + Executive Chair + Guest Chairs ──
  { type: 'rect', x: 740, y: 100, w: 280, h: 65, color: '#b5896a', rx: 4 },
  { type: 'rect', x: 740, y: 100, w: 65, h: 180, color: '#b5896a', rx: 4 },
  { type: 'screen', x: 880, y: 92 },
  { type: 'chair', x: 885, y: 190 }, // Manager chair
  { type: 'chair', x: 840, y: 70 },  { type: 'chair', x: 930, y: 70 }, // Guest chairs
  { type: 'plant', x: 1090, y: 55, r: 16 }, { type: 'plant', x: 705, y: 55, r: 14 },

  // ── Cloud Infrastructure & Server Lab (Top-Right): Server Racks + Console ──
  { type: 'rect', x: 1700, y: 60, w: 42, h: 260, color: '#334155', rx: 4 },
  { type: 'rect', x: 1770, y: 60, w: 42, h: 260, color: '#334155', rx: 4 },
  { type: 'rect', x: 1840, y: 60, w: 42, h: 260, color: '#334155', rx: 4 },
  { type: 'rect', x: 1910, y: 60, w: 42, h: 260, color: '#334155', rx: 4 },
  // LED Status lights on racks
  { type: 'rect', x: 1708, y: 80, w: 26, h: 4, color: '#22d3ee', rx: 1 },
  { type: 'rect', x: 1778, y: 80, w: 26, h: 4, color: '#4ade80', rx: 1 },
  { type: 'rect', x: 1848, y: 80, w: 26, h: 4, color: '#facc15', rx: 1 },
  { type: 'rect', x: 1918, y: 80, w: 26, h: 4, color: '#f87171', rx: 1 },
  // Engineering Console desk
  { type: 'rect', x: 2000, y: 80, w: 140, h: 80, color: '#475569', rx: 4 },
  { type: 'screen', x: 2070, y: 72 }, { type: 'chair', x: 2070, y: 185 },

  // ── Central Open Collaboration Floor: 6 Team Pods + Plants ──
  // Pod 1 (West Upper)
  { type: 'rect', x: 720, y: 580, w: 160, h: 80, color: '#cbd5e1', rx: 4 },
  { type: 'screen', x: 760, y: 572 }, { type: 'screen', x: 840, y: 572 },
  { type: 'chair', x: 760, y: 685 }, { type: 'chair', x: 840, y: 685 },

  // Pod 2 (East Upper)
  { type: 'rect', x: 1320, y: 580, w: 160, h: 80, color: '#cbd5e1', rx: 4 },
  { type: 'screen', x: 1360, y: 572 }, { type: 'screen', x: 1440, y: 572 },
  { type: 'chair', x: 1360, y: 685 }, { type: 'chair', x: 1440, y: 685 },

  // Pod 3 (West Middle)
  { type: 'rect', x: 720, y: 740, w: 160, h: 80, color: '#cbd5e1', rx: 4 },
  { type: 'screen', x: 760, y: 732 }, { type: 'screen', x: 840, y: 732 },
  { type: 'chair', x: 760, y: 845 }, { type: 'chair', x: 840, y: 845 },

  // Pod 4 (East Middle)
  { type: 'rect', x: 1320, y: 740, w: 160, h: 80, color: '#cbd5e1', rx: 4 },
  { type: 'screen', x: 1360, y: 732 }, { type: 'screen', x: 1440, y: 732 },
  { type: 'chair', x: 1360, y: 845 }, { type: 'chair', x: 1440, y: 845 },

  // Pod 5 (West Lower)
  { type: 'rect', x: 720, y: 900, w: 160, h: 80, color: '#cbd5e1', rx: 4 },
  { type: 'screen', x: 760, y: 892 }, { type: 'screen', x: 840, y: 892 },
  { type: 'chair', x: 760, y: 1005 }, { type: 'chair', x: 840, y: 1005 },

  // Pod 6 (East Lower)
  { type: 'rect', x: 1320, y: 900, w: 160, h: 80, color: '#cbd5e1', rx: 4 },
  { type: 'screen', x: 1360, y: 892 }, { type: 'screen', x: 1440, y: 892 },
  { type: 'chair', x: 1360, y: 1005 }, { type: 'chair', x: 1440, y: 1005 },

  // Central Aisle Plants & Feature Trees
  { type: 'plant', x: 1040, y: 620, r: 18 }, { type: 'plant', x: 1160, y: 620, r: 18 },
  { type: 'plant', x: 1040, y: 780, r: 18 }, { type: 'plant', x: 1160, y: 780, r: 18 },
  { type: 'plant', x: 1040, y: 940, r: 18 }, { type: 'plant', x: 1160, y: 940, r: 18 },

  // ── Cafeteria & Lounge (Bottom-Left): Sofas + Espresso Counter ──
  { type: 'rect', x: 60, y: 980, w: 260, h: 60, color: '#d97706', rx: 8 },
  { type: 'rect', x: 60, y: 1040, w: 60, h: 160, color: '#d97706', rx: 8 },
  { type: 'rect', x: 160, y: 1080, w: 120, h: 70, color: '#92400e', rx: 6 },
  { type: 'rect', x: 360, y: 980, w: 180, h: 50, color: '#78350f', rx: 4 }, // Bar counter
  { type: 'chair', x: 380, y: 1045 }, { type: 'chair', x: 440, y: 1045 }, { type: 'chair', x: 500, y: 1045 },
  { type: 'plant', x: 530, y: 1230, r: 18 }, { type: 'plant', x: 60, y: 1230, r: 18 },

  // ── Design & Print Studio (Bottom-Right): Plotter Benches + Tables ──
  { type: 'rect', x: 1760, y: 980, w: 180, h: 90, color: '#94a3b8', rx: 4 },
  { type: 'rect', x: 1980, y: 980, w: 160, h: 90, color: '#94a3b8', rx: 4 },
  { type: 'rect', x: 1760, y: 1120, w: 380, h: 60, color: '#cbd5e1', rx: 4 },
  { type: 'plant', x: 2130, y: 1230, r: 18 },
];

// ─── Conference & Auditorium Layout (Expanded 2200x1300 World) ──────────────
const CONF_WALLS = [
  { x: 10, y: 10, w: W - 20, h: 8 },
  { x: 10, y: 10, w: 8, h: H - 20 },
  { x: W - 18, y: 10, w: 8, h: H - 20 },
  { x: 10, y: H - 18, w: W - 20, h: 8 },
  // West Breakout Pod wall
  { x: 492, y: 18, w: 8, h: 420 },
  { x: 492, y: 560, w: 8, h: 400 },
  // East Breakout Pod wall
  { x: 1700, y: 18, w: 8, h: 420 },
  { x: 1700, y: 560, w: 8, h: 400 },
  // Stage barriers
  { x: 500, y: 310, w: 420, h: 8 },
  { x: 1280, y: 310, w: 420, h: 8 },
  // Foyer divider
  { x: 18, y: 970, w: 850, h: 8 },
  { x: 1332, y: 970, w: 850, h: 8 },
];

// ─── Rooftop Lounge Layout (Expanded 2200x1300 World) ─────────────────────────
const LOUNGE_WALLS = [
  { x: 10, y: 10, w: W - 20, h: 8 },
  { x: 10, y: 10, w: 8, h: H - 20 },
  { x: W - 18, y: 10, w: 8, h: H - 20 },
  { x: 10, y: H - 18, w: W - 20, h: 8 },
  // VIP west partition
  { x: 540, y: 18, w: 8, h: 360 },
  { x: 540, y: 520, w: 8, h: 380 },
  // Games east partition
  { x: 1660, y: 18, w: 8, h: 360 },
  { x: 1660, y: 520, w: 8, h: 380 },
  // Terrace balustrade
  { x: 18, y: 920, w: 860, h: 6 },
  { x: 1322, y: 920, w: 860, h: 6 },
];

// ─── Drawing Helpers ──────────────────────────────────────────────────────────
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

function drawRoundTable(ctx, x, y, r, chairCount = 4, tableColor = '#b5896a') {
  // Table shadow
  ctx.beginPath(); ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fill();
  // Table top
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = tableColor; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1.5; ctx.stroke();

  // Surrounding chairs
  for (let i = 0; i < chairCount; i++) {
    const angle = (i * Math.PI * 2) / chairCount;
    const cx = x + Math.cos(angle) * (r + 14);
    const cy = y + Math.sin(angle) * (r + 14);
    ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#7c6050'; ctx.fill();
    ctx.strokeStyle = '#5a4038'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#a07860'; ctx.fill();
  }
}

function drawParasol(ctx, x, y, color = '#06b6d4') {
  // Shadow
  ctx.beginPath(); ctx.ellipse(x + 4, y + 6, 28, 18, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
  // Table
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fillStyle = '#d97706'; ctx.fill();
  // Parasol canopy
  ctx.beginPath(); ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
  // Rib segments
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 26, y + Math.sin(a) * 26);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
}

// ─── Theme Renderers ──────────────────────────────────────────────────────────
function drawOffice(ctx) {
  ctx.fillStyle = '#1e2030'; ctx.fillRect(0, 0, W, H);
  for (const rf of OFFICE_FLOORS) { ctx.fillStyle = rf.color; ctx.fillRect(rf.x, rf.y, rf.w, rf.h); }
  ctx.strokeStyle = 'rgba(0,0,0,0.05)'; ctx.lineWidth = 1;
  for (let gx = 18; gx < W - 18; gx += 36) {
    ctx.beginPath(); ctx.moveTo(gx, 18); ctx.lineTo(gx, H - 18); ctx.stroke();
  }
  for (let gy = 18; gy < H - 18; gy += 36) {
    ctx.beginPath(); ctx.moveTo(18, gy); ctx.lineTo(W - 18, gy); ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (const lbl of OFFICE_LABELS) {
    ctx.font = '600 11px Inter, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillText(lbl.text.toUpperCase(), lbl.x, lbl.y);
  }
  // Furniture
  for (const f of OFFICE_FURNITURE) {
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
  // Walls
  ctx.fillStyle = '#2c3050';
  for (const w of OFFICE_WALLS) ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (const w of OFFICE_WALLS) ctx.fillRect(w.x, w.y, w.w, 1);
}

function drawConference(ctx) {
  // Base floor
  ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H);

  // Keynote Stage floor (top center)
  ctx.fillStyle = '#1e1b4b'; ctx.fillRect(288, 18, 624, 150);
  ctx.fillStyle = '#312e81'; ctx.fillRect(320, 24, 560, 138);

  // Auditorium Hall floor
  ctx.fillStyle = '#181b2e'; ctx.fillRect(288, 176, 624, 318);

  // Breakout pods (left and right)
  ctx.fillStyle = '#1e2538'; ctx.fillRect(18, 18, 262, 476);
  ctx.fillStyle = '#1e2538'; ctx.fillRect(923, 18, 259, 476);

  // Networking foyer (bottom)
  ctx.fillStyle = '#1b2034'; ctx.fillRect(18, 503, W - 36, 159);

  // Stage presentation display screen
  ctx.save();
  ctx.shadowColor = 'rgba(56, 189, 248, 0.4)'; ctx.shadowBlur = 15;
  drawRoundRect(ctx, 420, 36, 360, 32, 6);
  ctx.fillStyle = '#0369a1'; ctx.fill();
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = '700 13px Inter, sans-serif'; ctx.fillStyle = '#e0f2fe'; ctx.textAlign = 'center';
  ctx.fillText('KEYNOTE PRESENTATION • PROXISPEAK', 600, 56);
  ctx.restore();

  // Speaker podium
  drawRoundRect(ctx, 350, 92, 54, 42, 4);
  ctx.fillStyle = '#4f46e5'; ctx.fill();
  ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = '14px sans-serif'; ctx.fillText('🎙️', 377, 118);

  // Auditorium Seating rows (left and right banks, center aisle)
  const rows = 4, cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = 350 + c * 34;
      const cy = 240 + r * 56;
      ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#4338ca'; ctx.fill();
      ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#6366f1'; ctx.fill();
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = 680 + c * 34;
      const cy = 240 + r * 56;
      ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#4338ca'; ctx.fill();
      ctx.strokeStyle = '#6366f1'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#6366f1'; ctx.fill();
    }
  }

  // Breakout Pods tables and whiteboards
  drawRoundTable(ctx, 149, 140, 44, 6, '#334155');
  drawRoundTable(ctx, 149, 340, 44, 6, '#334155');
  drawScreen(ctx, 149, 36);

  drawRoundTable(ctx, 1052, 140, 44, 6, '#334155');
  drawRoundTable(ctx, 1052, 340, 44, 6, '#334155');
  drawScreen(ctx, 1052, 36);

  // Networking Foyer - Refreshment counter & cocktail tables
  drawRoundRect(ctx, 90, 560, 180, 44, 6);
  ctx.fillStyle = '#475569'; ctx.fill();
  ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = '12px Inter, sans-serif'; ctx.fillStyle = '#f8fafc'; ctx.fillText('☕ Refreshments Bar', 180, 586);

  for (const hx of [420, 600, 780, 980]) {
    drawRoundTable(ctx, hx, 580, 20, 3, '#64748b');
  }

  // Plants
  drawPlant(ctx, 310, 40, 15);
  drawPlant(ctx, 890, 40, 15);
  drawPlant(ctx, 298, 460, 14);
  drawPlant(ctx, 902, 460, 14);
  drawPlant(ctx, 40, 530, 14);
  drawPlant(ctx, 1150, 530, 14);

  // Room section labels
  ctx.font = '700 11px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.textAlign = 'center';
  ctx.fillText('BREAKOUT POD A', 149, 235);
  ctx.fillText('BREAKOUT POD B', 1052, 235);
  ctx.fillText('MAIN AUDITORIUM SEATING', 600, 205);
  ctx.fillText('NETWORKING FOYER', 600, 535);

  // Walls
  ctx.fillStyle = '#312e81';
  for (const w of CONF_WALLS) ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (const w of CONF_WALLS) ctx.fillRect(w.x, w.y, w.w, 1);
}

function drawLounge(ctx) {
  // Base floor
  ctx.fillStyle = '#1c1917'; ctx.fillRect(0, 0, W, H);

  // VIP Lounge Booths (West)
  ctx.fillStyle = '#292524'; ctx.fillRect(18, 18, 277, 457);

  // Central Bar Area
  ctx.fillStyle = '#262220'; ctx.fillRect(303, 18, 592, 457);

  // Games & Rec (East)
  ctx.fillStyle = '#202624'; ctx.fillRect(903, 18, 279, 457);

  // Sunset Terrace Deck (South)
  ctx.fillStyle = '#1c2820'; ctx.fillRect(18, 481, W - 36, 181);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1;
  for (let gy = 485; gy < H - 18; gy += 14) {
    ctx.beginPath(); ctx.moveTo(18, gy); ctx.lineTo(W - 18, gy); ctx.stroke();
  }

  // Central Bar Counter
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8;
  drawRoundRect(ctx, 390, 80, 420, 50, 8);
  ctx.fillStyle = '#b45309'; ctx.fill();
  ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();

  // Bar stools
  for (let i = 0; i < 8; i++) {
    const sx = 420 + i * 50;
    ctx.beginPath(); ctx.arc(sx, 146, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#92400e'; ctx.fill();
    ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // Back bar shelf
  drawRoundRect(ctx, 420, 32, 360, 24, 4);
  ctx.fillStyle = '#451a03'; ctx.fill();
  ctx.font = '12px Inter, sans-serif'; ctx.fillStyle = '#fef3c7'; ctx.textAlign = 'center';
  ctx.fillText('🍸 ROOFTOP ESPRESSO & COCKTAIL BAR 🍹', 600, 48);

  // West VIP Booths
  drawRoundRect(ctx, 50, 90, 160, 45, 8);
  ctx.fillStyle = '#ea580c'; ctx.fill();
  drawRoundRect(ctx, 50, 135, 45, 80, 8);
  ctx.fillStyle = '#ea580c'; ctx.fill();
  drawRoundTable(ctx, 135, 160, 24, 3, '#78350f');

  drawRoundRect(ctx, 50, 270, 160, 45, 8);
  ctx.fillStyle = '#ea580c'; ctx.fill();
  drawRoundRect(ctx, 50, 315, 45, 80, 8);
  ctx.fillStyle = '#ea580c'; ctx.fill();
  drawRoundTable(ctx, 135, 340, 24, 3, '#78350f');

  // East Games Room - Billiards Table
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6;
  drawRoundRect(ctx, 960, 100, 165, 95, 4);
  ctx.fillStyle = '#15803d'; ctx.fill();
  ctx.strokeStyle = '#78350f'; ctx.lineWidth = 7; ctx.stroke();
  for (const [px, py] of [
    [960, 100], [1042, 100], [1125, 100],
    [960, 195], [1042, 195], [1125, 195],
  ]) {
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1917'; ctx.fill();
  }
  ctx.restore();

  drawRoundTable(ctx, 1042, 320, 32, 4, '#78350f');

  // Sunset Terrace - Parasol patio tables
  drawParasol(ctx, 230, 570, '#06b6d4');
  drawParasol(ctx, 600, 570, '#f59e0b');
  drawParasol(ctx, 970, 570, '#ec4899');

  for (let px = 60; px < W - 50; px += 90) {
    drawPlant(ctx, px, 475, 12);
  }

  // Room section labels
  ctx.font = '700 11px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.textAlign = 'center';
  ctx.fillText('VIP FIRESIDE BOOTHS', 156, 45);
  ctx.fillText('GAMES & BILLIARDS', 1042, 45);
  ctx.fillText('SUNSET OPEN-AIR TERRACE', 600, 508);

  // Walls
  ctx.fillStyle = '#451a03';
  for (const w of LOUNGE_WALLS) ctx.fillRect(w.x, w.y, w.w, w.h);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (const w of LOUNGE_WALLS) ctx.fillRect(w.x, w.y, w.w, 1);
}

// ─── Dynamic Doors Drawing (Office Environment) ──────────────────────────────
function drawDoors(ctx, doors = {}) {
  for (const [key, door] of Object.entries(DOORS)) {
    const isOpen = isDoorOpen(doors, key);
    const [cx, cy, rad, sa, ea] = door.arc;
    const wall = door.wall;

    if (isOpen) {
      // Draw open door swing radius arc (soft green dashed line)
      ctx.save();
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, sa, ea);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw open door slab (swung open along sa)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(sa);
      ctx.fillStyle = '#92400e';
      ctx.fillRect(0, -2.5, rad * 0.95, 5);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, -2.5, rad * 0.95, 5);
      // Brass hinge
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Open status badge text
      ctx.font = '600 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      const midX = wall.x + wall.w / 2;
      const midY = wall.y + wall.h / 2;
      ctx.fillStyle = '#16a34a';
      ctx.fillText('OPEN', midX, midY + (wall.h > wall.w ? 0 : -8));
      ctx.restore();
    } else {
      // Draw closed door: solid wooden panel barrier
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      // Wooden panel slab
      ctx.fillStyle = '#78350f';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

      // Panel bevel
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);

      // Golden door lock & handle
      ctx.fillStyle = '#fbbf24';
      const hx = wall.w > wall.h ? wall.x + wall.w * 0.72 : wall.x + wall.w / 2;
      const hy = wall.h > wall.w ? wall.y + wall.h * 0.72 : wall.y + wall.h / 2;
      ctx.beginPath();
      ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Closed status badge
      ctx.font = '600 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      const midX = wall.x + wall.w / 2;
      const midY = wall.y + wall.h / 2;
      ctx.fillStyle = '#ef4444';
      ctx.fillText('CLOSED', midX, midY + (wall.h > wall.w ? 0 : -8));
      ctx.restore();
    }
  }
}

// ─── Theme Registry ───────────────────────────────────────────────────────────
const THEMES = {
  office: {
    id: 'office',
    name: 'Corporate Office',
    icon: 'apartment',
    badgeColor: '#3b82f6',
    spawn: { x: 1100, y: 720 },
    draw: drawOffice,
    walls: OFFICE_WALLS,
    hasDoors: true,
  },
  conference: {
    id: 'conference',
    name: 'Conference & Auditorium',
    icon: 'account_balance',
    badgeColor: '#8b5cf6',
    spawn: { x: 1100, y: 1050 },
    draw: drawConference,
    walls: CONF_WALLS,
    hasDoors: false,
  },
  lounge: {
    id: 'lounge',
    name: 'Executive Sky Rooftop',
    icon: 'local_cafe',
    badgeColor: '#10b981',
    spawn: { x: 1100, y: 650 },
    draw: drawLounge,
    walls: LOUNGE_WALLS,
    hasDoors: false,
  },
  rooftop: {
    id: 'rooftop',
    name: 'Executive Sky Rooftop',
    icon: 'deck',
    badgeColor: '#10b981',
    spawn: { x: 1100, y: 650 },
    draw: drawLounge,
    walls: LOUNGE_WALLS,
    hasDoors: false,
  },
};

// ─── Collision (Checking Theme Walls + Closed Doors) ──────────────────────────
function collidesWithWall(nx, ny, walls, doors = {}, checkDoors = true) {
  for (const w of walls) {
    const cx = Math.max(w.x, Math.min(nx, w.x + w.w));
    const cy = Math.max(w.y, Math.min(ny, w.y + w.h));
    if ((nx - cx) ** 2 + (ny - cy) ** 2 < R * R) return true;
  }

  if (checkDoors) {
    for (const [key, d] of Object.entries(DOORS)) {
      const isOpen = isDoorOpen(doors, key);
      if (!isOpen && d.wall) {
        const w = d.wall;
        const cx = Math.max(w.x, Math.min(nx, w.x + w.w));
        const cy = Math.max(w.y, Math.min(ny, w.y + w.h));
        if ((nx - cx) ** 2 + (ny - cy) ** 2 < R * R) return true;
      }
    }
  }

  return false;
}

// ─── Avatar Drawing with Voice Visualizers & Acoustics ────────────────────────
function drawAvatar(ctx, x, y, color, username, moving, isMe = false, isMuted = false, isSpeaking = false, volumeGain = 0, voiceIntensity = 0, acousticInfo = null) {
  // Proximity earshot ring (only local player)
  if (isMe) {
    ctx.beginPath();
    ctx.arc(x, y, MAX_DISTANCE, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

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
  const micIcon = isMuted ? '[Mute]' : (isActuallySpeaking ? '[Live]' : '[Mic]');
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

  // Volume & Acoustic Status Indicator
  if (!isMe) {
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    if (acousticInfo) {
      if (acousticInfo.status === 'blocked-wall' || acousticInfo.status === 'door-closed') {
        ctx.fillStyle = '#ef4444';
        const stLabel = acousticInfo.status === 'door-closed' ? 'Closed Door' : 'Soundproof';
        ctx.fillText(`[Private] ${acousticInfo.remoteRoom?.name || 'Room'} (${stLabel})`, x, y + R + 15);
      } else if (acousticInfo.status === 'in-room') {
        const volPct = Math.round(volumeGain * 100);
        ctx.fillStyle = isActuallySpeaking ? '#22c55e' : '#10b981';
        ctx.fillText(`${volPct}% • ${acousticInfo.remoteRoom.name}`, x, y + R + 15);
      } else if (acousticInfo.status === 'doorway') {
        const volPct = Math.round(volumeGain * 100);
        ctx.fillStyle = '#38bdf8';
        ctx.fillText(`Open Door · ${volPct}%`, x, y + R + 15);
      } else if (acousticInfo.status === 'occluded') {
        const volPct = Math.round(volumeGain * 100);
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(`Occluded · ${volPct}%`, x, y + R + 15);
      } else if (volumeGain > 0.04) {
        const volPct = Math.round(volumeGain * 100);
        ctx.fillStyle = isActuallySpeaking ? '#22c55e' : '#10b981';
        ctx.fillText(`${volPct}%`, x, y + R + 15);
      }
    } else if (volumeGain > 0.04) {
      const volPct = Math.round(volumeGain * 100);
      ctx.fillStyle = isActuallySpeaking ? '#22c55e' : '#10b981';
      ctx.fillText(`${volPct}%`, x, y + R + 15);
    }
  } else if (isMe && acousticInfo?.localRoom) {
    ctx.font = '500 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = acousticInfo.localRoom.isIsolated ? '#38bdf8' : '#94a3b8';
    ctx.fillText(`${acousticInfo.localRoom.name}`, x, y + R + 15);
  }
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function WorldCanvas({
  user,
  username: propUsername,
  avatarColor: propAvatarColor,
  room,
  roomId: propRoomId,
  roomName: propRoomName,
  theme: propTheme,
  onLeaveRoom,
  onLeave,
}) {
  const username = user?.username || propUsername || 'Anonymous';
  const myNameNorm = username.trim().toLowerCase();
  const avatarColor = user?.avatarColor || propAvatarColor || '#3b82f6';
  const roomId = room?.roomId || propRoomId || 'main-office';
  const roomName = room?.name || propRoomName || 'Workspace';
  const [loadedLayout, setLoadedLayout] = useState(room?.layout || null);
  useEffect(() => {
    if (room?.layout) {
      setLoadedLayout(room.layout);
    } else if (roomId) {
      fetch(`${SERVER_URL}/api/layouts/${encodeURIComponent(roomId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && data.layoutId) setLoadedLayout(data);
        })
        .catch(() => {});
    }
  }, [roomId, room?.layout]);

  const customLayout = loadedLayout || room?.layout;
  const themeKey = (room?.theme && THEMES[room.theme])
    ? room.theme
    : (customLayout?.theme && THEMES[customLayout.theme])
      ? customLayout.theme
      : (propTheme && THEMES[propTheme] ? propTheme : 'office');

  const isCustomFloorPlan = Boolean(
    customLayout &&
    Array.isArray(customLayout.walls) &&
    customLayout.walls.length > 0
  );

  const activeTheme = useMemo(() => {
    const base = THEMES[themeKey] || THEMES.office;
    if (!isCustomFloorPlan) {
      return {
        ...base,
        name: customLayout?.name || roomName || base.name,
        isCustom: false,
      };
    }

    return {
      id: customLayout.layoutId || 'custom',
      name: customLayout.name || roomName,
      icon: 'apartment',
      badgeColor: '#2563eb',
      spawn: customLayout.spawnPoint || { x: 1100, y: 720 },
      isCustom: true,
      draw: (ctx) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(18, 18, W - 36, H - 36);
        // Architectural floor grid
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        for (let gx = 20; gx < W - 20; gx += 40) {
          ctx.beginPath(); ctx.moveTo(gx, 20); ctx.lineTo(gx, H - 20); ctx.stroke();
        }
        for (let gy = 20; gy < H - 20; gy += 40) {
          ctx.beginPath(); ctx.moveTo(20, gy); ctx.lineTo(W - 20, gy); ctx.stroke();
        }
        // Custom sound zones / rooms carpets
        if (Array.isArray(customLayout.soundZones)) {
          for (const z of customLayout.soundZones) {
            if (z.bounds) {
              drawArchitecturalZone(ctx, z, false, false);
            }
          }
        }
        // Furniture & Workstations (Architectural Vector CAD Engine)
        if (Array.isArray(customLayout.furniture)) {
          for (const f of customLayout.furniture) {
            drawArchitecturalFurniture(ctx, f, false, false);
          }
        }
        // Walls (Architectural Profile Engine)
        if (Array.isArray(customLayout.walls)) {
          for (const w of customLayout.walls) {
            drawArchitecturalWall(ctx, w, false, false);
          }
        }
      },
      walls: customLayout.walls,
      hasDoors: Boolean(customLayout.doors && customLayout.doors.length > 0),
      doors: customLayout.doors || [],
      soundZones: customLayout.soundZones || [],
    };
  }, [
    isCustomFloorPlan,
    customLayout?.layoutId,
    customLayout?.updatedAt,
    customLayout?.name,
    customLayout?.walls,
    customLayout?.furniture,
    customLayout?.doors,
    customLayout?.soundZones,
    themeKey,
    roomName,
  ]);

  const canvasRef   = useRef(null);
  const containerRef = useRef(null);
  const minimapCanvasRef = useRef(null);
  const cameraRef   = useRef({ x: activeTheme.spawn.x, y: activeTheme.spawn.y });
  const zoomRef     = useRef(1.0);
  const [zoom, setZoom] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRadar, setShowRadar] = useState(true);
  const stateRef    = useRef({ x: activeTheme.spawn.x, y: activeTheme.spawn.y, keys: {}, moving: false });
  const peersRef    = useRef({}); // { socketId: { x, y, username, avatarColor, isMuted } }
  const peerVolumesRef = useRef({}); // peerId -> volume
  const peerIntensitiesRef = useRef({}); // peerId -> voiceIntensity
  const peerAcousticsRef = useRef({}); // peerId -> acousticInfo
  const localRoomRef = useRef({ name: 'Open Workspace', isIsolated: false });
  const localIntensityRef = useRef(0);
  const rafRef      = useRef(null);
  const socketRef   = useRef(null);
  const lastEmitRef = useRef(0);

  // Door States & Toast Notifications
  const [doors, setDoors] = useState({
    'meeting-room': { isOpen: true, accessed: false, changedBy: 'System' },
    'manager-office': { isOpen: true, accessed: false, changedBy: 'System' },
    'tech-server': { isOpen: true, accessed: false, changedBy: 'System' },
    'lounge-break': { isOpen: true, accessed: false, changedBy: 'System' },
    'print-copy': { isOpen: true, accessed: false, changedBy: 'System' },
  });
  const doorsRef = useRef(doors);
  const [nearbyDoor, setNearbyDoor] = useState(null);
  const nearbyDoorRef = useRef(null);
  const [doorToast, setDoorToast] = useState(null);
  const doorToastTimerRef = useRef(null);

  // Knock-to-Enter State
  const [pendingKnockRequests, setPendingKnockRequests] = useState([]); // [{ visitorId, visitorName, doorKey, timestamp }]
  const [myKnockStatus, setMyKnockStatus] = useState(null); // { doorKey, status: 'waiting' | 'welcomed' | 'declined', message }
  const myKnockStatusRef = useRef(null);
  myKnockStatusRef.current = myKnockStatus;
  const [welcomedDoors, setWelcomedDoors] = useState({}); // doorKey -> boolean
  const doorAutoCloseTimerRef = useRef(null);

  const showToast = useCallback((msg, type = 'info') => {
    if (doorToastTimerRef.current) clearTimeout(doorToastTimerRef.current);
    setDoorToast({ msg, type, id: Date.now() });
    doorToastTimerRef.current = setTimeout(() => {
      setDoorToast(null);
    }, 4500);
  }, []);
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;

  // Audio & Mic States
  const [micActive, setMicActive] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isDeafened, setIsDeafened] = useState(false);
  const [inEarshotCount, setInEarshotCount] = useState(0);
  const [currentRoom, setCurrentRoom] = useState({ id: 'open-workspace', name: 'Open Workspace', isIsolated: false });
  const [copiedLink, setCopiedLink] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(() => spatialAudio.isAudioUnlocked());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagData, setDiagData] = useState(null);
  const [micDevices, setMicDevices] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState('');

  // Chat Sidebar State
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const chatMessagesRef = useRef([]);

  const [isPttActive, setIsPttActive] = useState(false);
  const isPttActiveRef = useRef(false);
  const isMutedRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const voiceMeterBarRef = useRef(null);
  const renderRef = useRef(null);
  const offscreenRef = useRef(null);
  const prevInEarshotRef = useRef(0);

  const refreshDiagnostics = useCallback(() => {
    const d = webrtc.getConnectionDiagnostics();
    const audioCtxState = spatialAudio.audioCtx?.state || 'not initialized';
    setDiagData({
      ...d,
      audioCtxState,
      isAudioUnlocked: spatialAudio.isAudioUnlocked(),
      isDeafened,
      browserInfo: typeof navigator !== 'undefined' ? `${navigator.userAgent}` : 'Unknown',
    });
  }, [isDeafened]);

  useEffect(() => {
    if (!showDiagnostics) return;
    webrtc.getAudioInputDevices().then((devs) => {
      if (devs && devs.length) setMicDevices(devs);
    });
    webrtc.updateAllPeerStats().then(refreshDiagnostics);
    const timer = setInterval(() => {
      webrtc.updateAllPeerStats().then(refreshDiagnostics);
    }, 1500);
    return () => clearInterval(timer);
  }, [showDiagnostics, refreshDiagnostics]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (showChat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, showChat]);

  const handleSendChatMessage = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg || !socketRef.current) return;
    socketRef.current.emit('room:chat:send', { roomId, message: msg });
    setChatInput('');
  }, [chatInput, roomId]);

  // Copy invite link helper
  const handleCopyInviteLink = () => {
    const url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    });
  };

  // Leave room / End call handler
  const handleLeaveCall = useCallback(() => {
    try {
      webrtc.closeAll();
      spatialAudio.destroy();
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { roomId });
        socketRef.current.disconnect();
      }
    } catch (err) {
      console.warn('[LeaveCall] Error during cleanup:', err);
    }
    const leaveFn = onLeaveRoom || onLeave;
    if (leaveFn) {
      leaveFn();
    } else {
      window.location.reload();
    }
  }, [roomId, onLeaveRoom, onLeave]);

  // Handle container and viewport resizing
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const nw = Math.max(640, Math.floor(rect.width));
        const nh = Math.max(480, Math.floor(rect.height));
        if (canvasRef.current.width !== nw || canvasRef.current.height !== nh) {
          canvasRef.current.width = nw;
          canvasRef.current.height = nh;
        }
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [isFullscreen]);

  // Minimap Radar Drawing Routine
  const drawMinimap = useCallback(() => {
    const mini = minimapCanvasRef.current;
    if (!mini) return;
    const mctx = mini.getContext('2d');
    const mw = mini.width;
    const mh = mini.height;
    const sx = mw / W;
    const sy = mh / H;

    mctx.clearRect(0, 0, mw, mh);

    // 1. Draw exact architectural floor plan from pre-rendered world canvas (100% fidelity)
    if (offscreenRef.current) {
      mctx.drawImage(offscreenRef.current, 0, 0, mw, mh);
    } else {
      mctx.fillStyle = '#0b0f19';
      mctx.fillRect(0, 0, mw, mh);
    }

    // Mini doors
    if (activeTheme.hasDoors) {
      if (activeTheme.isCustom && Array.isArray(customLayout?.doors) && customLayout.doors.length > 0) {
        for (const d of customLayout.doors) {
          const isOpen = isDoorOpen(doorsRef.current, d.key);
          mctx.fillStyle = isOpen ? '#22c55e' : '#ef4444';
          mctx.fillRect(d.x * sx, d.y * sy, Math.max(2, d.w * sx), Math.max(2, d.h * sy));
        }
      } else {
        for (const [key, d] of Object.entries(DOORS)) {
          if (d.wall) {
            const isOpen = isDoorOpen(doorsRef.current, key);
            mctx.fillStyle = isOpen ? '#22c55e' : '#ef4444';
            mctx.fillRect(d.wall.x * sx, d.wall.y * sy, Math.max(2, d.wall.w * sx), Math.max(2, d.wall.h * sy));
          }
        }
      }
    }

    // Mini peer blips
    for (const [peerId, peer] of Object.entries(peersRef.current)) {
      const px = (peer.renderX ?? peer.x) * sx;
      const py = (peer.renderY ?? peer.y) * sy;
      mctx.beginPath();
      mctx.arc(px, py, 3.5, 0, Math.PI * 2);
      mctx.fillStyle = peer.avatarColor || '#a855f7';
      mctx.fill();
      if ((peerIntensitiesRef.current[peerId] || 0) > 0.05) {
        mctx.strokeStyle = '#22c55e';
        mctx.lineWidth = 1.5;
        mctx.stroke();
      }
    }

    // Local player blip + earshot circle on radar
    const lx = stateRef.current.x * sx;
    const ly = stateRef.current.y * sy;

    mctx.beginPath();
    mctx.arc(lx, ly, MAX_DISTANCE * sx, 0, Math.PI * 2);
    mctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
    mctx.lineWidth = 1;
    mctx.stroke();

    mctx.beginPath();
    mctx.arc(lx, ly, 4, 0, Math.PI * 2);
    mctx.fillStyle = avatarColor;
    mctx.fill();
    mctx.strokeStyle = '#ffffff';
    mctx.lineWidth = 1.5;
    mctx.stroke();

    // Camera Viewport Frustum Box
    const canvas = canvasRef.current;
    if (canvas) {
      const z = zoomRef.current;
      const vw = canvas.width / z;
      const vh = canvas.height / z;
      const vx = cameraRef.current.x - vw / 2;
      const vy = cameraRef.current.y - vh / 2;
      mctx.strokeStyle = '#38bdf8';
      mctx.lineWidth = 1.5;
      mctx.setLineDash([3, 2]);
      mctx.strokeRect(vx * sx, vy * sy, vw * sx, vh * sy);
      mctx.setLineDash([]);
    }
  }, [activeTheme, avatarColor]);

  // Zoom handlers
  const handleZoomStep = (delta) => {
    setZoom((prev) => {
      const next = Math.min(1.5, Math.max(0.55, Number((prev + delta).toFixed(2))));
      zoomRef.current = next;
      return next;
    });
  };

  const handleZoomReset = () => {
    zoomRef.current = 1.0;
    setZoom(1.0);
  };

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;
    const vw = canvas.width;
    const vh = canvas.height;
    const z = zoomRef.current;

    // Clear viewport
    ctx.clearRect(0, 0, vw, vh);

    // Save context for Camera Viewport Transform (World Space)
    ctx.save();
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(z, z);
    ctx.translate(-cameraRef.current.x, -cameraRef.current.y);

    // 1. Static themed canvas background layer
    if (offscreenRef.current) {
      ctx.drawImage(offscreenRef.current, 0, 0);
    }

    // 1b. Dynamic Doors layer (active in office layout)
    if (activeTheme.hasDoors) {
      if (activeTheme.isCustom && Array.isArray(customLayout?.doors) && customLayout.doors.length > 0) {
        for (const d of customLayout.doors) {
          const isOpen = isDoorOpen(doorsRef.current, d.key);
          drawArchitecturalDoor(ctx, d, false, false, isOpen);
        }
      } else {
        drawDoors(ctx, doorsRef.current);
      }
    }

    // 2. Draw remote peers — 60fps smooth interpolation & walking dynamics
    const LERP = 0.20; // 60fps convergence factor for 50ms socket updates
    const myNameNorm = username?.trim().toLowerCase();
    for (const [peerId, peer] of Object.entries(peersRef.current)) {
      if (peerId === socketRef.current?.id || (myNameNorm && peer.username?.trim().toLowerCase() === myNameNorm)) {
        delete peersRef.current[peerId];
        delete peerVolumesRef.current[peerId];
        delete peerIntensitiesRef.current[peerId];
        delete peerAcousticsRef.current[peerId];
        continue;
      }
      const vol = peerVolumesRef.current[peerId] || 0;
      const intensity = peerIntensitiesRef.current[peerId] || 0;
      const acoustic = peerAcousticsRef.current[peerId] || null;
      const peerSpeaking = intensity > 0.05;

      // Initialize interpolation coords if needed
      if (peer.renderX === undefined) { peer.renderX = peer.x; peer.renderY = peer.y; }
      if (peer.targetX === undefined) { peer.targetX = peer.x; peer.targetY = peer.y; }

      const dx = peer.targetX - peer.renderX;
      const dy = peer.targetY - peer.renderY;
      const dist = Math.hypot(dx, dy);

      if (dist > 0.15) {
        peer.renderX += dx * LERP;
        peer.renderY += dy * LERP;
      } else {
        peer.renderX = peer.targetX;
        peer.renderY = peer.targetY;
      }

      // Update position references so spatial audio panner also glides at 60fps
      peer.x = peer.renderX;
      peer.y = peer.renderY;

      // Remote avatar movement animation flag
      const peerMoving = dist > 0.45;

      drawAvatar(
        ctx,
        peer.renderX,
        peer.renderY,
        peer.avatarColor,
        peer.username,
        peerMoving,
        false,
        peer.isMuted ?? false,
        peerSpeaking,
        vol,
        intensity,
        acoustic
      );
    }

    // 3. Draw local avatar on top with live voice intensity & local room tag
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
      myIntensity,
      { localRoom: localRoomRef.current }
    );

    // Restore context from Camera World Space back to Screen Space
    ctx.restore();

    // 4. Compact movement guide bottom-left (Screen-pinned HUD)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    drawRoundRect(ctx, 16, vh - 42, 185, 28, 8);
    ctx.fill();
    ctx.strokeStyle = '#D9D7D0';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = '500 11px Inter, sans-serif';
    ctx.fillStyle = '#374151';
    ctx.textAlign = 'left';
    ctx.fillText('WASD to move • Scroll to zoom', 26, vh - 24);

    // 5. Connection indicator bottom-right (Screen-pinned HUD)
    const connected = socketRef.current?.connected;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    drawRoundRect(ctx, vw - 116, vh - 38, 102, 26, 13);
    ctx.fill();
    ctx.strokeStyle = '#D9D7D0';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath(); ctx.arc(vw - 102, vh - 25, 4, 0, Math.PI * 2);
    ctx.fillStyle = connected ? '#10b981' : '#ef4444'; ctx.fill();
    ctx.font = '500 11px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = connected ? '#047857' : '#b91c1c';
    ctx.fillText(connected ? 'Connected' : 'Offline', vw - 92, vh - 21);

    // 6. Update Minimap Radar
    drawMinimap();
  }, [username, avatarColor, activeTheme, drawMinimap]);

  renderRef.current = render;

  // Audio Control Handlers
  const handleToggleMic = async () => {
    spatialAudio.resumeAll();
    setAudioUnlocked(true);

    if (!micActive) {
      try {
        const audioCtx = spatialAudio.ensureContext();
        await webrtc.startMicrophone(audioCtx);
        setMicActive(true);
        isMutedRef.current = false;
        setIsMuted(false);
        playUiChime('unmute');
        showToast('Microphone active. Connected to meeting voice.', 'success');
      } catch (err) {
        showToast(`${err.message || 'Microphone access failed'}`, 'alert');
        alert(err.message || 'Microphone permission required for voice audio.');
      }
    } else {
      const newMuted = webrtc.toggleMute(roomId);
      isMutedRef.current = newMuted;
      setIsMuted(newMuted);
      playUiChime(newMuted ? 'mute' : 'unmute');
      showToast(newMuted ? 'Microphone muted' : 'Microphone unmuted', newMuted ? 'info' : 'success');
    }
  };

  const handleToggleDeafen = () => {
    spatialAudio.ensureContext();
    const nextDeafened = !isDeafened;
    spatialAudio.setDeafened(nextDeafened);
    setIsDeafened(nextDeafened);
    playUiChime(nextDeafened ? 'deafen' : 'undeafen');
  };

  // Voice intensity polling - updates ref & direct DOM bar without causing React re-renders
  useEffect(() => {
    let lastLog = 0;
    const timer = setInterval(() => {
      const v = webrtc.getLocalVoiceIntensity();
      localIntensityRef.current = v;
      if (voiceMeterBarRef.current) {
        const pct = Math.round(v * 100);
        voiceMeterBarRef.current.style.width = `${pct}%`;
        voiceMeterBarRef.current.style.minWidth = v > 0.02 ? '4px' : '0px';
        voiceMeterBarRef.current.style.background = v > 0.6 ? '#f59e0b' : '#22c55e';
        voiceMeterBarRef.current.style.boxShadow = v > 0.1 ? '0 0 8px rgba(34, 197, 94, 0.7)' : 'none';
      }
      const now = Date.now();
      if (v > 0.05 && now - lastLog > 1500) {
        lastLog = now;
      }
    }, 50);
    return () => clearInterval(timer);
  }, []);

  // Pre-render static themed background whenever activeTheme changes (independent of socket lifecycle)
  useEffect(() => {
    const offscreen = document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    activeTheme.draw(offscreen.getContext('2d'));
    offscreenRef.current = offscreen;
  }, [activeTheme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.focus();

    // Reset position to theme spawn
    stateRef.current.x = activeTheme.spawn.x;
    stateRef.current.y = activeTheme.spawn.y;

    // Socket.io connection
    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      timeout: 20000,
    });
    socketRef.current = socket;

    // Initialize WebRTC signaling
    webrtc.init(socket, {
      roomId: roomId,
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
      },
      onMicLost: (reason) => {
        console.warn('[WorldCanvas] Microphone lost:', reason);
        setMicActive(false);
        isMutedRef.current = true;
        setIsMuted(true);
        showToastRef.current?.(`${reason || 'Microphone disconnected.'} Click 'Enable Mic' to reconnect.`, 'alert');
      },
    });

    // Keep Render backend awake
    const keepAliveTimer = setInterval(() => {
      if (SERVER_URL) {
        fetch(`${SERVER_URL}/health`).catch(() => {});
      }
    }, 2 * 60 * 1000);

    // Auto-resume AudioContext and audio elements on initial user interaction (once only)
    const unlockAudio = () => {
      spatialAudio.resumeAll();
      setAudioUnlocked(true);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    window.addEventListener('pointerdown', unlockAudio, { once: true });

    // Auto-recover audio & mic when returning from background (screen lock / app switch on mobile)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[WorldCanvas] Page became visible, auto-resuming audio...');
        spatialAudio.resumeAll();
        if (webrtc.localStream) {
          const t = webrtc.localStream.getAudioTracks()[0];
          if (!t || t.readyState === 'ended') {
            console.warn('[WorldCanvas] Mic track ended during backgrounding, re-acquiring...');
            const ctx = spatialAudio.ensureContext();
            webrtc.startMicrophone(ctx).catch(() => {});
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socket.on('connect', () => {
      console.log('[Socket] connected:', socket.id);
      socket.emit('join-room', { username, avatarColor, roomId, isMuted: isMutedRef.current });
    });

    // Populate existing peers and initiate WebRTC connections
    socket.on('room-state', ({ selfId, users, doors: initialDoors }) => {
      if (initialDoors) {
        setDoors((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(initialDoors)) {
            if (typeof v === 'boolean') {
              next[k] = { isOpen: v, accessed: false, changedBy: 'System' };
            } else if (v && typeof v === 'object') {
              next[k] = {
                isOpen: typeof v.isOpen === 'boolean' ? v.isOpen : true,
                accessed: !!v.accessed,
                changedBy: v.changedBy || 'System',
              };
            }
          }
          doorsRef.current = next;
          return next;
        });
      }
      peersRef.current = {};
      const myNameNorm = username?.trim().toLowerCase();
      for (const u of users) {
        const uNameNorm = u.username?.trim().toLowerCase();
        if (u.id !== selfId && (!myNameNorm || uNameNorm !== myNameNorm)) {
          peersRef.current[u.id] = {
            x: u.x,
            y: u.y,
            targetX: u.x,
            targetY: u.y,
            renderX: u.x,
            renderY: u.y,
            username: u.username,
            avatarColor: u.avatarColor,
            isMuted: u.isMuted ?? false,
          };
          if (!webrtc.peers.has(u.id)) {
            webrtc.connectToPeer(u.id);
          }
        }
      }
    });

    // Door state changed (opened or closed by a member)
    socket.on('door-state-changed', ({ doorKey, roomKey, isOpen, accessed, changedBy }) => {
      const key = doorKey || roomKey;
      if (!key) return;
      setDoors((prev) => {
        const next = {
          ...prev,
          [key]: {
            isOpen: !!isOpen,
            accessed: accessed !== false,
            changedBy: changedBy || 'Member',
          },
        };
        doorsRef.current = next;
        return next;
      });
      const dName = DOORS[key]?.name || key;
      showToastRef.current?.(`${changedBy || 'Member'} ${isOpen ? 'opened' : 'closed'} the ${dName} door`, isOpen ? 'success' : 'warn');
    });

    // Audio chime broadcast when someone knocks on any door
    socket.on('door-knocked', ({ doorKey, roomKey, targetRoomKey }) => {
      const key = doorKey || roomKey || targetRoomKey;
      if (!key) return;
      const amIInside = localRoomRef.current?.id === key;
      if (amIInside) {
        playKnockSound();
      }
    });

    // Received by room occupants when a visitor knocks on their door
    socket.on('visitor-knocked', ({ doorKey, roomName: targetRoomName, visitorName, pendingKnocks }) => {
      const amIInside = localRoomRef.current?.id === doorKey;
      if (amIInside) {
        playKnockSound();
        setPendingKnockRequests(pendingKnocks || []);
        showToastRef.current?.(`${visitorName} is knocking at the ${targetRoomName} door.`, 'alert');
      }
    });

    // Updated list of pending knocks
    socket.on('pending-knocks-updated', ({ doorKey, pendingKnocks }) => {
      const amIInside = localRoomRef.current?.id === doorKey;
      if (amIInside) {
        setPendingKnockRequests(pendingKnocks || []);
      }
    });

    // Received by visitor regarding their knock status
    socket.on('knock-status', ({ doorKey, status, message }) => {
      const dName = DOORS[doorKey]?.name || doorKey;
      if (status === 'waiting') {
        setMyKnockStatus({ doorKey, status: 'waiting', message });
        showToastRef.current?.(`Waiting for occupants of ${dName} to welcome you...`, 'info');
      } else if (status === 'room-empty') {
        setMyKnockStatus(null);
        showToastRef.current?.(`ℹ️ ${message}`, 'info');
      }
    });

    // Received by visitor when an occupant welcomes them in
    socket.on('visitor-welcomed', ({ doorKey, roomName: targetRoomName, welcomedBy }) => {
      setWelcomedDoors((prev) => ({ ...prev, [doorKey]: true }));
      setMyKnockStatus({ doorKey, status: 'welcomed' });
      showToastRef.current?.(`${welcomedBy} welcomed you into ${targetRoomName}. Step inside.`, 'success');
    });

    // Received by visitor when an occupant declines entry
    socket.on('visitor-declined', ({ doorKey, roomName: targetRoomName, declinedBy, reason }) => {
      setMyKnockStatus({ doorKey, status: 'declined' });
      showToast(`${declinedBy} declined entry to ${targetRoomName}: ${reason}`, 'alert');
    });

    // Received if an unauthorized action is denied by the server
    socket.on('door-action-denied', ({ doorKey, reason }) => {
      const dName = DOORS[doorKey]?.name || doorKey;
      showToast(`${dName}: ${reason}`, 'alert');
    });

    // Existing user gets notified of new peer
    socket.on('user-joined', ({ id, username: uname, avatarColor: ucolor, x, y, isMuted: peerMuted }) => {
      const myNameNorm = username?.trim().toLowerCase();
      const uNameNorm = uname?.trim().toLowerCase();
      if (id === socket.id || (myNameNorm && uNameNorm === myNameNorm)) {
        return;
      }
      peersRef.current[id] = {
        x,
        y,
        targetX: x,
        targetY: y,
        renderX: x,
        renderY: y,
        username: uname,
        avatarColor: ucolor,
        isMuted: peerMuted ?? false,
      };
      if (!webrtc.peers.has(id)) {
        webrtc.connectToPeer(id);
      }
    });

    // Peer moves — update target for interpolation, not the rendered position
    socket.on('user-moved', ({ id, x, y }) => {
      if (id === socket.id) return;
      if (peersRef.current[id]) {
        peersRef.current[id].x = x;
        peersRef.current[id].y = y;
        peersRef.current[id].targetX = x;
        peersRef.current[id].targetY = y;
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
      delete peerIntensitiesRef.current[id];
      delete peerAcousticsRef.current[id];
      webrtc.removePeer(id);
      spatialAudio.removePeerStream(id);
    });

    // Room chat messages
    socket.on('room:chat:message', (payload) => {
      chatMessagesRef.current = [...chatMessagesRef.current, payload].slice(-200); // keep last 200
      setChatMessages([...chatMessagesRef.current]);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] disconnected');
    });

    // Keyboard handlers (W, A, S, D and Arrow keys for movement)
    const onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
      }
      stateRef.current.keys[e.key] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      // Hotkey: M -> Toggle Microphone Mute (explicit key, separate from WASD movement)
      if (e.key === 'm' || e.key === 'M') {
        handleToggleMic();
        return;
      }

      // Hotkey: Spacebar (held) -> Push-To-Talk Walkie-Talkie
      if (e.key === ' ' && !e.repeat && isMutedRef.current) {
        isPttActiveRef.current = true;
        setIsPttActive(true);
        webrtc.toggleMute(roomId);
        isMutedRef.current = false;
        setIsMuted(false);
        playUiChime('unmute');
      }
    };

    const onKeyUp = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
      }
      stateRef.current.keys[e.key] = false;

      // Release Spacebar -> Return to Muted
      if (e.key === ' ' && isPttActiveRef.current) {
        isPttActiveRef.current = false;
        setIsPttActive(false);
        webrtc.toggleMute(roomId);
        isMutedRef.current = true;
        setIsMuted(true);
        playUiChime('mute');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // 60 FPS Game & Spatial Audio Loop
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
      const checkDoors = Boolean(activeTheme.hasDoors);
      if (dx && !collidesWithWall(s.x + dx, s.y, activeTheme.walls, doorsRef.current, checkDoors)) s.x += dx;
      if (dy && !collidesWithWall(s.x, s.y + dy, activeTheme.walls, doorsRef.current, checkDoors)) s.y += dy;

      // Smooth camera interpolation tracking avatar
      const camLerp = 0.12;
      cameraRef.current.x += (s.x - cameraRef.current.x) * camLerp;
      cameraRef.current.y += (s.y - cameraRef.current.y) * camLerp;

      // Purge any duplicate of self before calculating spatial audio
      for (const [peerId, peer] of Object.entries(peersRef.current)) {
        if (peerId === socketRef.current?.id || (myNameNorm && peer.username?.trim().toLowerCase() === myNameNorm)) {
          delete peersRef.current[peerId];
          delete peerVolumesRef.current[peerId];
          delete peerIntensitiesRef.current[peerId];
          delete peerAcousticsRef.current[peerId];
        }
      }

      // Update Web Audio distance attenuation, room isolation & wall raycasting
      const themeKey = activeTheme?.id || 'office';
      const { inEarshotCount: currentInEarshot, peerVolumes, peerIntensities, peerAcoustics, localRoom } =
        spatialAudio.updatePositions(s, peersRef.current, doorsRef.current, themeKey);
      peerVolumesRef.current = peerVolumes;
      peerIntensitiesRef.current = peerIntensities || {};
      if (prevInEarshotRef.current === 0 && currentInEarshot > 0) {
        playUiChime('peer-enter');
      }
      prevInEarshotRef.current = currentInEarshot;
      setInEarshotCount((prev) => (prev !== currentInEarshot ? currentInEarshot : prev));

      if (localRoom && localRoom.name !== localRoomRef.current?.name) {
        const prevRoom = localRoomRef.current;
        localRoomRef.current = localRoom;
        setCurrentRoom(localRoom);

        // If player stepped into a room that they knocked on or were welcomed into:
        if (localRoom.id && DOORS[localRoom.id]) {
          setWelcomedDoors((prev) => {
            if (prev[localRoom.id]) {
              const next = { ...prev };
              delete next[localRoom.id];
              return next;
            }
            return prev;
          });
          setMyKnockStatus((prev) => (prev?.doorKey === localRoom.id ? null : prev));

          // Auto-close door after 3.5s when entering room to secure meeting privacy
          if (doorAutoCloseTimerRef.current) clearTimeout(doorAutoCloseTimerRef.current);
          const enteredRoomKey = localRoom.id;
          doorAutoCloseTimerRef.current = setTimeout(() => {
            if (localRoomRef.current?.id === enteredRoomKey && isDoorOpen(doorsRef.current, enteredRoomKey)) {
              socketRef.current?.emit('toggle-door', {
                roomId,
                doorKey: enteredRoomKey,
                isOpen: false,
              });
              showToast(`Door closed for private meeting. Visitors must knock to enter.`, 'info');
            }
          }, 3500);
        }

        // If player stepped out of a room, clear pending knocks for that room
        if (prevRoom?.id && prevRoom.id !== localRoom.id) {
          setPendingKnockRequests((prev) => prev.filter((r) => r.doorKey !== prevRoom.id));
        }
      }

      // Check for nearby door proximity (within 95px of door midpoint)
      if (activeTheme.hasDoors) {
        let detectedNearbyDoor = null;
        for (const [key, d] of Object.entries(DOORS)) {
          if (d.wall) {
            const dcx = d.wall.x + d.wall.w / 2;
            const dcy = d.wall.y + d.wall.h / 2;
            const dist = Math.hypot(s.x - dcx, s.y - dcy);
            if (dist < 95) {
              detectedNearbyDoor = key;
              break;
            }
          }
        }
        if (detectedNearbyDoor !== nearbyDoorRef.current) {
          nearbyDoorRef.current = detectedNearbyDoor;
          setNearbyDoor(detectedNearbyDoor);
        }
      } else if (nearbyDoorRef.current) {
        nearbyDoorRef.current = null;
        setNearbyDoor(null);
      }

      // Auto-cancel knock if visitor walked away (> 160px) from door
      if (myKnockStatusRef.current?.status === 'waiting') {
        const targetDoor = DOORS[myKnockStatusRef.current.doorKey];
        if (targetDoor?.wall) {
          const dcx = targetDoor.wall.x + targetDoor.wall.w / 2;
          const dcy = targetDoor.wall.y + targetDoor.wall.h / 2;
          const dist = Math.hypot(s.x - dcx, s.y - dcy);
          if (dist > 160) {
            socketRef.current?.emit('cancel-knock', { roomId, doorKey: myKnockStatusRef.current.doorKey });
            setMyKnockStatus(null);
            showToast('Knock cancelled because you walked away.', 'info');
          }
        }
      }

      const now = Date.now();
      if ((s.x !== prevX || s.y !== prevY) && now - lastEmitRef.current >= MOVE_THROTTLE_MS) {
        socket.emit('move', { x: s.x, y: s.y, roomId });
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
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(rafRef.current);
      clearInterval(keepAliveTimer);
      if (doorAutoCloseTimerRef.current) clearTimeout(doorAutoCloseTimerRef.current);
      socket.disconnect();
      webrtc.closeAll();
      spatialAudio.destroy();
    };
  }, [username, avatarColor, roomId]);

  // Door Interaction Calculations
  const currentRoomId = currentRoom?.id || localRoomRef.current?.id;
  const roomDoorKey = currentRoomId && DOORS[currentRoomId] ? currentRoomId : null;
  const isRoomDoorOpen = roomDoorKey ? isDoorOpen(doors, roomDoorKey) : false;

  const currentRoomKnocks = (pendingKnockRequests || []).filter(
    (k) => k.doorKey === currentRoomId
  );

  const isOutsideNearbyDoor = Boolean(nearbyDoor && nearbyDoor !== roomDoorKey);
  const isNearbyDoorOpen = nearbyDoor ? isDoorOpen(doors, nearbyDoor) : false;

  let nearbyDoorOccupants = 0;
  if (nearbyDoor) {
    for (const peer of Object.values(peersRef.current)) {
      const peerRoom = getRoomAt(peer.x, peer.y);
      if (peerRoom?.id === nearbyDoor) {
        nearbyDoorOccupants++;
      }
    }
  }

  const handleToggleDoor = (doorKey) => {
    if (!doorKey) return;
    const currentOpen = isDoorOpen(doorsRef.current, doorKey);
    const nextOpen = !currentOpen;

    socketRef.current?.emit('toggle-door', {
      roomId,
      doorKey,
      isOpen: nextOpen,
    });
  };

  const handleKnockDoor = (doorKey) => {
    if (!doorKey) return;
    socketRef.current?.emit('knock-door', {
      roomId,
      doorKey,
    });
    setMyKnockStatus({ doorKey, status: 'waiting' });
    const dName = DOORS[doorKey]?.name || doorKey;
    showToast(`You knocked on the ${dName} door. Waiting for occupants...`, 'info');
  };

  const handleCancelKnock = (doorKey) => {
    if (!doorKey) return;
    socketRef.current?.emit('cancel-knock', {
      roomId,
      doorKey,
    });
    setMyKnockStatus(null);
    showToast('Knock cancelled.', 'info');
  };

  const handleWelcomeVisitor = (doorKey, visitorId) => {
    if (!doorKey || !visitorId) return;
    socketRef.current?.emit('welcome-visitor', {
      roomId,
      doorKey,
      visitorId,
    });
    setPendingKnockRequests((prev) => prev.filter((r) => r.visitorId !== visitorId));
    showToast('Welcomed visitor in. Door opened.', 'success');
  };

  const handleDeclineVisitor = (doorKey, visitorId) => {
    if (!doorKey || !visitorId) return;
    socketRef.current?.emit('decline-visitor', {
      roomId,
      doorKey,
      visitorId,
    });
    setPendingKnockRequests((prev) => prev.filter((r) => r.visitorId !== visitorId));
    showToast('Visitor entry request declined.', 'info');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 12px', background: '#FAF9F5', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: `${W}px`, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Top Header Console Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            padding: '10px 16px',
            background: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #D9D7D0',
            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
            boxSizing: 'border-box',
            gap: '12px',
          }}
        >
          {/* Left: Room Title, Theme Badge & Room ID */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontWeight: 700, fontSize: '16px', color: '#1c1b1b', letterSpacing: '-0.02em', margin: 0, whiteSpace: 'nowrap' }}>
                {roomName}
              </h2>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  backgroundColor: '#F4F3EF',
                  color: '#5e5f5c',
                  border: '1px solid #D9D7D0',
                  whiteSpace: 'nowrap',
                }}
              >
                {activeTheme.name}
              </span>
            </div>

            <div
              onClick={handleCopyInviteLink}
              style={{
                fontSize: '11px',
                color: '#8C8880',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '6px',
                transition: 'background 0.12s ease',
              }}
              title="Click to copy invite link"
            >
              <span>ID:</span>
              <code style={{ color: '#1c1b1b', background: '#F4F3EF', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', border: '1px solid #E9E8E4' }}>{roomId}</code>
            </div>
          </div>

          {/* Center: Dynamic Acoustic Zone Locator */}
          {activeTheme.hasDoors && (
            <div
              style={{
                background: currentRoom.isIsolated ? '#eff6ff' : '#F4F3EF',
                border: currentRoom.isIsolated ? '1px solid #bfdbfe' : '1px solid #D9D7D0',
                borderRadius: '20px',
                padding: '5px 12px',
                fontSize: '12px',
                color: currentRoom.isIsolated ? '#1d4ed8' : '#1c1b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px', color: currentRoom.isIsolated ? '#2563eb' : '#8C8880' }}>
                {currentRoom.isIsolated ? 'lock' : 'spatial_audio'}
              </span>
              <span style={{ fontWeight: 600, color: currentRoom.isIsolated ? '#1e40af' : '#1c1b1b' }}>
                {currentRoom.name}
              </span>
              {currentRoom.isIsolated && (
                <span style={{ fontSize: '9px', background: '#dbeafe', color: '#1e40af', padding: '1px 5px', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.06em' }}>
                  PRIVATE
                </span>
              )}
            </div>
          )}

          {/* Right: Controls & User */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {/* Connected Participants Counter */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '8px',
                background: '#F4F3EF',
                border: '1px solid #D9D7D0',
                fontSize: '11px',
                color: '#5e5f5c',
                fontWeight: 500,
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
              <span>{Object.keys(peersRef.current).length + 1} online</span>
            </div>

            {/* Chat Toggle Button in Header */}
            <button
              onClick={() => setShowChat((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '8px',
                background: showChat ? '#1c1b1b' : '#ffffff',
                border: '1px solid ' + (showChat ? '#1c1b1b' : '#D9D7D0'),
                color: showChat ? '#ffffff' : '#1c1b1b',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                position: 'relative',
              }}
              title="Toggle meeting chat"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>chat</span>
              <span>Chat</span>
              {chatMessages.length > 0 && !showChat && (
                <span style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#FF4B2B',
                  border: '1.5px solid #ffffff',
                }} />
              )}
            </button>

            {/* Copy Invite Link */}
            <button
              onClick={handleCopyInviteLink}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: copiedLink ? '#ecfdf5' : '#ffffff',
                border: copiedLink ? '1px solid #a7f3d0' : '1px solid #D9D7D0',
                color: copiedLink ? '#059669' : '#1c1b1b',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
              title="Copy meeting invite link to clipboard"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{copiedLink ? 'check' : 'link'}</span>
              <span>{copiedLink ? 'Copied' : 'Invite'}</span>
            </button>

            {/* User Badge */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #D9D7D0',
                borderRadius: '8px',
                padding: '5px 10px',
                fontSize: '12px',
                color: '#1c1b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: avatarColor, flexShrink: 0 }} />
              <span style={{ color: '#1c1b1b', fontWeight: 600, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{username}</span>
            </div>

            {/* Leave Room Button */}
            <button
              onClick={handleLeaveCall}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.12s ease',
              }}
              title="Leave meeting and return to lobby"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>call_end</span>
              <span>Leave</span>
            </button>
          </div>
        </div>

        {/* Canvas Frame Container with Responsive Viewport & Follow Camera */}
        <div
          ref={containerRef}
          style={{
            position: isFullscreen ? 'fixed' : 'relative',
            top: isFullscreen ? 0 : 'auto',
            left: isFullscreen ? 0 : 'auto',
            width: isFullscreen ? '100vw' : '100%',
            maxWidth: isFullscreen ? 'none' : '1440px',
            height: isFullscreen ? '100vh' : '700px',
            borderRadius: isFullscreen ? '0px' : '16px',
            overflow: 'hidden',
            border: isFullscreen ? 'none' : '1px solid #D9D7D0',
            boxShadow: isFullscreen ? 'none' : '0 24px 50px -12px rgba(0,0,0,0.12), 0 8px 20px -6px rgba(0,0,0,0.06)',
            background: '#0f172a',
            zIndex: isFullscreen ? 9999 : 1,
            transition: 'border-radius 0.2s ease',
          }}
        >
        {/* Door Event Toast Banner */}
        {doorToast && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              background:
                doorToast.type === 'alert'
                  ? '#ef4444'
                  : doorToast.type === 'success'
                  ? '#10b981'
                  : doorToast.type === 'warn'
                  ? '#f59e0b'
                  : '#1c1b1b',
              color: '#ffffff',
              padding: '8px 20px',
              borderRadius: '20px',
              fontWeight: 600,
              fontSize: '12px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              zIndex: 30,
              pointerEvents: 'none',
            }}
          >
            <span>{doorToast.msg}</span>
          </div>
        )}

        {/* Interactive Knock-to-Enter Approval Modal */}
        {currentRoomKnocks.length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: doorToast ? '68px' : '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#ffffff',
              border: '1px solid #D9D7D0',
              borderRadius: '16px',
              padding: '12px 18px',
              boxShadow: '0 16px 36px rgba(0,0,0,0.15)',
              zIndex: 30,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              minWidth: '280px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid #E9E8E4', paddingBottom: '6px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "#1c1b1b" }}>doorbell</span>
              <span style={{ fontWeight: 700, fontSize: '13px', color: '#1c1b1b' }}>
                Knock at the Door
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {currentRoomKnocks.map((k) => (
                <div
                  key={k.visitorId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '6px 10px',
                    background: '#F4F3EF',
                    borderRadius: '10px',
                    border: '1px solid #D9D7D0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "#5e5f5c" }}>person</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '12px', color: '#1c1b1b' }}>
                        {k.visitorName}
                      </div>
                      <div style={{ fontSize: '11px', color: '#5e5f5c' }}>
                        Requests permission to enter
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      onClick={() => handleWelcomeVisitor(k.doorKey, k.visitorId)}
                      style={{
                        padding: '6px 12px',
                        background: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 600,
                        fontSize: '11px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                      title="Welcome visitor into the room and open the door"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>meeting_room</span>
                      <span>Welcome</span>
                    </button>

                    <button
                      onClick={() => handleDeclineVisitor(k.doorKey, k.visitorId)}
                      style={{
                        padding: '6px 10px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#dc2626',
                        borderRadius: '8px',
                        fontWeight: 500,
                        fontSize: '11px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      title="Decline entry (private meeting)"
                    >
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Browser Autoplay / Audio Unlock Banner */}
        {!audioUnlocked && (
          <div
            onClick={() => {
              spatialAudio.resumeAll();
              setAudioUnlocked(true);
            }}
            style={{
              position: 'absolute',
              top: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 35,
              background: '#1c1b1b',
              color: '#ffffff',
              padding: '9px 20px',
              borderRadius: '20px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              animation: 'pulse 2s infinite',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>volume_up</span>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Click anywhere to enable spatial audio</span>
          </div>
        )}

        {/* Minimap Radar Floating Card (Top-Right) */}
        {showRadar && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: showChat ? '336px' : '16px',
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '8px 10px',
              boxShadow: '0 12px 28px rgba(0, 0, 0, 0.35)',
              zIndex: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              transition: 'right 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#38bdf8' }}>radar</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#e2e8f0', letterSpacing: '0.5px' }}>
                  HQ RADAR
                </span>
              </div>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#94a3b8' }}>
                {Math.round(zoom * 100)}%
              </span>
            </div>
            <canvas
              ref={minimapCanvasRef}
              width={210}
              height={124}
              style={{
                display: 'block',
                borderRadius: '8px',
                background: '#0b0f19',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            />
          </div>
        )}

        {/* Floating Zoom & Viewport Controls HUD */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: showChat ? '336px' : '136px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(12px)',
            padding: '4px 8px',
            borderRadius: '12px',
            border: '1px solid #D9D7D0',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)',
            zIndex: 20,
            transition: 'right 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <button
            onClick={() => handleZoomStep(-0.15)}
            style={{
              padding: '4px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Zoom out"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>remove</span>
          </button>
          <button
            onClick={handleZoomReset}
            style={{
              padding: '4px 6px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: '#1f2937',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              minWidth: '38px',
            }}
            title="Reset zoom to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => handleZoomStep(0.15)}
            style={{
              padding: '4px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: '#374151',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Zoom in"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          </button>
          <div style={{ width: '1px', height: '16px', background: '#D9D7D0', margin: '0 2px' }} />
          <button
            onClick={() => setShowRadar((v) => !v)}
            style={{
              padding: '4px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: showRadar ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title={showRadar ? 'Hide radar' : 'Show radar'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>radar</span>
          </button>
          <button
            onClick={() => setIsFullscreen((f) => !f)}
            style={{
              padding: '4px',
              borderRadius: '6px',
              border: 'none',
              background: 'transparent',
              color: isFullscreen ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={1280}
          height={700}
          tabIndex={0}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.08 : 0.08;
            setZoom((prev) => {
              const next = Math.min(1.5, Math.max(0.55, Number((prev + delta).toFixed(2))));
              zoomRef.current = next;
              return next;
            });
          }}
          onClick={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
            const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
            const z = zoomRef.current;
            const wx = (sx - canvas.width / 2) / z + cameraRef.current.x;
            const wy = (sy - canvas.height / 2) / z + cameraRef.current.y;

            // Check if user clicked a door to toggle
            if (activeTheme.hasDoors) {
              for (const [key, d] of Object.entries(DOORS)) {
                if (d.wall) {
                  const dcx = d.wall.x + d.wall.w / 2;
                  const dcy = d.wall.y + d.wall.h / 2;
                  if (Math.hypot(wx - dcx, wy - dcy) < 65) {
                    handleToggleDoor(key);
                    return;
                  }
                }
              }
            }
          }}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            outline: 'none',
            cursor: 'default',
            background: '#0f172a',
          }}
        />

        {/* Chat Sidebar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '320px',
            height: '100%',
            background: 'rgba(255, 255, 255, 0.98)',
            backdropFilter: 'blur(20px)',
            borderLeft: '1px solid #D9D7D0',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: showChat ? '-8px 0 28px rgba(0,0,0,0.10)' : 'none',
            transform: showChat ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            overflow: 'hidden',
            zIndex: 25,
          }}
        >
          {/* Chat Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid #E9E8E4',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#1c1b1b' }}>chat</span>
              <span style={{ fontWeight: 700, fontSize: '14px', color: '#1c1b1b' }}>Room Chat</span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '1px 7px',
                borderRadius: '20px',
                background: '#E9E8E4',
                color: '#5e5f5c',
              }}>{chatMessages.length}</span>
            </div>
            <button
              onClick={() => setShowChat(false)}
              style={{
                background: '#F4F3EF',
                border: '1px solid #D9D7D0',
                color: '#5e5f5c',
                cursor: 'pointer',
                borderRadius: '6px',
                width: '26px',
                height: '26px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                transition: 'all 0.12s ease',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>

          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {chatMessages.length === 0 ? (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                color: '#8C8880',
                userSelect: 'none',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '32px', opacity: 0.4 }}>forum</span>
                <span style={{ fontSize: '12px', fontWeight: 500 }}>No messages yet</span>
                <span style={{ fontSize: '11px', textAlign: 'center', lineHeight: 1.4 }}>
                  Send a message to everyone in this room
                </span>
              </div>
            ) : (
              chatMessages.map((msg, i) => {
                const isSelf = msg.from === socketRef.current?.id;
                const ts = new Date(msg.timestamp);
                const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={i} style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isSelf ? 'flex-end' : 'flex-start',
                    gap: '3px',
                  }}>
                    {!isSelf && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '50%',
                          backgroundColor: msg.avatarColor, flexShrink: 0,
                        }} />
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#5e5f5c' }}>{msg.username}</span>
                      </div>
                    )}
                    <div style={{
                      maxWidth: '220px',
                      padding: '7px 11px',
                      borderRadius: isSelf ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                      background: isSelf ? '#1c1b1b' : '#F4F3EF',
                      color: isSelf ? '#ffffff' : '#1c1b1b',
                      fontSize: '12px',
                      lineHeight: 1.45,
                      wordBreak: 'break-word',
                    }}>
                      {msg.message}
                    </div>
                    <span style={{ fontSize: '10px', color: '#BDBAB2' }}>{timeStr}</span>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div style={{
            padding: '10px 12px',
            borderTop: '1px solid #E9E8E4',
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
            flexShrink: 0,
          }}>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChatMessage();
                }
              }}
              placeholder="Message the room..."
              rows={1}
              style={{
                flex: 1,
                padding: '8px 11px',
                borderRadius: '10px',
                border: '1px solid #D9D7D0',
                fontSize: '12px',
                fontFamily: 'inherit',
                color: '#1c1b1b',
                background: '#FAF9F5',
                resize: 'none',
                outline: 'none',
                lineHeight: 1.4,
                maxHeight: '80px',
                overflowY: 'auto',
                transition: 'border-color 0.12s ease',
              }}
              onFocus={(e) => { e.target.style.borderColor = '#1c1b1b'; }}
              onBlur={(e) => { e.target.style.borderColor = '#D9D7D0'; }}
            />
            <button
              onClick={handleSendChatMessage}
              disabled={!chatInput.trim()}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: 'none',
                background: chatInput.trim() ? '#1c1b1b' : '#E9E8E4',
                color: chatInput.trim() ? '#ffffff' : '#BDBAB2',
                cursor: chatInput.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              title="Send message (Enter)"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>send</span>
            </button>
          </div>
        </div>

        {/* Connection Diagnostics Modal Overlay */}
        {showDiagnostics && (
          <div
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '320px',
              maxHeight: '480px',
              overflowY: 'auto',
              background: '#ffffff',
              border: '1px solid #D9D7D0',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
              zIndex: 25,
              fontSize: '12px',
              color: '#1c1b1b',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid #E9E8E4', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#1c1b1b' }}>tune</span>
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#1c1b1b' }}>Audio Diagnostics</span>
              </div>
              <button
                onClick={() => setShowDiagnostics(false)}
                style={{
                  background: '#F4F3EF',
                  border: '1px solid #D9D7D0',
                  color: '#5e5f5c',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#5e5f5c' }}>Local Mic Input:</span>
                <span style={{ fontWeight: 600, color: diagData?.hasLocalStream ? '#10b981' : '#dc2626' }}>
                  {diagData?.hasLocalStream ? 'Active' : 'No Stream'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#5e5f5c' }}>Track State:</span>
                <span style={{ fontWeight: 600, color: diagData?.micTrackState === 'live' ? '#10b981' : '#d97706' }}>
                  {diagData?.micTrackState || 'none'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#5e5f5c' }}>Mute State:</span>
                <span style={{ fontWeight: 600, color: diagData?.isMuted ? '#dc2626' : '#10b981' }}>
                  {diagData?.isMuted ? 'Muted' : 'Unmuted'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#5e5f5c' }}>AudioContext:</span>
                <span style={{ fontWeight: 600, color: diagData?.audioCtxState === 'running' ? '#10b981' : '#d97706' }}>
                  {diagData?.audioCtxState || 'unknown'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#5e5f5c' }}>Playback Unlocked:</span>
                <span style={{ fontWeight: 600, color: diagData?.isAudioUnlocked ? '#10b981' : '#dc2626' }}>
                  {diagData?.isAudioUnlocked ? 'Yes' : 'No (tap canvas)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#5e5f5c' }}>Connected Peers:</span>
                <span style={{ fontWeight: 600, color: (diagData?.peerCount || 0) > 0 ? '#1c1b1b' : '#5e5f5c' }}>
                  {diagData?.peerCount || 0}
                </span>
              </div>

              {/* Peer Connection Status List */}
              {diagData?.peers && Object.keys(diagData.peers).length > 0 && (
                <div style={{ marginTop: '8px', borderTop: '1px solid #E9E8E4', paddingTop: '8px' }}>
                  <span style={{ color: '#5e5f5c', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Peer ICE States:</span>
                  <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {Object.entries(diagData.peers).map(([pid, pinfo]) => (
                      <div key={pid} style={{ background: '#F4F3EF', padding: '6px 8px', borderRadius: '8px', fontSize: '11px', border: '1px solid #D9D7D0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#1c1b1b', fontWeight: 500 }}>Peer {pid.slice(0, 6)}:</span>
                          <span style={{
                            color: pinfo.iceState === 'connected' || pinfo.iceState === 'completed'
                              ? '#10b981'
                              : pinfo.iceState === 'failed'
                              ? '#dc2626'
                              : '#d97706',
                            fontWeight: 600,
                          }}>
                            {pinfo.iceState}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#5e5f5c', fontSize: '10px', marginTop: '2px' }}>
                          <span>Signaling: {pinfo.signalingState}</span>
                          <span>Sender: {pinfo.senderTrackState}</span>
                        </div>
                        {pinfo.stats && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#93c5fd', fontSize: '10px', marginTop: '3px', borderTop: '1px solid rgba(51, 65, 85, 0.4)', paddingTop: '3px' }}>
                            <span>🌐 {pinfo.stats.modeLabel} ({pinfo.stats.protocol})</span>
                            <span>{pinfo.stats.rtt != null ? `⚡ ${pinfo.stats.rtt}ms RTT` : '⚡ Active'}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Microphone Hardware Selector */}
              {micDevices.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                    🎙️ Microphone Device:
                  </label>
                  <select
                    value={selectedMicId}
                    onChange={async (e) => {
                      const devId = e.target.value;
                      setSelectedMicId(devId);
                      try {
                        await webrtc.switchAudioInputDevice(devId);
                        showToast('Switched microphone device', 'success');
                        refreshDiagnostics();
                      } catch (err) {
                        showToast(`Could not switch mic: ${err.message}`, 'alert');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      background: '#0f172a',
                      border: '1px solid #334155',
                      color: '#f8fafc',
                      fontSize: '11px',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Default Microphone</option>
                    {micDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Quick Action Recovery Buttons */}
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={() => {
                    spatialAudio.resumeAll();
                    setAudioUnlocked(true);
                    refreshDiagnostics();
                    showToast('Audio playback resumed', 'success');
                  }}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #D9D7D0',
                    background: '#F4F3EF',
                    color: '#1c1b1b',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🔊 Resume / Unlock Audio
                </button>
                <button
                  onClick={async () => {
                    try {
                      const audioCtx = spatialAudio.ensureContext();
                      await webrtc.startMicrophone(audioCtx);
                      setMicActive(true);
                      isMutedRef.current = false;
                      setIsMuted(false);
                      refreshDiagnostics();
                      showToast('Microphone re-acquired and unmuted', 'success');
                    } catch (e) {
                      showToast(`${e.message}`, 'alert');
                    }
                  }}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #bbf7d0',
                    background: '#f0fdf4',
                    color: '#166534',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  🎙️ Re-acquire Microphone
                </button>
                <button
                  onClick={() => {
                    webrtc.reconnectAllPeers();
                    spatialAudio.resumeAll();
                    refreshDiagnostics();
                    showToast('Reconnecting all peer connections...', 'info');
                  }}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '8px',
                    border: '1px solid #fde68a',
                    background: '#fffbeb',
                    color: '#92400e',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Force Reconnect All Peers
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Audio Controls HUD */}
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            background: 'rgba(255, 255, 255, 0.96)',
            backdropFilter: 'blur(20px)',
            padding: '4px 6px',
            borderRadius: '12px',
            border: '1px solid #D9D7D0',
            boxShadow: '0 8px 24px -4px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.04)',
            zIndex: 15,
            whiteSpace: 'nowrap',
            boxSizing: 'border-box',
          }}
        >
          {/* Microphone Toggle Button */}
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              canvasRef.current?.focus();
              handleToggleMic();
            }}
            style={{
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              borderRadius: '8px',
              border: isMuted ? '1px solid #fecaca' : 'none',
              background: !micActive
                ? '#1c1b1b'
                : isMuted
                ? '#fef2f2'
                : '#10b981',
              color: isMuted ? '#dc2626' : '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.12s ease',
            }}
            title={!micActive ? 'Click to grant microphone access [M]' : isMuted ? 'Click to Unmute [M]' : 'Click to Mute [M]'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
              {!micActive ? 'mic' : isMuted ? 'mic_off' : 'mic'}
            </span>
            <span>
              {!micActive ? 'Enable Mic' : isMuted ? 'Unmute' : 'Mic On'}
            </span>
          </button>

          {/* Push-to-Talk Active Badge */}
          {isPttActive && (
            <div
              style={{
                height: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0 8px',
                borderRadius: '8px',
                background: '#fef3c7',
                border: '1px solid #fde68a',
                color: '#92400e',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>push_to_talk</span>
              <span>PTT</span>
            </div>
          )}

          {/* Live Mic Voice Intensity Meter */}
          {micActive && !isMuted && (
            <div
              style={{
                height: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0 8px',
                borderRadius: '8px',
                background: '#F4F3EF',
                border: '1px solid #D9D7D0',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
              title="Live voice intensity level"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#8C8880' }}>graphic_eq</span>
              <div style={{ width: '40px', height: '5px', background: '#E9E8E4', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  ref={voiceMeterBarRef}
                  style={{
                    width: '0%',
                    height: '100%',
                    borderRadius: '3px',
                    background: '#10b981',
                    transition: 'width 0.05s ease-out',
                  }}
                />
              </div>
            </div>
          )}

          {/* Divider */}
          <div style={{ width: '1px', height: '18px', background: '#D9D7D0', margin: '0 1px', flexShrink: 0 }} />

          {/* Deafen Toggle Button */}
          <button
            onClick={(e) => {
              e.currentTarget.blur();
              canvasRef.current?.focus();
              handleToggleDeafen();
            }}
            style={{
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 11px',
              borderRadius: '8px',
              border: '1px solid ' + (isDeafened ? '#fecaca' : '#D9D7D0'),
              background: isDeafened ? '#fef2f2' : '#F4F3EF',
              color: isDeafened ? '#dc2626' : '#1c1b1b',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.12s ease',
            }}
            title={isDeafened ? 'Click to un-deafen [D]' : 'Click to mute all incoming audio [D]'}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{isDeafened ? 'headset_off' : 'headphones'}</span>
            <span>{isDeafened ? 'Deafened' : 'Audio On'}</span>
          </button>

          {/* Room Door Control for Members Present Inside Room */}
          {activeTheme.hasDoors && roomDoorKey && (
            <button
              onClick={() => handleToggleDoor(roomDoorKey)}
              style={{
                height: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0 11px',
                borderRadius: '8px',
                border: '1px solid ' + (isRoomDoorOpen ? '#fde68a' : '#bbf7d0'),
                background: isRoomDoorOpen ? '#fffbeb' : '#f0fdf4',
                color: isRoomDoorOpen ? '#92400e' : '#166534',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.12s ease',
              }}
              title={
                isRoomDoorOpen
                  ? `Close door to make ${DOORS[roomDoorKey]?.name || 'room'} private`
                  : `Open door to welcome other members in`
              }
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{isRoomDoorOpen ? 'lock' : 'meeting_room'}</span>
              <span>{isRoomDoorOpen ? 'Close Door' : 'Open Door'}</span>
            </button>
          )}

          {/* Door Controls for Members Approaching from Outside */}
          {activeTheme.hasDoors && isOutsideNearbyDoor && (
            <>
              {nearbyDoorOccupants === 0 && (
                <button
                  onClick={() => handleToggleDoor(nearbyDoor)}
                  style={{
                    height: '32px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '0 11px',
                    borderRadius: '8px',
                    border: '1px solid ' + (isNearbyDoorOpen ? '#fde68a' : '#bbf7d0'),
                    background: isNearbyDoorOpen ? '#fffbeb' : '#f0fdf4',
                    color: isNearbyDoorOpen ? '#92400e' : '#166534',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'all 0.12s ease',
                  }}
                  title={isNearbyDoorOpen ? 'Close door' : 'Open door'}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{isNearbyDoorOpen ? 'lock' : 'meeting_room'}</span>
                  <span>{isNearbyDoorOpen ? 'Close Door' : 'Open Door'}</span>
                </button>
              )}
              {nearbyDoorOccupants > 0 && (
                <>
                  {!isNearbyDoorOpen && (
                    <>
                      {welcomedDoors[nearbyDoor] ? (
                        <button
                          onClick={() => handleToggleDoor(nearbyDoor)}
                          style={{
                            height: '32px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '0 11px',
                            borderRadius: '8px',
                            border: '1px solid #bbf7d0',
                            background: '#f0fdf4',
                            color: '#166534',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>meeting_room</span>
                          <span>Enter Room</span>
                        </button>
                      ) : myKnockStatus?.doorKey === nearbyDoor && myKnockStatus?.status === 'waiting' ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          <div
                            style={{
                              height: '32px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '0 9px',
                              borderRadius: '8px',
                              background: '#fffbeb',
                              border: '1px solid #fde68a',
                              color: '#92400e',
                              fontSize: '12px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>hourglass_top</span>
                            <span>Waiting...</span>
                          </div>
                          <button
                            onClick={() => handleCancelKnock(nearbyDoor)}
                            style={{
                              height: '32px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '0 8px',
                              borderRadius: '8px',
                              border: '1px solid #D9D7D0',
                              background: '#F4F3EF',
                              color: '#5e5f5c',
                              fontSize: '11px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : myKnockStatus?.doorKey === nearbyDoor && myKnockStatus?.status === 'declined' ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          <div
                            style={{
                              height: '32px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '0 9px',
                              borderRadius: '8px',
                              background: '#fef2f2',
                              border: '1px solid #fecaca',
                              color: '#dc2626',
                              fontSize: '12px',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>lock</span>
                            <span>Private</span>
                          </div>
                          <button
                            onClick={() => handleKnockDoor(nearbyDoor)}
                            style={{
                              height: '32px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '0 9px',
                              borderRadius: '8px',
                              border: '1px solid #D9D7D0',
                              background: '#1c1b1b',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Knock
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleKnockDoor(nearbyDoor)}
                          style={{
                            height: '32px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '0 11px',
                            borderRadius: '8px',
                            border: '1px solid #D9D7D0',
                            background: '#1c1b1b',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>doorbell</span>
                          <span>Knock to Enter</span>
                        </button>
                      )}
                    </>
                  )}
                  {isNearbyDoorOpen && (
                    <div
                      style={{
                        height: '32px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '0 9px',
                        borderRadius: '8px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        color: '#166534',
                        fontSize: '12px',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>meeting_room</span>
                      <span>Door Open</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Divider */}
          <div style={{ width: '1px', height: '18px', background: '#D9D7D0', margin: '0 1px', flexShrink: 0 }} />

          {/* In-Earshot Proximity Counter */}
          <div
            style={{
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 9px',
              borderRadius: '8px',
              background: '#F4F3EF',
              border: '1px solid #D9D7D0',
              fontSize: '12px',
              color: '#5e5f5c',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: inEarshotCount > 0 ? '#10b981' : '#BDBAB2',
                flexShrink: 0,
              }}
            />
            <span style={{ color: inEarshotCount > 0 ? '#059669' : '#5e5f5c', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {inEarshotCount} nearby
            </span>
          </div>

          {/* Connection Diagnostics Toggle */}
          <button
            onClick={() => {
              refreshDiagnostics();
              setShowDiagnostics((prev) => !prev);
            }}
            style={{
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0 9px',
              borderRadius: '8px',
              border: '1px solid ' + (showDiagnostics ? '#1c1b1b' : '#D9D7D0'),
              background: showDiagnostics ? '#E9E8E4' : '#F4F3EF',
              color: '#1c1b1b',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.12s ease',
            }}
            title="Audio & WebRTC Connection Diagnostics"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>tune</span>
            <span>Diag</span>
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '18px', background: '#D9D7D0', margin: '0 1px', flexShrink: 0 }} />

          {/* Chat Toggle Button */}
          <button
            onClick={() => setShowChat((prev) => !prev)}
            style={{
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0 10px',
              borderRadius: '8px',
              border: '1px solid ' + (showChat ? '#1c1b1b' : '#D9D7D0'),
              background: showChat ? '#1c1b1b' : '#F4F3EF',
              color: showChat ? '#ffffff' : '#1c1b1b',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.12s ease',
              position: 'relative',
            }}
            title="Toggle room chat"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>chat</span>
            <span>Chat</span>
            {chatMessages.length > 0 && !showChat && (
              <span style={{
                position: 'absolute',
                top: '4px',
                right: '4px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#FF4B2B',
              }} />
            )}
          </button>

          {/* Divider */}
          <div style={{ width: '1px', height: '18px', background: '#D9D7D0', margin: '0 1px', flexShrink: 0 }} />

          {/* End Call / Leave Room Button */}
          <button
            onClick={handleLeaveCall}
            style={{
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '0 12px',
              borderRadius: '8px',
              border: 'none',
              background: '#dc2626',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.12s ease',
              boxShadow: '0 2px 6px rgba(220,38,38,0.20)',
            }}
            title="End call and leave room"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>call_end</span>
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  </div>
);
}
