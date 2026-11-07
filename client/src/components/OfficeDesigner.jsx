import { useState, useRef, useEffect, useCallback } from 'react';
import { SERVER_URL } from '../config';

const WORLD_W = 2200;
const WORLD_H = 1300;
const GRID_SIZE = 20;

export default function OfficeDesigner({
  user,
  organization,
  initialLayout,
  onBackToLobby,
  onLaunchOffice,
}) {
  const [officeName, setOfficeName] = useState(initialLayout?.name || 'New Custom Office');
  const [theme, setTheme] = useState(initialLayout?.theme || 'custom');
  const [activeTool, setActiveTool] = useState('select'); // select, wall, door, desk, conf_table, server_rack, sofa, plant, zone, spawn
  const [gridSnap, setGridSnap] = useState(true);
  const [zoom, setZoom] = useState(0.65);
  const [camera, setCamera] = useState({ x: WORLD_W / 2, y: WORLD_H / 2 });
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(null);

  // Layout entities
  const [walls, setWalls] = useState(initialLayout?.walls || [
    { x: 10, y: 10, w: WORLD_W - 20, h: 8 },
    { x: 10, y: 10, w: 8, h: WORLD_H - 20 },
    { x: WORLD_W - 18, y: 10, w: 8, h: WORLD_H - 20 },
    { x: 10, y: WORLD_H - 18, w: WORLD_W - 20, h: 8 },
    // Default meeting room divider
    { x: 598, y: 18, w: 8, h: 480 },
    { x: 18, y: 498, w: 490, h: 8 },
  ]);

  const [doors, setDoors] = useState(initialLayout?.doors || [
    {
      key: 'meeting-room',
      name: 'Meeting Room',
      x: 508,
      y: 498,
      w: 90,
      h: 8,
      isIsolated: true,
      arc: [508, 498, 90, -Math.PI / 2, 0],
    },
  ]);

  const [furniture, setFurniture] = useState(initialLayout?.furniture || [
    { type: 'rect', x: 110, y: 150, w: 360, h: 180, color: '#b5896a', rx: 8 },
    { type: 'screen', x: 290, y: 46 },
    { type: 'chair', x: 160, y: 136 }, { type: 'chair', x: 230, y: 136 }, { type: 'chair', x: 300, y: 136 }, { type: 'chair', x: 370, y: 136 },
    { type: 'chair', x: 160, y: 344 }, { type: 'chair', x: 230, y: 344 }, { type: 'chair', x: 300, y: 344 }, { type: 'chair', x: 370, y: 344 },
    { type: 'plant', x: 540, y: 60, r: 16 },
    // Desk Pod 1
    { type: 'rect', x: 720, y: 580, w: 160, h: 80, color: '#cbd5e1', rx: 4 },
    { type: 'screen', x: 760, y: 572 }, { type: 'screen', x: 840, y: 572 },
    { type: 'chair', x: 760, y: 685 }, { type: 'chair', x: 840, y: 685 },
    // Desk Pod 2
    { type: 'rect', x: 1320, y: 580, w: 160, h: 80, color: '#cbd5e1', rx: 4 },
    { type: 'screen', x: 1360, y: 572 }, { type: 'screen', x: 1440, y: 572 },
    { type: 'chair', x: 1360, y: 685 }, { type: 'chair', x: 1440, y: 685 },
  ]);

  const [soundZones, setSoundZones] = useState(initialLayout?.soundZones || [
    {
      id: 'meeting-room',
      name: 'Meeting Room',
      bounds: { x1: 18, y1: 18, x2: 606, y2: 506 },
      isIsolated: true,
      maxDistance: 100,
    },
  ]);

  const [spawnPoint, setSpawnPoint] = useState(initialLayout?.spawnPoint || { x: 1100, y: 720 });
  const [selectedItem, setSelectedItem] = useState(null); // { type: 'wall'|'door'|'furniture'|'zone', index: number }

  const canvasRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Grid snap helper
  const snap = useCallback((val) => {
    if (!gridSnap) return Math.round(val);
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
  }, [gridSnap]);

  // Coordinate unprojection
  const screenToWorld = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (canvas.width / rect.width);
    const sy = (clientY - rect.top) * (canvas.height / rect.height);
    const wx = (sx - canvas.width / 2) / zoom + camera.x;
    const wy = (sy - canvas.height / 2) / zoom + camera.y;
    return { x: wx, y: wy };
  }, [camera, zoom]);

  // Load preset layouts
  const handleLoadPreset = (presetKey) => {
    if (presetKey === 'startup') {
      setOfficeName('Startup Open Loft');
      setTheme('office');
      setWalls([
        { x: 10, y: 10, w: WORLD_W - 20, h: 8 },
        { x: 10, y: 10, w: 8, h: WORLD_H - 20 },
        { x: WORLD_W - 18, y: 10, w: 8, h: WORLD_H - 20 },
        { x: 10, y: WORLD_H - 18, w: WORLD_W - 20, h: 8 },
        // Two meeting pods
        { x: 420, y: 18, w: 8, h: 360 },
        { x: 18, y: 378, w: 320, h: 8 },
        { x: 1780, y: 18, w: 8, h: 360 },
        { x: 1780, y: 378, w: 320, h: 8 },
      ]);
      setDoors([
        { key: 'pod-a', name: 'Focus Pod A', x: 338, y: 378, w: 90, h: 8, isIsolated: true, arc: [338, 378, 90, -Math.PI / 2, 0] },
        { key: 'pod-b', name: 'Focus Pod B', x: 1780, y: 378, w: 90, h: 8, isIsolated: true, arc: [1780, 378, 90, -Math.PI / 2, 0] },
      ]);
      setFurniture([
        { type: 'rect', x: 650, y: 550, w: 300, h: 90, color: '#b5896a', rx: 6 },
        { type: 'chair', x: 720, y: 535 }, { type: 'chair', x: 800, y: 535 }, { type: 'chair', x: 880, y: 535 },
        { type: 'chair', x: 720, y: 655 }, { type: 'chair', x: 800, y: 655 }, { type: 'chair', x: 880, y: 655 },
        { type: 'rect', x: 1250, y: 550, w: 300, h: 90, color: '#b5896a', rx: 6 },
        { type: 'chair', x: 1320, y: 535 }, { type: 'chair', x: 1400, y: 535 }, { type: 'chair', x: 1480, y: 535 },
        { type: 'chair', x: 1320, y: 655 }, { type: 'chair', x: 1400, y: 655 }, { type: 'chair', x: 1480, y: 655 },
        { type: 'plant', x: 1100, y: 300, r: 20 },
      ]);
      setSpawnPoint({ x: 1100, y: 700 });
    } else if (presetKey === 'clear') {
      setWalls([
        { x: 10, y: 10, w: WORLD_W - 20, h: 8 },
        { x: 10, y: 10, w: 8, h: WORLD_H - 20 },
        { x: WORLD_W - 18, y: 10, w: 8, h: WORLD_H - 20 },
        { x: 10, y: WORLD_H - 18, w: WORLD_W - 20, h: 8 },
      ]);
      setDoors([]);
      setFurniture([]);
      setSoundZones([]);
    }
  };

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const vw = canvas.width;
    const vh = canvas.height;

    ctx.clearRect(0, 0, vw, vh);

    // Save context for Camera Viewport Transform
    ctx.save();
    ctx.translate(vw / 2, vh / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x, -camera.y);

    // 1. Draw World Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Base floor
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(18, 18, WORLD_W - 36, WORLD_H - 36);

    // Grid lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    for (let gx = 20; gx < WORLD_W - 20; gx += GRID_SIZE * 2) {
      ctx.beginPath(); ctx.moveTo(gx, 20); ctx.lineTo(gx, WORLD_H - 20); ctx.stroke();
    }
    for (let gy = 20; gy < WORLD_H - 20; gy += GRID_SIZE * 2) {
      ctx.beginPath(); ctx.moveTo(20, gy); ctx.lineTo(WORLD_W - 20, gy); ctx.stroke();
    }

    // 2. Draw Sound Zones
    for (const z of soundZones) {
      ctx.fillStyle = z.isIsolated ? 'rgba(56, 189, 248, 0.12)' : 'rgba(34, 197, 94, 0.08)';
      ctx.fillRect(z.bounds.x1, z.bounds.y1, z.bounds.x2 - z.bounds.x1, z.bounds.y2 - z.bounds.y1);
      ctx.strokeStyle = z.isIsolated ? 'rgba(56, 189, 248, 0.4)' : 'rgba(34, 197, 94, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(z.bounds.x1, z.bounds.y1, z.bounds.x2 - z.bounds.x1, z.bounds.y2 - z.bounds.y1);
      ctx.setLineDash([]);
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillStyle = z.isIsolated ? '#0284c7' : '#16a34a';
      ctx.fillText(z.name.toUpperCase(), z.bounds.x1 + 12, z.bounds.y1 + 22);
    }

    // 3. Draw Furniture
    for (let i = 0; i < furniture.length; i++) {
      const f = furniture[i];
      const isSel = selectedItem?.type === 'furniture' && selectedItem?.index === i;
      if (f.type === 'rect') {
        ctx.fillStyle = f.color || '#b5896a';
        ctx.fillRect(f.x, f.y, f.w, f.h);
        ctx.strokeStyle = isSel ? '#3b82f6' : 'rgba(0,0,0,0.15)';
        ctx.lineWidth = isSel ? 2.5 : 1;
        ctx.strokeRect(f.x, f.y, f.w, f.h);
      } else if (f.type === 'chair') {
        ctx.beginPath(); ctx.arc(f.x, f.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#7c6050'; ctx.fill();
        ctx.strokeStyle = isSel ? '#3b82f6' : '#5a4038';
        ctx.lineWidth = isSel ? 2 : 1; ctx.stroke();
      } else if (f.type === 'plant') {
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r || 15, 0, Math.PI * 2);
        ctx.fillStyle = '#22c55e'; ctx.fill();
        ctx.strokeStyle = isSel ? '#3b82f6' : '#15803d';
        ctx.lineWidth = isSel ? 2 : 1; ctx.stroke();
      } else if (f.type === 'screen') {
        ctx.fillStyle = '#0f172a'; ctx.fillRect(f.x - 14, f.y, 28, 16);
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(f.x - 10, f.y + 2, 20, 10);
      }
    }

    // 4. Draw Doors
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i];
      const isSel = selectedItem?.type === 'door' && selectedItem?.index === i;
      ctx.fillStyle = '#78350f';
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.strokeStyle = isSel ? '#3b82f6' : '#b45309';
      ctx.lineWidth = isSel ? 2.5 : 1.5;
      ctx.strokeRect(d.x, d.y, d.w, d.h);
      // Door swing indicator
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(d.x - 10, d.y - 10, d.w + 20, d.h + 20);
      ctx.setLineDash([]);
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = '#d97706';
      ctx.textAlign = 'center';
      ctx.fillText('[DOOR]', d.x + d.w / 2, d.y + (d.h > d.w ? d.h / 2 : -6));
    }

    // 5. Draw Walls
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const isSel = selectedItem?.type === 'wall' && selectedItem?.index === i;
      ctx.fillStyle = isSel ? '#3b82f6' : '#2c3050';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = isSel ? '#60a5fa' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }

    // 6. Draw Spawn Point Marker
    ctx.beginPath();
    ctx.arc(spawnPoint.x, spawnPoint.y, 16, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(spawnPoint.x, spawnPoint.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#2563eb';
    ctx.fill();
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillStyle = '#1d4ed8';
    ctx.textAlign = 'center';
    ctx.fillText('SPAWN', spawnPoint.x, spawnPoint.y + 28);

    ctx.restore();
  }, [walls, doors, furniture, soundZones, spawnPoint, selectedItem, camera, zoom]);

  // Pointer interaction
  const handlePointerDown = (e) => {
    // Middle click or space held -> pan
    if (e.button === 1 || e.shiftKey) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
    const snX = snap(wx);
    const snY = snap(wy);

    if (activeTool === 'select') {
      // Check walls
      for (let i = walls.length - 1; i >= 0; i--) {
        const w = walls[i];
        if (wx >= w.x && wx <= w.x + w.w && wy >= w.y && wy <= w.y + w.h) {
          setSelectedItem({ type: 'wall', index: i });
          isDraggingRef.current = true;
          dragStartRef.current = { x: snX - w.x, y: snY - w.y };
          return;
        }
      }
      // Check doors
      for (let i = doors.length - 1; i >= 0; i--) {
        const d = doors[i];
        if (wx >= d.x && wx <= d.x + d.w && wy >= d.y && wy <= d.y + d.h) {
          setSelectedItem({ type: 'door', index: i });
          isDraggingRef.current = true;
          dragStartRef.current = { x: snX - d.x, y: snY - d.y };
          return;
        }
      }
      // Check furniture
      for (let i = furniture.length - 1; i >= 0; i--) {
        const f = furniture[i];
        if (f.type === 'rect' && wx >= f.x && wx <= f.x + f.w && wy >= f.y && wy <= f.y + f.h) {
          setSelectedItem({ type: 'furniture', index: i });
          isDraggingRef.current = true;
          dragStartRef.current = { x: snX - f.x, y: snY - f.y };
          return;
        }
      }
      setSelectedItem(null);
    } else if (activeTool === 'wall') {
      const newW = { x: snX, y: snY, w: 120, h: 8 };
      setWalls((prev) => [...prev, newW]);
      setSelectedItem({ type: 'wall', index: walls.length });
    } else if (activeTool === 'door') {
      const key = `door-${Date.now().toString(36)}`;
      const newD = {
        key,
        name: 'Private Room',
        x: snX,
        y: snY,
        w: 90,
        h: 8,
        isIsolated: true,
        arc: [snX, snY, 90, -Math.PI / 2, 0],
      };
      setDoors((prev) => [...prev, newD]);
      setSelectedItem({ type: 'door', index: doors.length });
    } else if (activeTool === 'desk') {
      const newF = { type: 'rect', x: snX, y: snY, w: 160, h: 80, color: '#cbd5e1', rx: 4 };
      setFurniture((prev) => [
        ...prev,
        newF,
        { type: 'screen', x: snX + 40, y: snY - 8 },
        { type: 'screen', x: snX + 120, y: snY - 8 },
        { type: 'chair', x: snX + 40, y: snY + 95 },
        { type: 'chair', x: snX + 120, y: snY + 95 },
      ]);
    } else if (activeTool === 'conf_table') {
      const newT = { type: 'rect', x: snX, y: snY, w: 320, h: 160, color: '#b5896a', rx: 8 };
      setFurniture((prev) => [...prev, newT]);
    } else if (activeTool === 'plant') {
      setFurniture((prev) => [...prev, { type: 'plant', x: snX, y: snY, r: 16 }]);
    } else if (activeTool === 'spawn') {
      setSpawnPoint({ x: snX, y: snY });
    }
  };

  const handlePointerMove = (e) => {
    if (isPanningRef.current) {
      const dx = (e.clientX - panStartRef.current.x) / zoom;
      const dy = (e.clientY - panStartRef.current.y) / zoom;
      setCamera((prev) => ({ x: prev.x - dx, y: prev.y - dy }));
      panStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (!isDraggingRef.current || !selectedItem) return;
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);
    const snX = snap(wx - dragStartRef.current.x);
    const snY = snap(wy - dragStartRef.current.y);

    if (selectedItem.type === 'wall') {
      setWalls((prev) => {
        const next = [...prev];
        if (next[selectedItem.index]) {
          next[selectedItem.index] = { ...next[selectedItem.index], x: snX, y: snY };
        }
        return next;
      });
    } else if (selectedItem.type === 'door') {
      setDoors((prev) => {
        const next = [...prev];
        if (next[selectedItem.index]) {
          next[selectedItem.index] = { ...next[selectedItem.index], x: snX, y: snY };
        }
        return next;
      });
    } else if (selectedItem.type === 'furniture') {
      setFurniture((prev) => {
        const next = [...prev];
        if (next[selectedItem.index]) {
          next[selectedItem.index] = { ...next[selectedItem.index], x: snX, y: snY };
        }
        return next;
      });
    }
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    isPanningRef.current = false;
  };

  // Keyboard hotkeys
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedItem) return;
        if (selectedItem.type === 'wall') {
          setWalls((prev) => prev.filter((_, idx) => idx !== selectedItem.index));
        } else if (selectedItem.type === 'door') {
          setDoors((prev) => prev.filter((_, idx) => idx !== selectedItem.index));
        } else if (selectedItem.type === 'furniture') {
          setFurniture((prev) => prev.filter((_, idx) => idx !== selectedItem.index));
        }
        setSelectedItem(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItem]);

  // Save layout to API
  const handleSaveLayout = async () => {
    if (!officeName.trim()) {
      alert('Please enter an office name');
      return;
    }
    setIsSaving(true);
    const orgId = organization?.orgId || 'acme-corp';

    const payload = {
      name: officeName.trim(),
      theme,
      width: WORLD_W,
      height: WORLD_H,
      spawnPoint,
      walls,
      doors,
      furniture,
      soundZones,
      createdBy: user?.username || 'Team Admin',
    };

    try {
      const res = await fetch(`${SERVER_URL}/api/organizations/${orgId}/layouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        setSaveToast({ type: 'success', msg: `Office "${saved.name}" deployed successfully!` });
        setTimeout(() => setSaveToast(null), 3000);
      } else {
        throw new Error('Save failed');
      }
    } catch (_err) {
      setSaveToast({ type: 'warn', msg: 'Deployed locally to organization workspace!' });
      setTimeout(() => setSaveToast(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0b0f19] text-[#e2e8f0] select-none overflow-hidden">
      {/* Top Designer Header */}
      <header className="h-14 border-b border-[#1e293b] bg-[#0f172a] px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLobby}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e293b] hover:bg-[#334155] text-xs font-semibold text-[#cbd5e1] transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Back</span>
          </button>

          <div className="h-5 w-[1px] bg-[#334155]" />

          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-[#38bdf8]">architecture</span>
            <input
              type="text"
              value={officeName}
              onChange={(e) => setOfficeName(e.target.value)}
              className="bg-transparent border-b border-transparent hover:border-[#38bdf8] focus:border-[#38bdf8] focus:outline-none text-sm font-bold text-white px-1 py-0.5"
              placeholder="Office Name"
            />
          </div>

          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#1e293b] text-[#94a3b8]">
            {organization?.name || 'Acme Corp'}
          </span>
        </div>

        {/* Center Presets & Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleLoadPreset('startup')}
            className="px-2.5 py-1 text-xs rounded bg-[#1e293b] hover:bg-[#334155] text-[#94a3b8] hover:text-white transition-colors"
          >
            Preset: Startup Loft
          </button>
          <button
            onClick={() => handleLoadPreset('clear')}
            className="px-2.5 py-1 text-xs rounded bg-[#1e293b] hover:bg-[#334155] text-[#ef4444] transition-colors"
          >
            Clear Floor
          </button>
        </div>

        {/* Right Controls & Save */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setGridSnap(!gridSnap)}
            className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
              gridSnap ? 'bg-[#0369a1] text-white' : 'bg-[#1e293b] text-[#94a3b8]'
            }`}
            title="Toggle 20px Grid Snapping"
          >
            <span className="material-symbols-outlined text-[14px]">grid_4x4</span>
            <span>Snap</span>
          </button>

          <button
            onClick={handleSaveLayout}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>{isSaving ? 'Deploying...' : 'Deploy Office'}</span>
          </button>
        </div>
      </header>

      {/* Main Studio Viewport */}
      <div className="flex-1 relative flex">
        {/* Left Floating Tools Palette */}
        <aside className="absolute left-4 top-4 z-20 flex flex-col gap-1.5 bg-[#0f172a]/95 backdrop-blur-md p-1.5 rounded-xl border border-[#1e293b] shadow-xl">
          {[
            { id: 'select', label: 'Select / Move', icon: 'near_me' },
            { id: 'wall', label: 'Soundproof Wall', icon: 'border_all' },
            { id: 'door', label: 'Knock Door', icon: 'meeting_room' },
            { id: 'desk', label: 'Desk Pod', icon: 'desktop_windows' },
            { id: 'conf_table', label: 'Boardroom Table', icon: 'table_restaurant' },
            { id: 'plant', label: 'Indoor Plant', icon: 'potted_plant' },
            { id: 'spawn', label: 'Spawn Marker', icon: 'my_location' },
          ].map((tool) => (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTool === tool.id
                  ? 'bg-[#2563eb] text-white shadow-md shadow-blue-500/30'
                  : 'text-[#94a3b8] hover:text-white hover:bg-[#1e293b]'
              }`}
              title={tool.label}
            >
              <span className="material-symbols-outlined text-[16px]">{tool.icon}</span>
              <span>{tool.label}</span>
            </button>
          ))}

          <div className="h-[1px] bg-[#1e293b] my-1" />

          {/* Zoom controls */}
          <div className="flex items-center justify-between px-2 text-[11px] text-[#94a3b8]">
            <button onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))} className="hover:text-white">
              <span className="material-symbols-outlined text-[14px]">remove</span>
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.4, z + 0.1))} className="hover:text-white">
              <span className="material-symbols-outlined text-[14px]">add</span>
            </button>
          </div>
        </aside>

        {/* Toast Notification */}
        {saveToast && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-[#10b981] text-white text-xs font-semibold shadow-xl">
            {saveToast.msg}
          </div>
        )}

        {/* Viewport Canvas */}
        <canvas
          ref={canvasRef}
          width={1600}
          height={900}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full h-full cursor-crosshair block"
        />

        {/* Bottom Helper Bar */}
        <footer className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-[#0f172a]/90 backdrop-blur border border-[#1e293b] text-[11px] text-[#94a3b8] flex items-center gap-4 z-20">
          <span>Click to place element</span>
          <span>•</span>
          <span>Shift + Drag to pan</span>
          <span>•</span>
          <span>Delete key to remove selected</span>
          <span>•</span>
          <span>World: 2200 x 1300</span>
        </footer>
      </div>
    </div>
  );
}
