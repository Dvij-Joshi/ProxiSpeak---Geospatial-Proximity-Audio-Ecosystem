import { useRef, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { spatialAudio, MAX_DISTANCE } from './services/spatialAudio';
import { webrtc } from './services/webrtc';

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 1200;
const H = 680;
const SPEED = 2.8;
const R = 14; // avatar radius

const DEFAULT_SERVER_URL =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'
    ? 'https://proxispeak-server.onrender.com'
    : '';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL;
const MOVE_THROTTLE_MS = 50; // emit move at most every 50ms

// ─── Office Theme Layout ──────────────────────────────────────────────────────
const OFFICE_FLOORS = [
  { x: 18, y: 18, w: W - 36, h: H - 36, color: '#f0ede8' },
  { x: 18, y: 18, w: 298, h: 248, color: '#ddedf7' },
  { x: 358, y: 18, w: 228, h: 215, color: '#f7f0e0' },
  { x: 868, y: 18, w: 314, h: 225, color: '#e0f0e8' },
  { x: 18, y: 492, w: 278, h: H - 510, color: '#fff4e0' },
  { x: 942, y: 490, w: 240, h: H - 508, color: '#f0e8f8' },
];

const OFFICE_LABELS = [
  { text: 'Meeting Room',     x: 167, y: 40 },
  { text: "Manager's Office", x: 472, y: 40 },
  { text: 'Tech / Server',    x: 1025, y: 40 },
  { text: 'Lounge & Break',   x: 157, y: 515 },
  { text: 'Print / Copy',     x: 1062, y: 512 },
  { text: 'Open Workspace',   x: 630, y: 318 },
];

const OFFICE_WALLS = [
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

const OFFICE_FURNITURE = [
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

const OFFICE_DOOR_ARCS = [
  [276, 261, 40, -Math.PI / 2, 0],
  [543, 228, 43, -Math.PI / 2, 0],
  [863, 155, 70, 0, Math.PI / 2],
  [240, 487, 56, Math.PI, Math.PI * 1.5],
  [937, 570, 65, 0, Math.PI / 2],
];

// ─── Conference & Auditorium Layout ───────────────────────────────────────────
const CONF_WALLS = [
  { x: 10, y: 10, w: W - 20, h: 8 },
  { x: 10, y: 10, w: 8, h: H - 20 },
  { x: W - 18, y: 10, w: 8, h: H - 20 },
  { x: 10, y: H - 18, w: W - 20, h: 8 },
  // West Breakout Wing wall
  { x: 280, y: 18, w: 8, h: 180 },
  { x: 280, y: 280, w: 8, h: 215 },
  // East Breakout Wing wall
  { x: 915, y: 18, w: 8, h: 180 },
  { x: 915, y: 280, w: 8, h: 215 },
  // Stage barriers
  { x: 288, y: 168, w: 240, h: 8 },
  { x: 672, y: 168, w: 243, h: 8 },
  // Foyer divider
  { x: 18, y: 495, w: 460, h: 8 },
  { x: 722, y: 495, w: 460, h: 8 },
];

// ─── Rooftop Lounge Layout ───────────────────────────────────────────────────
const LOUNGE_WALLS = [
  { x: 10, y: 10, w: W - 20, h: 8 },
  { x: 10, y: 10, w: 8, h: H - 20 },
  { x: W - 18, y: 10, w: 8, h: H - 20 },
  { x: 10, y: H - 18, w: W - 20, h: 8 },
  // VIP west partition
  { x: 295, y: 18, w: 8, h: 180 },
  { x: 295, y: 280, w: 8, h: 195 },
  // Games east partition
  { x: 895, y: 18, w: 8, h: 180 },
  { x: 895, y: 280, w: 8, h: 195 },
  // Terrace balustrade
  { x: 18, y: 475, w: 450, h: 6 },
  { x: 732, y: 475, w: 450, h: 6 },
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
  ctx.strokeStyle = 'rgba(100,140,200,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  for (const [cx, cy, rad, sa, ea] of OFFICE_DOOR_ARCS) {
    ctx.beginPath(); ctx.arc(cx, cy, rad, sa, ea); ctx.stroke();
  }
  ctx.setLineDash([]);
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
  ctx.fillText('KEYNOTE PRESENTATION · PROXISPEAK', 600, 56);
  ctx.restore();

  // Speaker podium
  drawRoundRect(ctx, 350, 92, 54, 42, 4);
  ctx.fillStyle = '#4f46e5'; ctx.fill();
  ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = '14px sans-serif'; ctx.fillText('🎙️', 377, 118);

  // Auditorium Seating rows (left and right banks, center aisle)
  const rows = 4, cols = 5;
  // Left seating bank
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
  // Right seating bank
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

  // High-top cocktail tables in foyer
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
  // Deck timber lines
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
  ctx.fillText('🍸 ROOFTOP ESPRESSO & COCKTAIL BAR 🍾', 600, 48);

  // West VIP Booths (L-shaped couches and low tables)
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
  // Table pockets
  for (const [px, py] of [
    [960, 100], [1042, 100], [1125, 100],
    [960, 195], [1042, 195], [1125, 195],
  ]) {
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#1c1917'; ctx.fill();
  }
  ctx.restore();

  // Lounge chairs around coffee table in rec room
  drawRoundTable(ctx, 1042, 320, 32, 4, '#78350f');

  // Sunset Terrace - Parasol patio tables
  drawParasol(ctx, 230, 570, '#06b6d4');
  drawParasol(ctx, 600, 570, '#f59e0b');
  drawParasol(ctx, 970, 570, '#ec4899');

  // Terrace railing plants
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

// ─── Theme Registry ───────────────────────────────────────────────────────────
const THEMES = {
  office: {
    id: 'office',
    name: 'Corporate Office',
    icon: '🏢',
    badgeColor: '#3b82f6',
    spawn: { x: 620, y: 390 },
    draw: drawOffice,
    walls: OFFICE_WALLS,
  },
  conference: {
    id: 'conference',
    name: 'Conference & Auditorium',
    icon: '🏛️',
    badgeColor: '#8b5cf6',
    spawn: { x: 600, y: 570 },
    draw: drawConference,
    walls: CONF_WALLS,
  },
  lounge: {
    id: 'lounge',
    name: 'Rooftop Social Lounge',
    icon: '☕',
    badgeColor: '#10b981',
    spawn: { x: 600, y: 360 },
    draw: drawLounge,
    walls: LOUNGE_WALLS,
  },
};

// ─── Collision ────────────────────────────────────────────────────────────────
function collidesWithWall(nx, ny, walls) {
  for (const w of walls) {
    const cx = Math.max(w.x, Math.min(nx, w.x + w.w));
    const cy = Math.max(w.y, Math.min(ny, w.y + w.h));
    if ((nx - cx) ** 2 + (ny - cy) ** 2 < R * R) return true;
  }
  return false;
}

// ─── Avatar Drawing with Voice Visualizers ────────────────────────────────────
function drawAvatar(ctx, x, y, color, username, moving, isMe = false, isMuted = false, isSpeaking = false, volumeGain = 0, voiceIntensity = 0) {
  // Proximity earshot ring (only local player)
  if (isMe) {
    ctx.beginPath();
    ctx.arc(x, y, MAX_DISTANCE, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.22)';
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
export default function WorldCanvas({
  user,
  username: propUsername,
  avatarColor: propAvatarColor,
  room,
  onLeaveRoom,
}) {
  const username = user?.username || propUsername || 'Anonymous';
  const avatarColor = user?.avatarColor || propAvatarColor || '#3b82f6';
  const roomId = room?.roomId || 'main-office';
  const roomName = room?.name || 'Workspace';
  const themeKey = (room?.theme && THEMES[room.theme]) ? room.theme : 'office';
  const activeTheme = THEMES[themeKey];

  const canvasRef   = useRef(null);
  const stateRef    = useRef({ x: activeTheme.spawn.x, y: activeTheme.spawn.y, keys: {}, moving: false });
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
  const [copiedLink, setCopiedLink] = useState(false);

  const isMutedRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const renderRef = useRef(null);
  const offscreenRef = useRef(null);

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
    if (onLeaveRoom) {
      onLeaveRoom();
    }
  }, [roomId, onLeaveRoom]);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = stateRef.current;

    // 1. Static themed canvas background layer
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
    ctx.fillStyle = 'rgba(15,17,23,0.82)';
    drawRoundRect(ctx, 16, H - 52, 280, 36, 6);
    ctx.fill();
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('W A S D  /  ↑ ↓ ← →  to move', 26, H - 33);
    ctx.fillStyle = '#64748b';
    ctx.fillText(`👥 ${userCount} participant${userCount !== 1 ? 's' : ''} in room`, 26, H - 18);

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
    const audioCtx = spatialAudio.ensureContext();
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    if (!micActive) {
      try {
        await webrtc.startMicrophone(audioCtx);
        setMicActive(true);
        isMutedRef.current = false;
        setIsMuted(false);
      } catch (err) {
        alert('Microphone permission required for voice audio: ' + (err.message || err));
      }
    } else {
      const newMuted = webrtc.toggleMute(roomId);
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

  // ── Voice intensity polling ───────────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      const v = webrtc.getLocalVoiceIntensity();
      localIntensityRef.current = v;
      setLocalIntensityState(v);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  // ── Main Socket & Game Loop Lifecycle ─────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.focus();

    // Reset local player spawn point for this theme
    stateRef.current.x = activeTheme.spawn.x;
    stateRef.current.y = activeTheme.spawn.y;

    // Pre-render static theme canvas background
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    activeTheme.draw(offscreen.getContext('2d'));
    offscreenRef.current = offscreen;

    // Connect to Socket.io server
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

    // AudioContext unlock on gesture
    const unlockAudio = () => {
      spatialAudio.ensureContext();
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    socket.on('connect', () => {
      console.log(`[Socket] connected (${socket.id}) to room: ${roomId}`);
      socket.emit('join-room', { username, avatarColor, roomId });
    });

    // Room state (existing participants)
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

    // New participant joins
    socket.on('user-joined', ({ id, username: uname, avatarColor: ucolor, x, y, isMuted: peerMuted }) => {
      peersRef.current[id] = {
        x,
        y,
        username: uname,
        avatarColor: ucolor,
        isMuted: peerMuted ?? false,
      };
      webrtc.getOrCreatePeer(id, false);
    });

    // Participant moves
    socket.on('user-moved', ({ id, x, y }) => {
      if (peersRef.current[id]) {
        peersRef.current[id].x = x;
        peersRef.current[id].y = y;
      }
    });

    // Participant mute toggle
    socket.on('user-mute-status', ({ id, isMuted: peerMuted }) => {
      if (peersRef.current[id]) {
        peersRef.current[id].isMuted = peerMuted;
      }
    });

    // Participant leaves
    socket.on('user-left', ({ id }) => {
      delete peersRef.current[id];
      delete peerVolumesRef.current[id];
      webrtc.removePeer(id);
      spatialAudio.removePeerStream(id);
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
      const currentWalls = activeTheme.walls;
      if (dx && !collidesWithWall(s.x + dx, s.y, currentWalls)) s.x += dx;
      if (dy && !collidesWithWall(s.x, s.y + dy, currentWalls)) s.y += dy;

      // Update Web Audio distance attenuation based on current positions
      const { inEarshotCount: currentInEarshot, peerVolumes, peerIntensities } = spatialAudio.updatePositions(s, peersRef.current);
      peerVolumesRef.current = peerVolumes;
      peerIntensitiesRef.current = peerIntensities || {};
      setInEarshotCount(currentInEarshot);

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
      cancelAnimationFrame(rafRef.current);
      clearInterval(keepAliveTimer);
      try {
        socket.emit('leave-room', { roomId });
        socket.disconnect();
        webrtc.closeAll();
        spatialAudio.destroy();
      } catch (_e) {}
    };
  }, [roomId, username, avatarColor, activeTheme]);

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'12px', padding:'16px' }}>
      {/* Top Header Bar */}
      <div
        style={{
          display:'flex',
          alignItems:'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: `${W}px`,
          padding: '4px 8px',
        }}
      >
        {/* Left: Room Brand & Info */}
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <span style={{ fontSize:'28px' }}>{activeTheme.icon}</span>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <h2 style={{ fontWeight:700, fontSize:'20px', color:'#f8fafc', letterSpacing:'-0.02em', margin: 0 }}>
                {roomName}
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 9px',
                  borderRadius: '12px',
                  background: `${activeTheme.badgeColor}22`,
                  color: activeTheme.badgeColor,
                  border: `1px solid ${activeTheme.badgeColor}55`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {activeTheme.name}
              </span>
            </div>
            <div style={{ fontSize:'12px', color:'#64748b', marginTop: '2px' }}>
              Room ID: <code style={{ color:'#94a3b8', background:'#1e293b', padding:'1px 6px', borderRadius:'4px' }}>{roomId}</code>
            </div>
          </div>
        </div>

        {/* Right: Actions & User Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Copy Invite Link Button */}
          <button
            onClick={handleCopyInviteLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: copiedLink ? '#10b981' : '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title="Copy meeting invite link to clipboard"
          >
            <span>{copiedLink ? '✓' : '🔗'}</span>
            <span>{copiedLink ? 'Link Copied!' : 'Copy Invite Link'}</span>
          </button>

          {/* User Profile Badge */}
          <div
            style={{
              background:'#1e293b',
              border:'1px solid #334155',
              borderRadius:'20px',
              padding:'6px 14px',
              fontSize:'13px',
              color:'#94a3b8',
              display:'flex',
              alignItems:'center',
              gap:'8px',
            }}
          >
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: avatarColor,
              }}
            />
            <span style={{ color: '#f8fafc', fontWeight: 600 }}>{username}</span>
          </div>

          {/* Header Leave Room Button */}
          <button
            onClick={handleLeaveCall}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: '#dc2626',
              border: 'none',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            title="Leave meeting and return to lobby"
          >
            <span>📞</span>
            <span>Leave</span>
          </button>
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
            cursor:'default', // FIXED: Mouse cursor remains visible on canvas
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
            background: 'rgba(15, 23, 42, 0.90)',
            backdropFilter: 'blur(12px)',
            padding: '8px 20px',
            borderRadius: '40px',
            border: '1px solid rgba(51, 65, 85, 0.7)',
            boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
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
              <div style={{ width: '60px', height: '8px', background: '#0f172a', borderRadius: '4px', overflow: 'hidden', padding: '1px', border: '1px solid rgba(51, 65, 85, 0.5)' }}>
                <div
                  style={{
                    width: `${Math.round(localIntensityState * 100)}%`,
                    minWidth: localIntensityState > 0.02 ? '4px' : '0px',
                    height: '100%',
                    borderRadius: '3px',
                    background: localIntensityState > 0.6 ? '#f59e0b' : '#22c55e',
                    boxShadow: localIntensityState > 0.1 ? '0 0 8px rgba(34, 197, 94, 0.7)' : 'none',
                    transition: 'width 0.04s ease-out',
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

          {/* End Call / Leave Room Button */}
          <button
            onClick={handleLeaveCall}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 18px',
              borderRadius: '25px',
              border: 'none',
              background: '#dc2626',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            title="End call and leave room"
          >
            <span>📞</span>
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
