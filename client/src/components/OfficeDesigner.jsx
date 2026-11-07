import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { SERVER_URL } from '../config';

import {

  ACOUSTIC_VARIATIONS,

  FURNITURE_VARIATIONS,

  drawArchitecturalWall,

  drawArchitecturalDoor,

  drawArchitecturalZone,

  drawArchitecturalTable,

  drawArchitecturalDesk,

  drawArchitecturalSofa,

  drawArchitecturalServerRack,

  drawArchitecturalPlant,

  drawArchitecturalSpawn,

  drawArchitecturalFurniture,

} from './architecturalComponents';

import {
  checkPlacementCollision,
  getWallExpansionArrows,
  drawExpansionArrow,
  drawExpansionPreview,
} from './designerGeometry';

const WORLD_W = 2200;

const WORLD_H = 1300;

const GRID_SIZE = 20;

const TOOLS = [

  {

    id: 'select',

    label: 'Select & Move',

    sectionId: 'navigation',

    category: 'systems',

    icon: 'near_me',

    hotkey: 'V',

    badge: 'Pointer',

    description: 'Select, drag, resize, and reposition elements on floor',

    color: '#38bdf8',

  },

  {

    id: 'wall',

    label: 'Soundproof Wall',

    sectionId: 'acoustics',

    category: 'acoustics',

    icon: 'border_all',

    hotkey: 'W',

    badge: 'Acoustic Barrier',

    description: 'Attenuates voice volume by 70% and blocks line of sight',

    color: '#818cf8',

  },

  {

    id: 'door',

    label: 'Knock-to-Enter Door',

    sectionId: 'acoustics',

    category: 'acoustics',

    icon: 'meeting_room',

    hotkey: 'D',

    badge: 'Privacy Gate',

    description: 'Soundproof door with interactive knock chime & permission handshake',

    color: '#f59e0b',

  },

  {

    id: 'zone',

    label: 'Acoustic Room Zone',

    sectionId: 'acoustics',

    category: 'acoustics',

    icon: 'volume_off',

    hotkey: 'Z',

    badge: 'Sound Perimeter',

    description: 'Demarcates isolated room perimeter with custom falloff radius',

    color: '#10b981',

  },

  {

    id: 'desk',

    label: 'Workstation Pod',

    sectionId: 'workspace',

    category: 'workspace',

    icon: 'desktop_windows',

    hotkey: 'P',

    badge: 'Work Pod',

    description: 'Dual-monitor workstation paired with 2 ergonomic swivel chairs',

    color: '#38bdf8',

  },

  {

    id: 'conf_table',

    label: 'Boardroom Table',

    sectionId: 'workspace',

    category: 'workspace',

    icon: 'table_restaurant',

    hotkey: 'T',

    badge: 'Meeting Hub',

    description: 'Grand executive boardroom table surrounded by 8 chairs',

    color: '#d97706',

  },

  {

    id: 'sofa',

    label: 'Lounge Breakout Sofa',

    sectionId: 'workspace',

    category: 'workspace',

    icon: 'weekend',

    hotkey: 'L',

    badge: 'Breakout',

    description: 'Casual soft seating for informal chats and open audio huddles',

    color: '#94a3b8',

  },

  {

    id: 'server_rack',

    label: 'IT Server Rack',

    sectionId: 'workspace',

    category: 'workspace',

    icon: 'dns',

    hotkey: 'K',

    badge: 'IT Infra',

    description: 'Enterprise server rack divider with telemetry status indicators',

    color: '#0ea5e9',

  },

  {

    id: 'plant',

    label: 'Indoor Botanical Plant',

    sectionId: 'decor',

    category: 'decor',

    icon: 'potted_plant',

    hotkey: 'F',

    badge: 'Decor',

    description: 'Natural acoustic diffuser that softens echoes & enriches vibe',

    color: '#22c55e',

  },

  {

    id: 'spawn',

    label: 'Spawn Arrival Point',

    sectionId: 'navigation',

    category: 'systems',

    icon: 'my_location',

    hotkey: 'S',

    badge: 'Teleport',

    description: 'Spatial entry point where newly arriving members materialize',

    color: '#ef4444',

  },

];

const SECTIONS = [

  { id: 'navigation', title: 'Navigation & Controls', icon: 'navigation' },

  { id: 'acoustics', title: 'Acoustic Structures & Privacy', icon: 'security' },

  { id: 'workspace', title: 'Workspaces & Furniture', icon: 'business' },

  { id: 'decor', title: 'Biophilic & Decor', icon: 'yard' },

];

const PRESETS = [

  {

    id: 'startup',

    name: 'Startup Open Loft',

    description: 'Open collaborative space with 2 private focus pods, desk clusters, and central lounge breakout',

    badge: 'Popular',

    tagColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',

  },

  {

    id: 'executive',

    name: 'Executive Boardroom Suite',

    description: 'Formal corporate setup with isolated executive boardroom, private suites, and IT infrastructure',

    badge: 'Corporate',

    tagColor: 'bg-blue-500/20 text-blue-400 border-blue-500/30',

  },

  {

    id: 'clear',

    name: 'Clean Slate Floor',

    description: 'Empty floor surrounded only by outer boundary walls, ready for custom drafting',

    badge: 'Empty',

    tagColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',

  },

];

// Helper to calculate rotated point around center (cx, cy)

function rotatePoint(cx, cy, rx, ry, angleDeg) {

  const rad = (angleDeg * Math.PI) / 180;

  const cos = Math.cos(rad);

  const sin = Math.sin(rad);

  return {

    x: Math.round(cx + rx * cos - ry * sin),

    y: Math.round(cy + rx * sin + ry * cos),

  };

}

export default function OfficeDesigner({

  user,

  organization,

  initialLayout,

  onBackToLobby,

  onLaunchOffice,

}) {

  const [officeName, setOfficeName] = useState(initialLayout?.name || 'New Custom Office');

  const [theme, setTheme] = useState(initialLayout?.theme || 'custom');

  const [activeTool, setActiveTool] = useState('select');

  const [rotationAngle, setRotationAngle] = useState(0); // 0, 45, 90, 135, 180, 225, 270, 315

  const [gridSnap, setGridSnap] = useState(true);

  const [zoom, setZoom] = useState(0.65);

  const [camera, setCamera] = useState({ x: WORLD_W / 2, y: WORLD_H / 2 });

  // 2D Architectural Design System — Active Tool Customization State

  const [toolCustomization, setToolCustomization] = useState({

    wall: {

      variation: 'concrete_stud',

      length: 120,

      thickness: 10,

      color: '#2c3050',

    },

    door: {

      variation: 'single_swing',

      width: 90,

      color: '#78350f',

      swingDirection: 'inward',

    },

    zone: {

      variation: 'meeting_suite',

      width: 280,

      height: 200,

      color: '#0284c7',

      maxDistance: 100,

      name: 'Meeting Suite',

    },

    conf_table: {

      variation: 'rectangular_executive',

      w: 320,

      h: 150,

      color: '#78350f',

      seats: 10,

    },

    desk: {

      variation: 'dual_bench',

      w: 180,

      h: 100,

      color: '#cbd5e1',

    },

    sofa: {

      variation: 'linear_cushioned',

      w: 180,

      h: 75,

      color: '#334155',

    },

    server_rack: {

      variation: 'enterprise_rack',

      w: 75,

      h: 120,

      color: '#0f172a',

    },

    plant: {

      variation: 'monstera_deliciosa',

      r: 22,

      color: '#22c55e',

    },

    spawn: {

      variation: 'executive_carpet',

      color: '#3b82f6',

    },

  });

  // Handler to update selected entity on canvas in real-time

  const updateSelectedEntity = (updates) => {

    if (!selectedItem) return;

    if (selectedItem.type === 'wall') {

      setWalls((prev) => {

        const next = [...prev];

        if (next[selectedItem.index]) {

          next[selectedItem.index] = { ...next[selectedItem.index], ...updates };

        }

        return next;

      });

    } else if (selectedItem.type === 'door') {

      setDoors((prev) => {

        const next = [...prev];

        if (next[selectedItem.index]) {

          next[selectedItem.index] = { ...next[selectedItem.index], ...updates };

        }

        return next;

      });

    } else if (selectedItem.type === 'zone') {

      setSoundZones((prev) => {

        const next = [...prev];

        if (next[selectedItem.index]) {

          next[selectedItem.index] = { ...next[selectedItem.index], ...updates };

        }

        return next;

      });

    } else if (selectedItem.type === 'furniture') {

      setFurniture((prev) => {

        const next = [...prev];

        if (next[selectedItem.index]) {

          next[selectedItem.index] = { ...next[selectedItem.index], ...updates };

        }

        return next;

      });

    }

  };

  const [isSaving, setIsSaving] = useState(false);

  const [saveToast, setSaveToast] = useState(null);

  // Live cursor position for ghost preview

  const [cursorPos, setCursorPos] = useState({ wx: 0, wy: 0, snX: 0, snY: 0, isOver: false });

  // Sliding panel state

  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [isCustomizerExpanded, setIsCustomizerExpanded] = useState(true);
  const [hoveredExpansionArrow, setHoveredExpansionArrow] = useState(null);
  const [collisionAlert, setCollisionAlert] = useState(null);

  const [panelTab, setPanelTab] = useState('catalog'); // 'catalog' | 'inspector' | 'presets'

  const [searchQuery, setSearchQuery] = useState('');

  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'acoustics' | 'workspace' | 'decor'

  // Canvas viewport container and reactive sizing

  const containerRef = useRef(null);

  const canvasRef = useRef(null);

  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });

  // Layout entities

  const [walls, setWalls] = useState(initialLayout?.walls || [

    { x: 10, y: 10, w: WORLD_W - 20, h: 8, rotation: 0 },

    { x: 10, y: 10, w: 8, h: WORLD_H - 20, rotation: 90 },

    { x: WORLD_W - 18, y: 10, w: 8, h: WORLD_H - 20, rotation: 90 },

    { x: 10, y: WORLD_H - 18, w: WORLD_W - 20, h: 8, rotation: 0 },

    // Default meeting room divider

    { x: 598, y: 18, w: 8, h: 480, rotation: 90 },

    { x: 18, y: 498, w: 490, h: 8, rotation: 0 },

  ]);

  const [doors, setDoors] = useState(initialLayout?.doors || [

    {

      key: 'meeting-room',

      name: 'Meeting Room',

      x: 508,

      y: 498,

      w: 90,

      h: 8,

      rotation: 0,

      isIsolated: true,

      arc: [508, 498, 90, -Math.PI / 2, 0],

    },

  ]);

  const [furniture, setFurniture] = useState(initialLayout?.furniture || [

    { type: 'rect', name: 'Boardroom Table', x: 110, y: 150, w: 360, h: 180, color: '#b5896a', rx: 8, rotation: 0 },

    { type: 'screen', x: 290, y: 46 },

    { type: 'chair', x: 160, y: 136 }, { type: 'chair', x: 230, y: 136 }, { type: 'chair', x: 300, y: 136 }, { type: 'chair', x: 370, y: 136 },

    { type: 'chair', x: 160, y: 344 }, { type: 'chair', x: 230, y: 344 }, { type: 'chair', x: 300, y: 344 }, { type: 'chair', x: 370, y: 344 },

    { type: 'plant', name: 'Indoor Plant', x: 540, y: 60, r: 16 },

    // Desk Pod 1

    { type: 'rect', name: 'Desk Unit', x: 720, y: 580, w: 160, h: 80, color: '#cbd5e1', rx: 4, rotation: 0 },

    { type: 'screen', x: 760, y: 572 }, { type: 'screen', x: 840, y: 572 },

    { type: 'chair', x: 760, y: 685 }, { type: 'chair', x: 840, y: 685 },

    // Desk Pod 2

    { type: 'rect', name: 'Desk Unit', x: 1320, y: 580, w: 160, h: 80, color: '#cbd5e1', rx: 4, rotation: 0 },

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

      rotation: 0,

    },

  ]);

  const [spawnPoint, setSpawnPoint] = useState(initialLayout?.spawnPoint || { x: 1100, y: 720 });

  const [selectedItem, setSelectedItem] = useState(null); // { type: 'wall'|'door'|'furniture'|'zone'|'spawn', index: number }

  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef({ x: 0, y: 0 });

  const isPanningRef = useRef(false);
  const [isPanning, setIsPanning] = useState(false);

  const panStartRef = useRef({ x: 0, y: 0 });

  // Tool selection handler: when switching tools, reset selected item if entering placement mode

  const handleSelectTool = (toolId) => {

    setActiveTool(toolId);

    if (toolId !== 'select') {

      setSelectedItem(null);

    }

  };

  // ResizeObserver to keep canvas responsive and centered

  useEffect(() => {

    const container = containerRef.current;

    if (!container) return;

    const updateSize = () => {

      const rect = container.getBoundingClientRect();

      if (rect.width > 0 && rect.height > 0) {

        setCanvasSize({

          width: Math.floor(rect.width),

          height: Math.floor(rect.height),

        });

      }

    };

    updateSize();

    const ro = new ResizeObserver(() => {

      updateSize();

    });

    ro.observe(container);

    return () => ro.disconnect();

  }, []);

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

    const sx = clientX - rect.left;

    const sy = clientY - rect.top;

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

        { x: 10, y: 10, w: WORLD_W - 20, h: 8, rotation: 0 },

        { x: 10, y: 10, w: 8, h: WORLD_H - 20, rotation: 90 },

        { x: WORLD_W - 18, y: 10, w: 8, h: WORLD_H - 20, rotation: 90 },

        { x: 10, y: WORLD_H - 18, w: WORLD_W - 20, h: 8, rotation: 0 },

        // Two meeting pods

        { x: 420, y: 18, w: 8, h: 360, rotation: 90 },

        { x: 18, y: 378, w: 320, h: 8, rotation: 0 },

        { x: 1780, y: 18, w: 8, h: 360, rotation: 90 },

        { x: 1780, y: 378, w: 320, h: 8, rotation: 0 },

      ]);

      setDoors([

        { key: 'pod-a', name: 'Focus Pod A', x: 338, y: 378, w: 90, h: 8, rotation: 0, isIsolated: true, arc: [338, 378, 90, -Math.PI / 2, 0] },

        { key: 'pod-b', name: 'Focus Pod B', x: 1780, y: 378, w: 90, h: 8, rotation: 0, isIsolated: true, arc: [1780, 378, 90, -Math.PI / 2, 0] },

      ]);

      setSoundZones([

        { id: 'pod-a', name: 'Focus Pod A', bounds: { x1: 18, y1: 18, x2: 428, y2: 386 }, isIsolated: true, maxDistance: 100, rotation: 0 },

        { id: 'pod-b', name: 'Focus Pod B', bounds: { x1: 1780, y1: 18, x2: WORLD_W - 18, y2: 386 }, isIsolated: true, maxDistance: 100, rotation: 0 },

      ]);

      setFurniture([
        // Desk cluster 1 (architectural dual-pod workstations with integrated chairs)
        { type: 'furniture', furnitureType: 'desk', variation: 'dual_bench', name: 'Workstation Pod A', x: 650, y: 520, w: 260, h: 100, color: '#b5896a', rotation: 0 },
        // Desk cluster 2 (architectural dual-pod workstations with integrated chairs)
        { type: 'furniture', furnitureType: 'desk', variation: 'dual_bench', name: 'Workstation Pod B', x: 1250, y: 520, w: 260, h: 100, color: '#b5896a', rotation: 0 },
        // Lounge breakout (architectural cushioned sofa)
        { type: 'furniture', furnitureType: 'sofa', variation: 'linear_cushioned', name: 'Central Sofa', x: 960, y: 220, w: 260, h: 80, color: '#334155', rotation: 0 },
        // Architectural plants
        { type: 'furniture', furnitureType: 'plant', variation: 'monstera_deliciosa', name: 'Indoor Ficus', x: 920, y: 240, r: 20, color: '#22c55e' },
        { type: 'furniture', furnitureType: 'plant', variation: 'palm_plant', name: 'Indoor Palm', x: 1260, y: 240, r: 20, color: '#22c55e' },
      ]);

      setSpawnPoint({ x: 1100, y: 700 });

      setSelectedItem(null);

    } else if (presetKey === 'executive') {

      setOfficeName('Executive Boardroom Suite');

      setTheme('office');

      setWalls([

        { x: 10, y: 10, w: WORLD_W - 20, h: 8, rotation: 0 },

        { x: 10, y: 10, w: 8, h: WORLD_H - 20, rotation: 90 },

        { x: WORLD_W - 18, y: 10, w: 8, h: WORLD_H - 20, rotation: 90 },

        { x: 10, y: WORLD_H - 18, w: WORLD_W - 20, h: 8, rotation: 0 },

        // Central Boardroom soundproof walls

        { x: 650, y: 18, w: 8, h: 520, rotation: 90 },

        { x: 1550, y: 18, w: 8, h: 520, rotation: 90 },

        { x: 650, y: 538, w: 380, h: 8, rotation: 0 },

        { x: 1170, y: 538, w: 388, h: 8, rotation: 0 },

      ]);

      setDoors([

        { key: 'exec-door', name: 'Executive Boardroom', x: 1040, y: 538, w: 120, h: 8, rotation: 0, isIsolated: true, arc: [1040, 538, 120, -Math.PI / 2, 0] },

      ]);

      setSoundZones([

        { id: 'boardroom', name: 'Boardroom Sanctuary', bounds: { x1: 658, y1: 18, x2: 1542, y2: 538 }, isIsolated: true, maxDistance: 110, rotation: 0 },

      ]);

      setFurniture([
        // Large executive table (architectural 12-seat table with integrated chairs)
        { type: 'furniture', furnitureType: 'conf_table', variation: 'rectangular_executive', name: 'Grand Boardroom Table', x: 880, y: 180, w: 420, h: 160, color: '#78350f', seats: 12, rotation: 0 },
        // Server infrastructure (architectural IT server racks)
        { type: 'furniture', furnitureType: 'server_rack', variation: 'enterprise_rack', name: 'Mainframe Rack 01', x: 70, y: 70, w: 75, h: 120, color: '#0f172a', rotation: 0 },
        { type: 'furniture', furnitureType: 'server_rack', variation: 'enterprise_rack', name: 'Mainframe Rack 02', x: 160, y: 70, w: 75, h: 120, color: '#0f172a', rotation: 0 },
        // Greenery (architectural biophilic plants)
        { type: 'furniture', furnitureType: 'plant', variation: 'monstera_deliciosa', name: 'Boardroom Plant L', x: 690, y: 70, r: 22, color: '#22c55e' },
        { type: 'furniture', furnitureType: 'plant', variation: 'palm_plant', name: 'Boardroom Plant R', x: 1510, y: 70, r: 22, color: '#22c55e' },
        // Reception & Desk Pod (architectural executive desk with integrated chair and monitor)
        { type: 'furniture', furnitureType: 'desk', variation: 'executive_l', name: 'Reception Pod', x: 950, y: 790, w: 260, h: 90, color: '#334155', rotation: 0 },
      ]);

      setSpawnPoint({ x: 1100, y: 1050 });

      setSelectedItem(null);

    } else if (presetKey === 'clear') {

      setWalls([

        { x: 10, y: 10, w: WORLD_W - 20, h: 8, rotation: 0 },

        { x: 10, y: 10, w: 8, h: WORLD_H - 20, rotation: 90 },

        { x: WORLD_W - 18, y: 10, w: 8, h: WORLD_H - 20, rotation: 90 },

        { x: 10, y: WORLD_H - 18, w: WORLD_W - 20, h: 8, rotation: 0 },

      ]);

      setDoors([]);

      setFurniture([]);

      setSoundZones([]);

      setSelectedItem(null);

    }

  };

  // Canvas drawing loop

  useEffect(() => {

    const canvas = canvasRef.current;

    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    const vw = canvasSize.width;

    const vh = canvasSize.height;

    ctx.clearRect(0, 0, vw, vh);

    // Save context for Camera Viewport Transform

    ctx.save();

    ctx.translate(vw / 2, vh / 2);

    ctx.scale(zoom, zoom);

    ctx.translate(-camera.x, -camera.y);

    // 1. World Deep Space Border

    ctx.fillStyle = '#060911';

    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    // Base architectural floor

    ctx.fillStyle = '#f8fafc';

    ctx.fillRect(18, 18, WORLD_W - 36, WORLD_H - 36);

    // Precision Blueprint Grid

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.06)';

    ctx.lineWidth = 1;

    for (let gx = 20; gx < WORLD_W - 20; gx += GRID_SIZE * 2) {

      ctx.beginPath(); ctx.moveTo(gx, 20); ctx.lineTo(gx, WORLD_H - 20); ctx.stroke();

    }

    for (let gy = 20; gy < WORLD_H - 20; gy += GRID_SIZE * 2) {

      ctx.beginPath(); ctx.moveTo(20, gy); ctx.lineTo(WORLD_W - 20, gy); ctx.stroke();

    }

    // 2. Sound Isolation Zones (Architectural 2D System)

    for (let i = 0; i < soundZones.length; i++) {

      const z = soundZones[i];

      const isSel = selectedItem?.type === 'zone' && selectedItem?.index === i;

      drawArchitecturalZone(ctx, z, false, isSel);

    }

    // 3. Furniture Elements (Architectural 2D Design System)

    for (let i = 0; i < furniture.length; i++) {

      const f = furniture[i];

      const isSel = selectedItem?.type === 'furniture' && selectedItem?.index === i;

      drawArchitecturalFurniture(ctx, f, false, isSel);

    }

    // 4. Acoustic Doors (Architectural 2D Models)

    for (let i = 0; i < doors.length; i++) {

      const d = doors[i];

      const isSel = selectedItem?.type === 'door' && selectedItem?.index === i;

      drawArchitecturalDoor(ctx, d, false, isSel, false);

    }

    // 5. Soundproof Architectural Walls (Architectural 2D Models)

    for (let i = 0; i < walls.length; i++) {

      const w = walls[i];

      const isSel = selectedItem?.type === 'wall' && selectedItem?.index === i;

      drawArchitecturalWall(ctx, w, false, isSel);

    }

    // 5b. Wall Expansion Arrows (Clash of Clans-style interactive building)
    if (selectedItem?.type === 'wall' && (activeTool === 'select' || activeTool === 'wall')) {
      const selWall = walls[selectedItem.index];
      if (selWall) {
        const arrows = getWallExpansionArrows(selWall, walls, WORLD_W, WORLD_H);
        for (let aIdx = 0; aIdx < arrows.length; aIdx++) {
          const arrow = arrows[aIdx];
          const isHov = hoveredExpansionArrow?.id === arrow.id;
          if (isHov) {
            drawExpansionPreview(ctx, arrow);
          }
          drawExpansionArrow(ctx, arrow, isHov, zoom);
        }
      }
    }

    // 6. Spawn Point Marker

    const isSpawnSel = selectedItem?.type === 'spawn';

    ctx.beginPath();

    ctx.arc(spawnPoint.x, spawnPoint.y, 18, 0, Math.PI * 2);

    ctx.fillStyle = isSpawnSel ? 'rgba(59, 130, 246, 0.35)' : 'rgba(59, 130, 246, 0.2)';

    ctx.fill();

    ctx.strokeStyle = isSpawnSel ? '#60a5fa' : '#3b82f6';

    ctx.lineWidth = isSpawnSel ? 3 : 2;

    ctx.stroke();

    ctx.beginPath();

    ctx.arc(spawnPoint.x, spawnPoint.y, 6, 0, Math.PI * 2);

    ctx.fillStyle = '#2563eb';

    ctx.fill();

    ctx.font = '700 11px Inter, sans-serif';

    ctx.fillStyle = '#1d4ed8';

    ctx.textAlign = 'center';

    ctx.fillText('SPAWN', spawnPoint.x, spawnPoint.y + 30);

    // =========================================================================

    // 7. LIVE CURSOR GHOST PREVIEW & ROTATION HUD

    // =========================================================================

    if (cursorPos.isOver && activeTool !== 'select') {

      const gcx = cursorPos.snX;

      const gcy = cursorPos.snY;

      // Construct candidate object to test SAT placement collision in real time
      let ghostCandidate = null;
      if (activeTool === 'wall') {
        const wCust = toolCustomization.wall;
        const isVertical = rotationAngle === 90 || rotationAngle === 270;
        const gw = isVertical ? wCust.thickness : wCust.length;
        const gh = isVertical ? wCust.length : wCust.thickness;
        ghostCandidate = { type: 'wall', x: gcx - gw / 2, y: gcy - gh / 2, w: gw, h: gh, rotation: 0 };
      } else if (activeTool === 'door') {
        const dCust = toolCustomization.door;
        const isVertical = rotationAngle === 90 || rotationAngle === 270;
        const dw = isVertical ? 8 : dCust.width;
        const dh = isVertical ? dCust.width : 8;
        ghostCandidate = { type: 'door', x: gcx - dw / 2, y: gcy - dh / 2, w: dw, h: dh, rotation: rotationAngle };
      } else if (activeTool === 'desk') {
        const dkCust = toolCustomization.desk;
        ghostCandidate = { type: 'furniture', furnitureType: 'desk', x: gcx - dkCust.w / 2, y: gcy - dkCust.h / 2, w: dkCust.w, h: dkCust.h, rotation: rotationAngle };
      } else if (activeTool === 'conf_table') {
        const tCust = toolCustomization.conf_table;
        ghostCandidate = { type: 'furniture', furnitureType: 'conf_table', x: gcx - tCust.w / 2, y: gcy - tCust.h / 2, w: tCust.w, h: tCust.h, rotation: rotationAngle };
      } else if (activeTool === 'sofa') {
        const sCust = toolCustomization.sofa;
        ghostCandidate = { type: 'furniture', furnitureType: 'sofa', x: gcx - sCust.w / 2, y: gcy - sCust.h / 2, w: sCust.w, h: sCust.h, rotation: rotationAngle };
      } else if (activeTool === 'server_rack') {
        const rCust = toolCustomization.server_rack;
        ghostCandidate = { type: 'furniture', furnitureType: 'server_rack', x: gcx - rCust.w / 2, y: gcy - rCust.h / 2, w: rCust.w, h: rCust.h, rotation: rotationAngle };
      } else if (activeTool === 'plant') {
        const plCust = toolCustomization.plant;
        ghostCandidate = { type: 'plant', furnitureType: 'plant', x: gcx, y: gcy, r: plCust.r || 22 };
      } else if (activeTool === 'spawn') {
        ghostCandidate = { type: 'spawn', x: gcx, y: gcy, r: 22 };
      }

      const ghostCollision = ghostCandidate ? checkPlacementCollision(ghostCandidate, { walls, doors, furniture, spawnPoint }) : { isCollision: false };

      // Draw subtle grid snap crosshair

      ctx.save();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';

      ctx.lineWidth = 1;

      ctx.setLineDash([2, 4]);

      ctx.beginPath();

      ctx.moveTo(gcx - 30, gcy); ctx.lineTo(gcx + 30, gcy);

      ctx.moveTo(gcx, gcy - 30); ctx.lineTo(gcx, gcy + 30);

      ctx.stroke();

      ctx.restore();

      // Render the ghost component with translucency & rotation

      ctx.save();

      ctx.globalAlpha = 0.65;

      ctx.translate(gcx, gcy);

      ctx.rotate((rotationAngle * Math.PI) / 180);

      if (activeTool === 'wall') {

        const wCust = toolCustomization.wall;

        ctx.restore();

        ctx.save();

        const isVertical = rotationAngle === 90 || rotationAngle === 270;

        const gw = isVertical ? wCust.thickness : wCust.length;

        const gh = isVertical ? wCust.length : wCust.thickness;

        drawArchitecturalWall(ctx, {

          x: gcx - gw / 2,

          y: gcy - gh / 2,

          w: gw,

          h: gh,

          rotation: rotationAngle,

          variation: wCust.variation,

          color: wCust.color,

          thickness: wCust.thickness,

        }, true, false);

      } else if (activeTool === 'door') {

        const dCust = toolCustomization.door;

        ctx.restore();

        ctx.save();

        const isVertical = rotationAngle === 90 || rotationAngle === 270;

        const dw = isVertical ? 8 : dCust.width;

        const dh = isVertical ? dCust.width : 8;

        const dx = gcx - dw / 2;

        const dy = gcy - dh / 2;

        let arc = [dx, dy, dCust.width, -Math.PI / 2, 0];

        if (rotationAngle === 90) arc = [dx, dy, dCust.width, 0, Math.PI / 2];

        else if (rotationAngle === 180) arc = [dx + dw, dy + dh, dCust.width, Math.PI / 2, Math.PI];

        else if (rotationAngle === 270) arc = [dx + dw, dy + dh, dCust.width, Math.PI, -Math.PI / 2];

        drawArchitecturalDoor(ctx, {

          x: dx,

          y: dy,

          w: dw,

          h: dh,

          rotation: rotationAngle,

          variation: dCust.variation,

          color: dCust.color,

          arc,

        }, true, false);

      } else if (activeTool === 'zone') {

        const zCust = toolCustomization.zone;

        ctx.restore();

        ctx.save();

        const isVertical = rotationAngle === 90 || rotationAngle === 270;

        const zw = isVertical ? zCust.height : zCust.width;

        const zh = isVertical ? zCust.width : zCust.height;

        drawArchitecturalZone(ctx, {

          bounds: {

            x1: gcx - zw / 2,

            y1: gcy - zh / 2,

            x2: gcx + zw / 2,

            y2: gcy + zh / 2,

          },

          variation: zCust.variation,

          name: zCust.name || 'Private Zone',

          color: zCust.color,

          isIsolated: true,

        }, true, false);

      } else if (activeTool === 'desk') {

        const dkCust = toolCustomization.desk;

        ctx.restore();

        ctx.save();

        drawArchitecturalDesk(ctx, {

          x: gcx - dkCust.w / 2,

          y: gcy - dkCust.h / 2,

          w: dkCust.w,

          h: dkCust.h,

          rotation: rotationAngle,

          variation: dkCust.variation,

          color: dkCust.color,

          name: 'Workstation Pod',

        }, true, false);

      } else if (activeTool === 'conf_table') {

        const tCust = toolCustomization.conf_table;

        ctx.restore();

        ctx.save();

        drawArchitecturalTable(ctx, {

          x: gcx - tCust.w / 2,

          y: gcy - tCust.h / 2,

          w: tCust.w,

          h: tCust.h,

          rotation: rotationAngle,

          variation: tCust.variation,

          color: tCust.color,

          name: 'Boardroom Table',

        }, true, false);

      } else if (activeTool === 'sofa') {

        const sCust = toolCustomization.sofa;

        ctx.restore();

        ctx.save();

        drawArchitecturalSofa(ctx, {

          x: gcx - sCust.w / 2,

          y: gcy - sCust.h / 2,

          w: sCust.w,

          h: sCust.h,

          rotation: rotationAngle,

          variation: sCust.variation,

          color: sCust.color,

          name: 'Lounge Sofa',

        }, true, false);

      } else if (activeTool === 'server_rack') {

        const rCust = toolCustomization.server_rack;

        ctx.restore();

        ctx.save();

        drawArchitecturalServerRack(ctx, {

          x: gcx - rCust.w / 2,

          y: gcy - rCust.h / 2,

          w: rCust.w,

          h: rCust.h,

          rotation: rotationAngle,

          variation: rCust.variation,

          color: rCust.color,

          name: 'Server Rack',

        }, true, false);

      } else if (activeTool === 'plant') {

        const plCust = toolCustomization.plant;

        ctx.restore();

        ctx.save();

        drawArchitecturalPlant(ctx, {

          x: gcx,

          y: gcy,

          r: plCust.r || 22,

          rotation: rotationAngle,

          variation: plCust.variation,

          color: plCust.color,

          name: 'Indoor Plant',

        }, true, false);

      } else if (activeTool === 'zone') {

        // Sound Zone

        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';

        ctx.fillRect(-140, -100, 280, 200);

        ctx.strokeStyle = '#38bdf8';

        ctx.lineWidth = 2;

        ctx.setLineDash([4, 4]);

        ctx.strokeRect(-140, -100, 280, 200);

        ctx.font = '700 12px Inter, sans-serif';

        ctx.fillStyle = '#0284c7';

        ctx.textAlign = 'center';

        ctx.fillText('AUDIO ZONE PREVIEW', 0, 0);

      } else if (activeTool === 'spawn') {

        const spCust = toolCustomization.spawn;

        ctx.restore();

        ctx.save();

        drawArchitecturalSpawn(ctx, {

          x: gcx,

          y: gcy,

          variation: spCust.variation,

          color: spCust.color,

        }, true, false);

        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2);

        ctx.fillStyle = '#dc2626'; ctx.fill();

        ctx.font = '700 10px Inter, sans-serif';

        ctx.fillStyle = '#dc2626';

        ctx.textAlign = 'center';

        ctx.fillText('SPAWN', 0, 28);

      }

      ctx.restore();

      // Floating Live HUD Angle Pill & Placement Collision Status
      ctx.save();

      const pillX = gcx + 24;
      const pillY = gcy - 28;
      const isBlocked = ghostCollision.isCollision;
      const pillW = isBlocked ? 130 : 86;

      ctx.fillStyle = isBlocked ? 'rgba(30, 8, 12, 0.95)' : 'rgba(11, 16, 28, 0.92)';
      ctx.strokeStyle = isBlocked ? 'rgba(239, 68, 68, 0.85)' : 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.2;

      ctx.beginPath();
      ctx.roundRect(pillX, pillY - 14, pillW, 22, 6);
      ctx.fill();
      ctx.stroke();

      if (isBlocked) {
        ctx.font = '700 9px Inter, sans-serif';
        ctx.fillStyle = '#f87171';
        ctx.textAlign = 'left';
        ctx.fillText(`⊘ BLOCKED: ${ghostCollision.collidingType || 'Collision'}`, pillX + 8, pillY + 1);
      } else {
        ctx.font = '700 10px Inter, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'left';
        ctx.fillText(`⟳ ${rotationAngle}°`, pillX + 8, pillY + 1);

        ctx.font = '500 8.5px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`Scroll / [R]`, pillX + 44, pillY + 1);
      }

      ctx.restore();

    }

    ctx.restore();

  }, [walls, doors, furniture, soundZones, spawnPoint, selectedItem, camera, zoom, canvasSize, cursorPos, activeTool, rotationAngle, hoveredExpansionArrow]);

  // Pointer interaction

  const handlePointerDown = (e) => {

    // Middle click or shift held -> pan

    if (e.button === 1 || e.shiftKey) {

      isPanningRef.current = true;
      setIsPanning(true);

      panStartRef.current = { x: e.clientX, y: e.clientY };

      return;

    }

    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);

    const snX = snap(wx);

    const snY = snap(wy);

    // 1. Check Clash of Clans-style directional wall expansion arrow clicks first (in select or wall mode)
    if (selectedItem?.type === 'wall' && (activeTool === 'select' || activeTool === 'wall') && expansionArrows.length > 0) {
      for (let aIdx = 0; aIdx < expansionArrows.length; aIdx++) {
        const arrow = expansionArrows[aIdx];
        const dist = Math.hypot(wx - arrow.x, wy - arrow.y);
        if (dist <= 22) {
          const col = checkPlacementCollision(arrow.targetWall, { walls, doors, furniture, spawnPoint });
          if (!col.isCollision) {
            setWalls((prev) => {
              const next = [...prev, arrow.targetWall];
              setSelectedItem({ type: 'wall', index: next.length - 1 });
              return next;
            });
          } else {
            setCollisionAlert({ message: `Cannot expand wall: ${col.reason}` });
            setTimeout(() => setCollisionAlert(null), 2500);
          }
          return;
        }
      }
    }

    if (activeTool === 'select') {

      // Check spawn point

      const spawnDist = Math.hypot(wx - spawnPoint.x, wy - spawnPoint.y);

      if (spawnDist <= 22) {

        setSelectedItem({ type: 'spawn', index: 0 });

      setActiveTool('select');

        isDraggingRef.current = true;

        dragStartRef.current = { x: snX - spawnPoint.x, y: snY - spawnPoint.y };

        return;

      }

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

        if ((f.type === 'rect' || f.type === 'sofa' || f.type === 'server_rack') && wx >= f.x && wx <= f.x + f.w && wy >= f.y && wy <= f.y + f.h) {

          setSelectedItem({ type: 'furniture', index: i });

          isDraggingRef.current = true;

          dragStartRef.current = { x: snX - f.x, y: snY - f.y };

          return;

        }

        if (f.type === 'chair') {

          const dist = Math.hypot(wx - f.x, wy - f.y);

          if (dist <= 14) {

            setSelectedItem({ type: 'furniture', index: i });

            isDraggingRef.current = true;

            dragStartRef.current = { x: snX - f.x, y: snY - f.y };

            return;

          }

        }

        if (f.type === 'plant') {

          const dist = Math.hypot(wx - f.x, wy - f.y);

          if (dist <= (f.r || 16) + 4) {

            setSelectedItem({ type: 'furniture', index: i });

            isDraggingRef.current = true;

            dragStartRef.current = { x: snX - f.x, y: snY - f.y };

            return;

          }

        }

      }

      // Check sound zones

      for (let i = soundZones.length - 1; i >= 0; i--) {

        const z = soundZones[i];

        if (wx >= z.bounds.x1 && wx <= z.bounds.x2 && wy >= z.bounds.y1 && wy <= z.bounds.y2) {

          setSelectedItem({ type: 'zone', index: i });

          isDraggingRef.current = true;

          dragStartRef.current = { x: snX - z.bounds.x1, y: snY - z.bounds.y1 };

          return;

        }

      }

      setSelectedItem(null);

    } else if (activeTool === 'wall') {

      const wCust = toolCustomization.wall;

      const isVertical = rotationAngle === 90 || rotationAngle === 270;

      const gw = isVertical ? wCust.thickness : wCust.length;

      const gh = isVertical ? wCust.length : wCust.thickness;

      const newW = {

        x: snX - gw / 2,

        y: snY - gh / 2,

        w: gw,

        h: gh,

        rotation: 0,

        variation: wCust.variation,

        color: wCust.color,

        thickness: wCust.thickness,

      };

      const wallCol = checkPlacementCollision(newW, { walls, doors, furniture, spawnPoint });
      if (wallCol.isCollision) {
        setCollisionAlert({ message: wallCol.reason || `Wall intersects ${wallCol.collidingType}` });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }

      setWalls((prev) => {

        const next = [...prev, newW];

        setSelectedItem({ type: 'wall', index: next.length - 1 });

        return next;

      });

    } else if (activeTool === 'door') {

      const dCust = toolCustomization.door;

      const isVertical = rotationAngle === 90 || rotationAngle === 270;

      const dw = isVertical ? 8 : dCust.width;

      const dh = isVertical ? dCust.width : 8;

      const dx = snX - dw / 2;

      const dy = snY - dh / 2;

      let arc = [dx, dy, dCust.width, -Math.PI / 2, 0];

      if (rotationAngle === 90) arc = [dx, dy, dCust.width, 0, Math.PI / 2];

      else if (rotationAngle === 180) arc = [dx + dw, dy + dh, dCust.width, Math.PI / 2, Math.PI];

      else if (rotationAngle === 270) arc = [dx + dw, dy + dh, dCust.width, Math.PI, -Math.PI / 2];

      const newD = {

        key: `door-${Date.now().toString(36)}`,

        name: dCust.variation === 'double_swing' ? 'Boardroom Double Door' : dCust.variation === 'sliding_pocket' ? 'Sliding Pocket Door' : dCust.variation === 'glass_frameless' ? 'Frameless Glass Door' : dCust.variation === 'modern_sound_lock' ? 'Sound-Lock Seal Door' : 'Private Office Door',

        x: dx,

        y: dy,

        w: dw,

        h: dh,

        rotation: rotationAngle,

        variation: dCust.variation,

        color: dCust.color,

        isIsolated: true,

        arc,

      };

      const doorCol = checkPlacementCollision(newD, { walls, doors, furniture, spawnPoint });
      if (doorCol.isCollision) {
        setCollisionAlert({ message: doorCol.reason || `Door placement blocked by ${doorCol.collidingType}` });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }

      setDoors((prev) => {

        const next = [...prev, newD];

        setSelectedItem({ type: 'door', index: next.length - 1 });

        return next;

      });

    } else if (activeTool === 'zone') {

      const zCust = toolCustomization.zone;

      const isVertical = rotationAngle === 90 || rotationAngle === 270;

      const zw = isVertical ? zCust.height : zCust.width;

      const zh = isVertical ? zCust.width : zCust.height;

      const newZ = {

        id: `zone-${Date.now().toString(36)}`,

        name: zCust.name || (zCust.variation === 'focus_pod' ? 'Focus Pod' : zCust.variation === 'boardroom_vault' ? 'Boardroom Vault' : 'Meeting Suite'),

        bounds: { x1: snX - zw / 2, y1: snY - zh / 2, x2: snX + zw / 2, y2: snY + zh / 2 },

        isIsolated: true,

        maxDistance: zCust.maxDistance || (zCust.variation === 'focus_pod' ? 60 : zCust.variation === 'boardroom_vault' ? 120 : 100),

        rotation: rotationAngle,

        variation: zCust.variation,

        color: zCust.color,

      };

      setSoundZones((prev) => {

        const next = [...prev, newZ];

        setSelectedItem({ type: 'zone', index: next.length - 1 });

        return next;

      });

    } else if (activeTool === 'desk') {

      const dkCust = toolCustomization.desk;

      const newDesk = {

        type: 'rect',

        furnitureType: 'desk',

        variation: dkCust.variation,

        name: FURNITURE_VARIATIONS.desk?.find((v) => v.id === dkCust.variation)?.shortName || 'Workstation Pod',

        x: snX - dkCust.w / 2,

        y: snY - dkCust.h / 2,

        w: dkCust.w,

        h: dkCust.h,

        color: dkCust.color,

        rotation: rotationAngle,

      };

      const deskCol = checkPlacementCollision(newDesk, { walls, doors, furniture, spawnPoint });
      if (deskCol.isCollision) {
        setCollisionAlert({ message: deskCol.reason || `Desk blocked by ${deskCol.collidingType}` });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }

      setFurniture((prev) => {

        const targetIndex = prev.length;

        const next = [...prev, newDesk];

        setSelectedItem({ type: 'furniture', index: targetIndex });

        return next;

      });

    } else if (activeTool === 'conf_table') {

      const tCust = toolCustomization.conf_table;

      const newTable = {

        type: 'rect',

        furnitureType: 'conf_table',

        variation: tCust.variation,

        name: FURNITURE_VARIATIONS.conf_table?.find((v) => v.id === tCust.variation)?.shortName || 'Boardroom Table',

        x: snX - tCust.w / 2,

        y: snY - tCust.h / 2,

        w: tCust.w,

        h: tCust.h,

        color: tCust.color,

        seats: tCust.seats || 10,

        rotation: rotationAngle,

      };

      const tableCol = checkPlacementCollision(newTable, { walls, doors, furniture, spawnPoint });
      if (tableCol.isCollision) {
        setCollisionAlert({ message: tableCol.reason || `Boardroom table blocked by ${tableCol.collidingType}` });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }

      setFurniture((prev) => {

        const targetIndex = prev.length;

        const next = [...prev, newTable];

        setSelectedItem({ type: 'furniture', index: targetIndex });

        return next;

      });

    } else if (activeTool === 'sofa') {

      const sCust = toolCustomization.sofa;

      const newSofa = {

        type: 'sofa',

        furnitureType: 'sofa',

        variation: sCust.variation,

        name: FURNITURE_VARIATIONS.sofa?.find((v) => v.id === sCust.variation)?.shortName || 'Lounge Sofa',

        x: snX - sCust.w / 2,

        y: snY - sCust.h / 2,

        w: sCust.w,

        h: sCust.h,

        color: sCust.color,

        rotation: rotationAngle,

      };

      const sofaCol = checkPlacementCollision(newSofa, { walls, doors, furniture, spawnPoint });
      if (sofaCol.isCollision) {
        setCollisionAlert({ message: sofaCol.reason || `Sofa blocked by ${sofaCol.collidingType}` });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }

      setFurniture((prev) => {

        const targetIndex = prev.length;

        const next = [...prev, newSofa];

        setSelectedItem({ type: 'furniture', index: targetIndex });

        return next;

      });

    } else if (activeTool === 'server_rack') {

      const rCust = toolCustomization.server_rack;

      const newRack = {

        type: 'server_rack',

        furnitureType: 'server_rack',

        variation: rCust.variation,

        name: FURNITURE_VARIATIONS.server_rack?.find((v) => v.id === rCust.variation)?.shortName || 'Server Rack',

        x: snX - rCust.w / 2,

        y: snY - rCust.h / 2,

        w: rCust.w,

        h: rCust.h,

        color: rCust.color,

        rotation: rotationAngle,

      };

      const rackCol = checkPlacementCollision(newRack, { walls, doors, furniture, spawnPoint });
      if (rackCol.isCollision) {
        setCollisionAlert({ message: rackCol.reason || `Server rack blocked by ${rackCol.collidingType}` });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }

      setFurniture((prev) => {

        const targetIndex = prev.length;

        const next = [...prev, newRack];

        setSelectedItem({ type: 'furniture', index: targetIndex });

        return next;

      });

    } else if (activeTool === 'plant') {

      const plCust = toolCustomization.plant;

      const newPlant = {

        type: 'plant',

        furnitureType: 'plant',

        variation: plCust.variation,

        name: FURNITURE_VARIATIONS.plant?.find((v) => v.id === plCust.variation)?.shortName || 'Indoor Plant',

        x: snX,

        y: snY,

        r: plCust.r || 22,

        color: plCust.color,

      };

      const plantCol = checkPlacementCollision(newPlant, { walls, doors, furniture, spawnPoint });
      if (plantCol.isCollision) {
        setCollisionAlert({ message: plantCol.reason || `Plant decor blocked by ${plantCol.collidingType}` });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }

      setFurniture((prev) => {

        const targetIndex = prev.length;

        const next = [...prev, newPlant];

        setSelectedItem({ type: 'furniture', index: targetIndex });

        return next;

      });

    } else if (activeTool === 'spawn') {

      const spawnCol = checkPlacementCollision({ type: 'spawn', x: snX, y: snY, r: 22 }, { walls, doors, furniture });
      if (spawnCol.isCollision) {
        setCollisionAlert({ message: spawnCol.reason || `Spawn arrival marker blocked by ${spawnCol.collidingType}` });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }

      setSpawnPoint({ x: snX, y: snY });

      setSelectedItem({ type: 'spawn', index: 0 });

    }

  };

  const handlePointerMove = (e) => {

    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY);

    const snX = snap(wx);

    const snY = snap(wy);

    // Update live cursor coordinates for preview
    setCursorPos({ wx, wy, snX, snY, isOver: true });

    // Expansion arrow hover tracking (Clash of Clans wall building)
    if (selectedItem?.type === 'wall' && (activeTool === 'select' || activeTool === 'wall') && expansionArrows.length > 0) {
      let foundHover = null;
      for (let aIdx = 0; aIdx < expansionArrows.length; aIdx++) {
        const arrow = expansionArrows[aIdx];
        if (Math.hypot(wx - arrow.x, wy - arrow.y) <= 22) {
          foundHover = arrow;
          break;
        }
      }
      setHoveredExpansionArrow((prev) => (prev?.id === foundHover?.id ? prev : foundHover));
    } else if (hoveredExpansionArrow) {
      setHoveredExpansionArrow(null);
    }

    if (isPanningRef.current) {

      const dx = (e.clientX - panStartRef.current.x) / zoom;

      const dy = (e.clientY - panStartRef.current.y) / zoom;

      setCamera((prev) => ({ x: prev.x - dx, y: prev.y - dy }));

      panStartRef.current = { x: e.clientX, y: e.clientY };

      return;

    }

    if (!isDraggingRef.current || !selectedItem) return;

    const dragSnX = snap(wx - dragStartRef.current.x);

    const dragSnY = snap(wy - dragStartRef.current.y);

    if (selectedItem.type === 'spawn') {

      setSpawnPoint({ x: dragSnX, y: dragSnY });

    } else if (selectedItem.type === 'wall') {

      setWalls((prev) => {

        const next = [...prev];

        if (next[selectedItem.index]) {

          next[selectedItem.index] = { ...next[selectedItem.index], x: dragSnX, y: dragSnY };

        }

        return next;

      });

    } else if (selectedItem.type === 'door') {

      setDoors((prev) => {

        const next = [...prev];

        const d = next[selectedItem.index];

        if (d) {

          const rot = d.rotation || 0;

          let arc = [dragSnX, dragSnY, 90, -Math.PI / 2, 0];

          if (rot === 90) arc = [dragSnX, dragSnY, 90, 0, Math.PI / 2];

          else if (rot === 180) arc = [dragSnX + d.w, dragSnY + d.h, 90, Math.PI / 2, Math.PI];

          else if (rot === 270) arc = [dragSnX + d.w, dragSnY + d.h, 90, Math.PI, -Math.PI / 2];

          next[selectedItem.index] = { ...d, x: dragSnX, y: dragSnY, arc };

        }

        return next;

      });

    } else if (selectedItem.type === 'furniture') {

      setFurniture((prev) => {

        const next = [...prev];

        if (next[selectedItem.index]) {

          next[selectedItem.index] = { ...next[selectedItem.index], x: dragSnX, y: dragSnY };

        }

        return next;

      });

    } else if (selectedItem.type === 'zone') {

      setSoundZones((prev) => {

        const next = [...prev];

        const target = next[selectedItem.index];

        if (target) {

          const zw = target.bounds.x2 - target.bounds.x1;

          const zh = target.bounds.y2 - target.bounds.y1;

          next[selectedItem.index] = {

            ...target,

            bounds: {

              x1: dragSnX,

              y1: dragSnY,

              x2: dragSnX + zw,

              y2: dragSnY + zh,

            },

          };

        }

        return next;

      });

    }

  };

  const handlePointerUp = () => {

    isDraggingRef.current = false;
    setIsDragging(false);

    isPanningRef.current = false;
    setIsPanning(false);

  };

  const handlePointerLeave = () => {

    isDraggingRef.current = false;
    setIsDragging(false);

    isPanningRef.current = false;
    setIsPanning(false);

    setCursorPos((prev) => ({ ...prev, isOver: false }));
    setHoveredExpansionArrow(null);

  };

  // Wheel interaction: rotates drawing component OR rotates selected item OR zooms canvas

  const handleWheel = (e) => {

    e.preventDefault();

    if (activeTool !== 'select') {

      // Rotate armed tool by 45° increments using mouse wheel

      const delta = e.deltaY < 0 ? 45 : -45;

      setRotationAngle((prev) => (prev + delta + 360) % 360);

    } else if (selectedItem) {

      // Rotate currently selected item by 45° increments using mouse wheel

      const delta = e.deltaY < 0 ? 45 : -45;

      handleRotate(delta);

    } else {

      // Zoom canvas

      const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;

      setZoom((z) => Math.max(0.35, Math.min(1.5, Math.round((z + zoomDelta) * 100) / 100)));

    }

  };

  // Rotate selected canvas entity or armed drawing tool

  const handleRotate = (step = 45) => {

    if (activeTool !== 'select') {

      setRotationAngle((prev) => (prev + step + 360) % 360);

    } else if (selectedItem) {

      if (selectedItem.type === 'wall') {

        setWalls((prev) => {

          const next = [...prev];

          const w = next[selectedItem.index];

          if (w) {

            const nextRot = ((w.rotation || 0) + step + 360) % 360;

            const isVert = nextRot === 90 || nextRot === 270;

            const cx = w.x + w.w / 2;

            const cy = w.y + w.h / 2;

            const nw = isVert ? 8 : 120;

            const nh = isVert ? 120 : 8;

            next[selectedItem.index] = { ...w, x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh, rotation: nextRot };

          }

          return next;

        });

      } else if (selectedItem.type === 'door') {

        setDoors((prev) => {

          const next = [...prev];

          const d = next[selectedItem.index];

          if (d) {

            const nextRot = ((d.rotation || 0) + step + 360) % 360;

            const isVert = nextRot === 90 || nextRot === 270;

            const cx = d.x + d.w / 2;

            const cy = d.y + d.h / 2;

            const dw = isVert ? 8 : 90;

            const dh = isVert ? 90 : 8;

            const dx = cx - dw / 2;

            const dy = cy - dh / 2;

            let arc = [dx, dy, 90, -Math.PI / 2, 0];

            if (nextRot === 90) arc = [dx, dy, 90, 0, Math.PI / 2];

            else if (nextRot === 180) arc = [dx + dw, dy + dh, 90, Math.PI / 2, Math.PI];

            else if (nextRot === 270) arc = [dx + dw, dy + dh, 90, Math.PI, -Math.PI / 2];

            next[selectedItem.index] = { ...d, x: dx, y: dy, w: dw, h: dh, rotation: nextRot, arc };

          }

          return next;

        });

      } else if (selectedItem.type === 'furniture') {

        setFurniture((prev) => {

          const next = [...prev];

          const f = next[selectedItem.index];

          if (f) {

            const nextRot = ((f.rotation || 0) + step + 360) % 360;

            next[selectedItem.index] = { ...f, rotation: nextRot };

          }

          return next;

        });

      } else if (selectedItem.type === 'zone') {

        setSoundZones((prev) => {

          const next = [...prev];

          const z = next[selectedItem.index];

          if (z) {

            const nextRot = ((z.rotation || 0) + step + 360) % 360;

            const zw = z.bounds.x2 - z.bounds.x1;

            const zh = z.bounds.y2 - z.bounds.y1;

            const cx = (z.bounds.x1 + z.bounds.x2) / 2;

            const cy = (z.bounds.y1 + z.bounds.y2) / 2;

            next[selectedItem.index] = {

              ...z,

              rotation: nextRot,

              bounds: {

                x1: cx - zh / 2,

                y1: cy - zw / 2,

                x2: cx + zh / 2,

                y2: cy + zw / 2,

              },

            };

          }

          return next;

        });

      }

    }

  };

  // Duplicate Selected Element (Ctrl+D)

  const handleDuplicateSelected = () => {

    if (!selectedItem) return;

    if (selectedItem.type === 'wall') {

      const w = walls[selectedItem.index];

      if (!w) return;

      const newW = { ...w, x: w.x + 20, y: w.y + 20 };

      setWalls((prev) => [...prev, newW]);

      setSelectedItem({ type: 'wall', index: walls.length });

    } else if (selectedItem.type === 'door') {

      const d = doors[selectedItem.index];

      if (!d) return;

      const newD = {

        ...d,

        key: `door-${Date.now().toString(36)}`,

        x: d.x + 20,

        y: d.y + 20,

        arc: [d.x + 20, d.y + 20, d.w, -Math.PI / 2, 0],

      };

      setDoors((prev) => [...prev, newD]);

      setSelectedItem({ type: 'door', index: doors.length });

    } else if (selectedItem.type === 'furniture') {

      const f = furniture[selectedItem.index];

      if (!f) return;

      const newF = { ...f, x: f.x + 20, y: f.y + 20 };

      setFurniture((prev) => [...prev, newF]);

      setSelectedItem({ type: 'furniture', index: furniture.length });

    } else if (selectedItem.type === 'zone') {

      const z = soundZones[selectedItem.index];

      if (!z) return;

      const zw = z.bounds.x2 - z.bounds.x1;

      const zh = z.bounds.y2 - z.bounds.y1;

      const newZ = {

        ...z,

        id: `zone-${Date.now().toString(36)}`,

        bounds: {

          x1: z.bounds.x1 + 20,

          y1: z.bounds.y1 + 20,

          x2: z.bounds.x1 + 20 + zw,

          y2: z.bounds.y1 + 20 + zh,

        },

      };

      setSoundZones((prev) => [...prev, newZ]);

      setSelectedItem({ type: 'zone', index: soundZones.length });

    }

  };

  // Keyboard hotkeys

  useEffect(() => {

    const onKey = (e) => {

      // Don't intercept typing in input fields

      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      // Duplicate: Ctrl+D or Meta+D

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {

        e.preventDefault();

        handleDuplicateSelected();

        return;

      }

      // Rotate: R key

      if (e.key.toLowerCase() === 'r') {

        e.preventDefault();

        handleRotate(45);

        return;

      }

      // Sidebar drawer toggle: Ctrl+B or [

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {

        e.preventDefault();

        setIsPanelOpen((prev) => !prev);

        return;

      }

      if (e.key === '[') {

        e.preventDefault();

        setIsPanelOpen((prev) => !prev);

        return;

      }

      // Delete selected

      if (e.key === 'Delete' || e.key === 'Backspace') {

        if (!selectedItem) return;

        if (selectedItem.type === 'wall') {

          setWalls((prev) => prev.filter((_, idx) => idx !== selectedItem.index));

        } else if (selectedItem.type === 'door') {

          setDoors((prev) => prev.filter((_, idx) => idx !== selectedItem.index));

        } else if (selectedItem.type === 'furniture') {

          setFurniture((prev) => prev.filter((_, idx) => idx !== selectedItem.index));

        } else if (selectedItem.type === 'zone') {

          setSoundZones((prev) => prev.filter((_, idx) => idx !== selectedItem.index));

        }

        setSelectedItem(null);

        return;

      }

      // Escape to deselect / exit active placement mode
      if (e.key === 'Escape') {
        if (activeTool !== 'select') {
          setActiveTool('select');
        }
        setSelectedItem(null);
        return;
      }

      // Quick Tool Hotkeys

      const k = e.key.toLowerCase();

      if (k === 'v') handleSelectTool('select');

      else if (k === 'w') handleSelectTool('wall');

      else if (k === 'd') handleSelectTool('door');

      else if (k === 'p') handleSelectTool('desk');

      else if (k === 't') handleSelectTool('conf_table');

      else if (k === 'l') handleSelectTool('sofa');

      else if (k === 'k') handleSelectTool('server_rack');

      else if (k === 'f') handleSelectTool('plant');

      else if (k === 'z') handleSelectTool('zone');

      else if (k === 's') handleSelectTool('spawn');

      else if (k === 'g') setGridSnap((prev) => !prev);

    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);

  }, [selectedItem, walls, doors, furniture, soundZones, activeTool]);

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

        setSaveToast({

          type: 'success',

          msg: `Office "${saved.name}" deployed successfully!`,

          layout: saved,

        });

        setTimeout(() => setSaveToast(null), 4000);

      } else {

        throw new Error('Save failed');

      }

    } catch (_err) {

      setSaveToast({

        type: 'warn',

        msg: 'Office layout saved locally to workspace cache!',

        layout: payload,

      });

      setTimeout(() => setSaveToast(null), 4000);

    } finally {

      setIsSaving(false);

    }

  };

  // Filter tools based on search and category

  const filteredTools = useMemo(() => {

    return TOOLS.filter((tool) => {

      const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;

      const q = searchQuery.trim().toLowerCase();

      const matchesSearch =

        !q ||

        tool.label.toLowerCase().includes(q) ||

        tool.badge.toLowerCase().includes(q) ||

        tool.description.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;

    });

  }, [searchQuery, activeCategory]);

  // Group filtered tools by organized sections

  const groupedSections = useMemo(() => {

    return SECTIONS.map((section) => {

      const tools = filteredTools.filter((t) => t.sectionId === section.id);

      return { ...section, tools };

    }).filter((section) => section.tools.length > 0);

  }, [filteredTools]);

  // Selected item inspector details

  const selectedItemDetails = useMemo(() => {

    if (!selectedItem) return null;

    if (selectedItem.type === 'wall') {

      const w = walls[selectedItem.index];

      return w ? {

        title: `Soundproof Wall #${selectedItem.index + 1}`,

        x: w.x,

        y: w.y,

        w: w.w,

        h: w.h,

        rotation: w.rotation || 0,

        icon: 'border_all',

        color: '#818cf8',

        badge: 'ACOUSTIC BARRIER',

        acoustic: '-70% volume attenuation; dampens voice audio and prevents line-of-sight sound propagation',

        status: 'Active barrier',

      } : null;

    }

    if (selectedItem.type === 'door') {

      const d = doors[selectedItem.index];

      return d ? {

        title: d.name || `Knock Door #${selectedItem.index + 1}`,

        x: d.x,

        y: d.y,

        w: d.w,

        h: d.h,

        rotation: d.rotation || 0,

        icon: 'meeting_room',

        color: '#f59e0b',

        badge: 'PRIVACY GATE',

        acoustic: 'Isolated room door with interactive knock chime; speech remains private when closed',

        status: 'Soundproof seal',

      } : null;

    }

    if (selectedItem.type === 'furniture') {

      const f = furniture[selectedItem.index];

      if (!f) return null;

      let title = `Furniture Element #${selectedItem.index + 1}`;

      let icon = 'desktop_windows';

      let color = '#38bdf8';

      let badge = 'WORKSPACE';

      let acoustic = 'Local earshot seating area within 100px proximity falloff';

      if (f.type === 'rect') {

        title = f.name || 'Workstation Desk Unit';

        icon = 'table_restaurant';

        color = '#b5896a';

        badge = 'DESK SURFACE';

        acoustic = 'Solid workspace desk with local earshot clustering for collaboration';

      } else if (f.type === 'chair') {

        title = 'Ergonomic Swivel Chair';

        icon = 'chair';

        color = '#7c6050';

        badge = 'SEATING';

        acoustic = 'Participant audio listener & transmitter position';

      } else if (f.type === 'plant') {

        title = f.name || 'Indoor Botanical Plant';

        icon = 'potted_plant';

        color = '#22c55e';

        badge = 'BIOPHILIC DECOR';

        acoustic = 'Soft acoustic diffuser that scatters echoes without blocking voice travel';

      } else if (f.type === 'sofa') {

        title = f.name || 'Lounge Breakout Sofa';

        icon = 'weekend';

        color = '#94a3b8';

        badge = 'SOFT SEATING';

        acoustic = 'Casual huddle seating with conversational distance falloff';

      } else if (f.type === 'server_rack') {

        title = f.name || 'IT Server Rack Divider';

        icon = 'dns';

        color = '#0ea5e9';

        badge = 'TECH INFRA';

        acoustic = 'Equipment partition with status telemetry and line-of-sight obstruction';

      } else if (f.type === 'screen') {

        title = 'Workstation Display';

        icon = 'desktop_windows';

        color = '#38bdf8';

        badge = 'DISPLAY';

        acoustic = 'Dual-monitor visual display for workspace pod';

      }

      return {

        title,

        x: f.x,

        y: f.y,

        w: f.w || (f.r ? f.r * 2 : 20),

        h: f.h || (f.r ? f.r * 2 : 20),

        rotation: f.rotation || 0,

        icon,

        color,

        badge,

        acoustic,

        status: 'Placed on floor',

      };

    }

    if (selectedItem.type === 'zone') {

      const z = soundZones[selectedItem.index];

      const model = ACOUSTIC_VARIATIONS.zone.find((m) => m.id === z.variation) || ACOUSTIC_VARIATIONS.zone[0];

      const zw = z.bounds ? z.bounds.x2 - z.bounds.x1 : 280;

      const zh = z.bounds ? z.bounds.y2 - z.bounds.y1 : 200;

      return z ? {

        title: z.name || model.name,

        x: z.bounds.x1,

        y: z.bounds.y1,

        w: zw,

        h: zh,

        rotation: z.rotation || 0,

        variation: z.variation || 'meeting_suite',

        color: z.color || '#0284c7',

        icon: model.icon || 'volume_off',

        badge: model.badge || 'SOUND PERIMETER',

        acoustic: model.desc || 'Demarcates isolated meeting room perimeter with customized proximity decay',

        status: 'Isolated Zone',

        rawItem: z,

      } : null;

    }

    if (selectedItem.type === 'spawn') {

      return {

        title: 'Spawn Arrival Point',

        x: spawnPoint.x,

        y: spawnPoint.y,

        w: 36,

        h: 36,

        rotation: 0,

        icon: 'my_location',

        color: '#ef4444',

        badge: 'TELEPORT NODE',

        acoustic: 'Spatial origin where participants join the WebRTC audio mesh',

        status: 'Fixed coordinates',

      };

    }

    return null;

  }, [selectedItem, walls, doors, furniture, soundZones, spawnPoint]);

  // Wall Expansion Arrows (Clash of Clans directional handles)
  const expansionArrows = useMemo(() => {
    if (selectedItem?.type !== 'wall' || (activeTool !== 'select' && activeTool !== 'wall')) return [];
    const w = walls[selectedItem.index];
    if (!w) return [];
    return getWallExpansionArrows(w, walls, WORLD_W, WORLD_H);
  }, [selectedItem, walls, activeTool]);

  // Dynamic Canvas Cursor (pointing hand for walls, grab/grabbing for models/objects)
  const canvasCursor = useMemo(() => {
    if (isDragging || isPanning) return 'cursor-grabbing';
    if (hoveredExpansionArrow) return 'cursor-pointer';
    if (activeTool === 'wall') return 'cursor-pointer';
    if (activeTool !== 'select') return 'cursor-crosshair';
    if (selectedItem) return 'cursor-grab';
    return 'cursor-default';
  }, [isDragging, isPanning, hoveredExpansionArrow, activeTool, selectedItem]);

  // Armed Tool Details (for when no object is selected)

  const armedToolDetails = useMemo(() => {

    const t = TOOLS.find((item) => item.id === activeTool) || TOOLS[0];

    return t;

  }, [activeTool]);

  return (

    <div className="flex flex-col h-screen w-screen bg-[#070a13] text-[#e2e8f0] select-none overflow-hidden font-['Inter',sans-serif]">

      {/* Top Studio Control Header */}

      <header onPointerEnter={() => { setHoveredExpansionArrow(null); setCursorPos((prev) => ({ ...prev, isOver: false })); }} className="h-12 border-b border-[#182030] bg-[#0b101c] px-3.5 flex items-center justify-between z-30 shrink-0">

        <div className="flex items-center gap-2.5">

          <button

            onClick={onBackToLobby}

            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#131b2a] hover:bg-[#1a253a] text-xs font-semibold text-[#cbd5e1] border border-[#202c42] transition-colors"

            title="Return to Space Lobby"

          >

            <span className="material-symbols-outlined text-[15px]">arrow_back</span>

            <span>Back</span>

          </button>

          <div className="h-4 w-[1px] bg-[#1e293b]" />

          <div className="flex items-center gap-1.5">

            <span className="material-symbols-outlined text-[17px] text-[#38bdf8]">architecture</span>

            <input

              type="text"

              value={officeName}

              onChange={(e) => setOfficeName(e.target.value)}

              className="bg-transparent border-b border-transparent hover:border-[#38bdf8]/50 focus:border-[#38bdf8] focus:outline-none text-xs font-bold text-white px-1 py-0.5 rounded transition-all w-48 sm:w-60"

              placeholder="Custom Office Name"

            />

          </div>

          <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#131b2a] border border-[#202c42] text-[#94a3b8]">

            {organization?.name || 'Workspace HQ'}

          </span>

        </div>

        {/* Center Quick Presets */}

        <div className="hidden md:flex items-center gap-1.5">

          <button

            onClick={() => handleLoadPreset('startup')}

            className="px-2.5 py-1 text-xs rounded bg-[#111726] hover:bg-[#192336] text-[#94a3b8] hover:text-white border border-[#1b2538] transition-colors"

          >

            Startup Loft

          </button>

          <button

            onClick={() => handleLoadPreset('executive')}

            className="px-2.5 py-1 text-xs rounded bg-[#111726] hover:bg-[#192336] text-[#94a3b8] hover:text-white border border-[#1b2538] transition-colors"

          >

            Executive Suite

          </button>

          <button

            onClick={() => handleLoadPreset('clear')}

            className="px-2.5 py-1 text-xs rounded bg-[#111726] hover:bg-[#26151a] text-[#f87171] hover:text-[#ef4444] border border-[#1b2538] hover:border-red-900/50 transition-colors"

          >

            Clear Floor

          </button>

        </div>

        {/* Right Actions & Deploy */}

        <div className="flex items-center gap-2">

          {/* Snap Button */}

          <button

            onClick={() => setGridSnap((s) => !s)}

            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all border ${

              gridSnap

                ? 'bg-[#0284c7]/20 text-[#38bdf8] border-[#0284c7]/60'

                : 'bg-[#111726] text-[#64748b] border-[#1b2538]'

            }`}

            title="Toggle 20px Grid Snapping (Hotkey: G)"

          >

            <span className="material-symbols-outlined text-[14px]">grid_4x4</span>

            <span>Snap {gridSnap ? '20px' : 'Off'}</span>

          </button>

          {/* Quick Rotation Indicator & Selector */}

          <button

            onClick={() => handleRotate(45)}

            className="px-2.5 py-1 rounded bg-[#111726] hover:bg-[#182338] text-xs font-medium text-[#38bdf8] border border-[#1d273a] flex items-center gap-1 transition-colors"

            title="Rotate Component (Scroll Wheel / Hotkey: R)"

          >

            <span className="material-symbols-outlined text-[14px]">rotate_right</span>

            <span className="font-mono text-[11px] font-bold">{rotationAngle}°</span>

          </button>

          <button

            onClick={handleSaveLayout}

            disabled={isSaving}

            className="flex items-center gap-1.5 px-3.5 py-1 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-md shadow-blue-500/20 border border-blue-400/40 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"

          >

            <span className="material-symbols-outlined text-[15px]">rocket_launch</span>

            <span>{isSaving ? 'Deploying...' : 'Deploy Office'}</span>

          </button>

        </div>

      </header>

      {/* Main Studio Flex Workspace */}

      <div className="flex-1 flex overflow-hidden relative">

        {/* Left Fixed Rail Bar (56px width, always clickable) */}

        <aside onPointerEnter={() => { setHoveredExpansionArrow(null); setCursorPos((prev) => ({ ...prev, isOver: false })); }} className="w-14 h-full bg-[#0a0e17] border-r border-[#171f2e] flex flex-col items-center py-2 shrink-0 z-20 select-none justify-between">

          {/* Top Rail Section: Toggle Drawer + Mode Switchers */}

          <div className="flex flex-col items-center gap-1.5 w-full">

            {/* Collapse / Expand Toggle Button */}

            <button

              onClick={() => setIsPanelOpen((prev) => !prev)}

              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${

                isPanelOpen

                  ? 'bg-[#162033] text-[#38bdf8] border border-[#23334d]'

                  : 'text-[#94a3b8] hover:text-white hover:bg-[#121927]'

              }`}

              title={isPanelOpen ? 'Collapse Studio Drawer (Ctrl+B / [)' : 'Expand Studio Drawer (Ctrl+B / [)'}

            >

              <span className="material-symbols-outlined text-[19px]">

                {isPanelOpen ? 'left_panel_close' : 'left_panel_open'}

              </span>

            </button>

            <div className="w-7 h-[1px] bg-[#1a2334] my-0.5" />

            {/* Mode 1: Catalog */}

            <button

              onClick={() => {

                setPanelTab('catalog');

                if (!isPanelOpen) setIsPanelOpen(true);

              }}

              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${

                panelTab === 'catalog' && isPanelOpen

                  ? 'bg-blue-600/20 text-[#38bdf8] border border-blue-500/40'

                  : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#121927]'

              }`}

              title="Components Library"

            >

              <span className="material-symbols-outlined text-[19px]">grid_view</span>

            </button>

            {/* Mode 2: Inspector */}

            <button

              onClick={() => {

                setPanelTab('inspector');

                if (!isPanelOpen) setIsPanelOpen(true);

              }}

              className={`w-9 h-9 rounded-lg flex items-center justify-center relative transition-all ${

                panelTab === 'inspector' && isPanelOpen

                  ? 'bg-blue-600/20 text-[#38bdf8] border border-blue-500/40'

                  : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#121927]'

              }`}

              title="Object Inspector"

            >

              <span className="material-symbols-outlined text-[19px]">tune</span>

              {selectedItem && (

                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse shadow-[0_0_6px_#f59e0b]" />

              )}

            </button>

            {/* Mode 3: Presets */}

            <button

              onClick={() => {

                setPanelTab('presets');

                if (!isPanelOpen) setIsPanelOpen(true);

              }}

              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${

                panelTab === 'presets' && isPanelOpen

                  ? 'bg-blue-600/20 text-[#38bdf8] border border-blue-500/40'

                  : 'text-[#64748b] hover:text-[#cbd5e1] hover:bg-[#121927]'

              }`}

              title="Floor Presets"

            >

              <span className="material-symbols-outlined text-[19px]">layers</span>

            </button>

          </div>

          {/* Center Quick Tools Stack */}

          <div className="flex flex-col items-center gap-1 w-full my-auto overflow-y-auto no-scrollbar py-1">

            <div className="w-7 h-[1px] bg-[#1a2334] my-0.5" />

            {TOOLS.map((tool) => {

              const isActive = activeTool === tool.id;

              return (

                <button

                  key={tool.id}

                  onClick={() => {
                                  if (activeTool === tool.id && tool.id !== 'select') {
                                    setIsCustomizerExpanded((prev) => !prev);
                                  } else {
                                    handleSelectTool(tool.id);
                                    setIsCustomizerExpanded(true);
                                  }
                                }}

                  className={`w-8 h-8 rounded-lg flex items-center justify-center relative transition-all ${

                    isActive

                      ? 'bg-[#162238] text-white border border-[#38bdf8]/70 shadow-sm'

                      : 'text-[#64748b] hover:text-white hover:bg-[#111726]'

                  }`}

                  title={`${tool.label} [${tool.hotkey}]`}

                >

                  <span className="material-symbols-outlined text-[17px]">{tool.icon}</span>

                  {isActive && (

                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] h-4 bg-[#38bdf8] rounded-r-full shadow-[0_0_6px_#38bdf8]" />

                  )}

                </button>

              );

            })}

          </div>

          {/* Bottom Zoom & Reset Utilities */}

          <div className="flex flex-col items-center gap-1 w-full pt-1 border-t border-[#171f2e]">

            <button

              onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}

              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748b] hover:text-white hover:bg-[#121927] transition-colors"

              title="Zoom In"

            >

              <span className="material-symbols-outlined text-[15px]">add</span>

            </button>

            <span className="text-[9px] font-mono font-bold text-[#64748b]">

              {Math.round(zoom * 100)}%

            </span>

            <button

              onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))}

              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748b] hover:text-white hover:bg-[#121927] transition-colors"

              title="Zoom Out"

            >

              <span className="material-symbols-outlined text-[15px]">remove</span>

            </button>

            <button

              onClick={() => {

                setZoom(0.65);

                setCamera({ x: WORLD_W / 2, y: WORLD_H / 2 });

              }}

              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#64748b] hover:text-[#38bdf8] hover:bg-[#121927] transition-colors"

              title="Center Canvas"

            >

              <span className="material-symbols-outlined text-[15px]">filter_center_focus</span>

            </button>

          </div>

        </aside>

        {/* Sliding Flyout Drawer (Natural Flex width transition) */}

        <div

          onPointerEnter={() => { setHoveredExpansionArrow(null); setCursorPos((prev) => ({ ...prev, isOver: false })); }}

          className={`h-full bg-[#0d131f] border-r border-[#1a2333] transition-[width,opacity] duration-300 ease-in-out shrink-0 overflow-hidden z-10 flex flex-col ${

            isPanelOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 pointer-events-none border-r-0'

          }`}

        >

          {/* Inner 320px fixed wrapper to ensure clean alignment */}

          <div className="w-80 h-full flex flex-col min-h-0 select-none">

            {/* Drawer Top Navigation Header */}

            <div className="h-11 px-3 border-b border-[#171f2e] flex items-center justify-between shrink-0 bg-[#0a0e17]">

              <div className="flex items-center gap-1.5">

                <span className="material-symbols-outlined text-[17px] text-[#38bdf8]">

                  {panelTab === 'catalog' ? 'category' : panelTab === 'inspector' ? 'tune' : 'layers'}

                </span>

                <span className="text-[11px] font-bold uppercase tracking-wider text-white">

                  {panelTab === 'catalog' ? 'Studio Components' : panelTab === 'inspector' ? 'Object Inspector' : 'Floor Templates'}

                </span>

              </div>

              <button

                onClick={() => setIsPanelOpen(false)}

                className="w-6 h-6 rounded flex items-center justify-center text-[#64748b] hover:text-white hover:bg-[#162133] transition-colors"

                title="Collapse drawer (Hotkey: [)"

              >

                <span className="material-symbols-outlined text-[17px]">chevron_left</span>

              </button>

            </div>

            {/* TAB 1: Components Catalog */}

            {panelTab === 'catalog' && (

              <div className="flex-1 flex flex-col min-h-0">

                {/* Search & Segment Control */}

                <div className="p-2.5 border-b border-[#171f2e] space-y-2 shrink-0 bg-[#0c121e]">

                  <div className="relative">

                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-[#64748b]">

                      search

                    </span>

                    <input

                      type="text"

                      value={searchQuery}

                      onChange={(e) => setSearchQuery(e.target.value)}

                      placeholder="Filter components (e.g. wall, desk)..."

                      className="w-full bg-[#111726] border border-[#1d273a] focus:border-[#38bdf8] rounded-md pl-8 pr-7 py-1 text-xs text-white placeholder-[#64748b] focus:outline-none transition-colors"

                    />

                    {searchQuery && (

                      <button

                        onClick={() => setSearchQuery('')}

                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-white"

                      >

                        <span className="material-symbols-outlined text-[13px]">close</span>

                      </button>

                    )}

                  </div>

                  {/* 4-Segment Clean Category Bar */}

                  <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#090d16] rounded-md border border-[#171f2e] text-[10px]">

                    {[

                      { id: 'all', label: 'All' },

                      { id: 'acoustics', label: 'Acoustic' },

                      { id: 'workspace', label: 'Desks' },

                      { id: 'decor', label: 'Decor' },

                    ].map((cat) => (

                      <button

                        key={cat.id}

                        onClick={() => setActiveCategory(cat.id)}

                        className={`py-1 text-center rounded font-medium transition-all ${

                          activeCategory === cat.id

                            ? 'bg-[#182338] text-white shadow-sm font-semibold'

                            : 'text-[#64748b] hover:text-[#cbd5e1]'

                        }`}

                      >

                        {cat.label}

                      </button>

                    ))}

                  </div>

                </div>

                {/* Active Tool Model & Customization Subpanel - Studio Grade & Collapsible */}
                {['wall', 'door', 'zone', 'conf_table', 'desk', 'sofa', 'server_rack', 'plant', 'spawn'].includes(activeTool) && (() => {
                  const activeVariationList = ACOUSTIC_VARIATIONS[activeTool] || FURNITURE_VARIATIONS[activeTool] || [];
                  const curCustom = toolCustomization[activeTool] || {};
                  const activeModel = activeVariationList.find((m) => m.id === curCustom.variation) || activeVariationList[0];

                  const getDimensionSummary = () => {
                    if (activeTool === 'wall') return `${curCustom.length || 120}×${curCustom.thickness || 10}px`;
                    if (activeTool === 'door') return `${curCustom.width || 90}px`;
                    if (activeTool === 'zone') return `${curCustom.width || 280}×${curCustom.height || 200}px`;
                    if (activeTool === 'conf_table') return `${curCustom.w || 320}×${curCustom.h || 150}px (${curCustom.seats || 10}s)`;
                    if (activeTool === 'desk') return `${curCustom.w || 180}×${curCustom.h || 100}px`;
                    if (activeTool === 'sofa') return `${curCustom.w || 180}×${curCustom.h || 75}px`;
                    if (activeTool === 'server_rack') return `${curCustom.w || 75}×${curCustom.h || 120}px`;
                    if (activeTool === 'plant') return `r:${curCustom.r || 22}px`;
                    if (activeTool === 'spawn') return 'Portal';
                    return 'Custom';
                  };

                  {/* State A: Collapsed Single-Row Mini Bar */}
                  if (!isCustomizerExpanded) {
                    return (
                      <div
                        onClick={() => setIsCustomizerExpanded(true)}
                        className="mx-2.5 my-1.5 px-2.5 py-1.5 rounded-lg bg-[#0a0f1d] border border-[#1b263b] hover:border-[#38bdf8]/50 cursor-pointer flex items-center justify-between transition-all group shrink-0"
                        title="Click to expand model variations & specs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: `${armedToolDetails.color}20`,
                              color: armedToolDetails.color,
                              border: `1px solid ${armedToolDetails.color}40`,
                            }}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {activeModel?.icon || armedToolDetails.icon}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold text-white truncate">
                            {activeModel?.shortName || armedToolDetails.label}
                          </span>
                          <span className="text-[8.5px] font-mono px-1.5 py-0.2 rounded bg-[#131d2e] text-[#38bdf8] border border-[#38bdf8]/30 shrink-0">
                            {getDimensionSummary()}
                          </span>
                          {curCustom.color && (
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/20 shrink-0"
                              style={{ backgroundColor: curCustom.color }}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-[#38bdf8] font-semibold group-hover:text-white transition-colors shrink-0">
                          <span>Specs</span>
                          <span className="material-symbols-outlined text-[14px]">tune</span>
                        </div>
                      </div>
                    );
                  }

                  {/* State B: Expanded Studio Customizer Panel */}
                  return (
                    <div className="mx-2.5 my-1.5 rounded-xl bg-[#090e1a] border border-[#1c283f] overflow-hidden shadow-lg transition-all shrink-0">
                      {/* Subpanel Header */}
                      <div className="px-2.5 py-1.5 bg-[#0d1424] border-b border-[#172238] flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: `${armedToolDetails.color}20`,
                              color: armedToolDetails.color,
                              border: `1px solid ${armedToolDetails.color}40`,
                            }}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {armedToolDetails.icon}
                            </span>
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-white truncate">
                            {armedToolDetails.label}
                          </span>
                          <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded bg-sky-950/60 text-[#38bdf8] border border-sky-700/40 shrink-0">
                            ARMED
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => setIsCustomizerExpanded(false)}
                            className="w-5 h-5 rounded flex items-center justify-center text-[#64748b] hover:text-white hover:bg-[#162136] transition-colors"
                            title="Minimize options panel"
                          >
                            <span className="material-symbols-outlined text-[15px]">keyboard_arrow_up</span>
                          </button>
                          <button
                            onClick={() => handleSelectTool('select')}
                            className="w-5 h-5 rounded flex items-center justify-center text-[#64748b] hover:text-rose-400 hover:bg-[#162136] transition-colors"
                            title="Deselect tool (Esc)"
                          >
                            <span className="material-symbols-outlined text-[13px]">close</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-2 space-y-2">
                        {/* 1. Model Variations Grid */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-[#64748b]">
                            <span>Model Variant</span>
                            <span className="font-mono text-[#38bdf8] text-[9px] truncate max-w-[130px]">
                              {activeModel?.shortName}
                            </span>
                          </div>
                          <div className={`grid ${activeVariationList.length <= 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-1`}>
                            {activeVariationList.map((model) => {
                              const isSelected = curCustom.variation === model.id;
                              return (
                                <button
                                  key={model.id}
                                  onClick={() => {
                                    setToolCustomization((prev) => ({
                                      ...prev,
                                      [activeTool]: {
                                        ...prev[activeTool],
                                        variation: model.id,
                                        color: model.defaultColor || prev[activeTool].color,
                                        ...(model.defaultLength ? { length: model.defaultLength } : {}),
                                        ...(model.defaultWidth ? { width: model.defaultWidth } : {}),
                                        ...(model.defaultHeight ? { height: model.defaultHeight } : {}),
                                        ...(model.defaultThickness ? { thickness: model.defaultThickness } : {}),
                                        ...(model.defaultMaxDist ? { maxDistance: model.defaultMaxDist } : {}),
                                        ...(model.defaultW ? { w: model.defaultW } : {}),
                                        ...(model.defaultH ? { h: model.defaultH } : {}),
                                        ...(model.defaultR ? { r: model.defaultR } : {}),
                                        ...(model.seats ? { seats: model.seats } : {}),
                                      },
                                    }));
                                  }}
                                  className={`p-1 rounded-md border text-left transition-all flex items-center gap-1.5 ${
                                    isSelected
                                      ? 'bg-[#142238] border-[#38bdf8] text-white shadow-sm'
                                      : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white hover:border-[#22334f]'
                                  }`}
                                  title={model.desc}
                                >
                                  <div
                                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                                      isSelected ? 'bg-[#38bdf8]/20 text-[#38bdf8]' : 'bg-[#121929] text-[#64748b]'
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-[13px]">{model.icon}</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[9.5px] font-bold truncate leading-tight">{model.shortName}</div>
                                    <div className="text-[7.5px] font-mono text-[#64748b] truncate leading-tight">{model.badge}</div>
                                  </div>
                                  {isSelected && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shrink-0 mr-0.5" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {activeModel?.desc && (
                            <div className="text-[8.5px] text-[#64748b] leading-tight truncate italic px-0.5 pt-0.5">
                              {activeModel.desc}
                            </div>
                          )}
                        </div>

                        {/* 2. Dimensions & Presets */}
                        <div className="pt-1.5 border-t border-[#141d2e] space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-[#64748b]">
                            <span>Dimensions & Scale</span>
                            <span className="font-mono text-[#38bdf8] text-[8.5px]">
                              {getDimensionSummary()}
                            </span>
                          </div>

                          {/* Wall Controls */}
                          {activeTool === 'wall' && (
                            <div className="space-y-1">
                              <div className="grid grid-cols-4 gap-1">
                                {[60, 120, 180, 240].map((len) => (
                                  <button
                                    key={len}
                                    onClick={() => setToolCustomization((p) => ({ ...p, wall: { ...p.wall, length: len } }))}
                                    className={`py-0.5 text-[8.5px] font-mono rounded border transition-colors ${
                                      curCustom.length === len
                                        ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] font-bold'
                                        : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white'
                                    }`}
                                  >
                                    {len}px
                                  </button>
                                ))}
                              </div>
                              <div className="flex items-center gap-1 pt-0.5">
                                <span className="text-[8px] text-[#64748b]">Core:</span>
                                {[
                                  { label: 'Slim 6px', val: 6 },
                                  { label: 'Std 10px', val: 10 },
                                  { label: 'Heavy 16px', val: 16 },
                                ].map((t) => (
                                  <button
                                    key={t.val}
                                    onClick={() => setToolCustomization((p) => ({ ...p, wall: { ...p.wall, thickness: t.val } }))}
                                    className={`px-1.5 py-0.2 text-[8px] rounded border transition-colors ${
                                      curCustom.thickness === t.val
                                        ? 'bg-[#18253a] border-[#38bdf8] text-white font-semibold'
                                        : 'bg-[#0b101c] border-[#162136] text-[#64748b] hover:text-[#94a3b8]'
                                    }`}
                                  >
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Door Controls */}
                          {activeTool === 'door' && (
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { label: '70px', val: 70 },
                                { label: '90px', val: 90 },
                                { label: '120px', val: 120 },
                                { label: '140px Dbl', val: 140 },
                              ].map((d) => (
                                <button
                                  key={d.val}
                                  onClick={() => setToolCustomization((p) => ({ ...p, door: { ...p.door, width: d.val } }))}
                                  className={`py-0.5 text-[8.5px] font-mono rounded border transition-colors ${
                                    curCustom.width === d.val
                                      ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] font-bold'
                                      : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white'
                                  }`}
                                >
                                  {d.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Zone Controls */}
                          {activeTool === 'zone' && (
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { label: 'Pod (180×140)', w: 180, h: 140 },
                                { label: 'Suite (280×200)', w: 280, h: 200 },
                                { label: 'Vault (420×280)', w: 420, h: 280 },
                              ].map((pre) => (
                                <button
                                  key={pre.label}
                                  onClick={() => setToolCustomization((p) => ({ ...p, zone: { ...p.zone, width: pre.w, height: pre.h } }))}
                                  className={`py-0.5 text-[8px] font-medium rounded border transition-colors ${
                                    curCustom.width === pre.w && curCustom.height === pre.h
                                      ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] font-bold'
                                      : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white'
                                  }`}
                                >
                                  {pre.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Conference Table Controls */}
                          {activeTool === 'conf_table' && (
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { label: '8-Seat (260×130)', w: 260, h: 130, seats: 8 },
                                { label: '10-Seat (320×150)', w: 320, h: 150, seats: 10 },
                                { label: '12-Seat (380×170)', w: 380, h: 170, seats: 12 },
                              ].map((pre) => (
                                <button
                                  key={pre.label}
                                  onClick={() => setToolCustomization((p) => ({ ...p, conf_table: { ...p.conf_table, w: pre.w, h: pre.h, seats: pre.seats } }))}
                                  className={`py-0.5 text-[8px] font-medium rounded border transition-colors ${
                                    curCustom.w === pre.w && curCustom.h === pre.h
                                      ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] font-bold'
                                      : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white'
                                  }`}
                                >
                                  {pre.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Desk Pod Controls */}
                          {activeTool === 'desk' && (
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { label: 'Single (140×80)', w: 140, h: 80 },
                                { label: 'Dual Bench (180×100)', w: 180, h: 100 },
                                { label: 'Cluster (260×110)', w: 260, h: 110 },
                              ].map((pre) => (
                                <button
                                  key={pre.label}
                                  onClick={() => setToolCustomization((p) => ({ ...p, desk: { ...p.desk, w: pre.w, h: pre.h } }))}
                                  className={`py-0.5 text-[8px] font-medium rounded border transition-colors ${
                                    curCustom.w === pre.w && curCustom.h === pre.h
                                      ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] font-bold'
                                      : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white'
                                  }`}
                                >
                                  {pre.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Sofa Controls */}
                          {activeTool === 'sofa' && (
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { label: 'Compact (140×75)', w: 140, h: 75 },
                                { label: 'Standard (180×75)', w: 180, h: 75 },
                                { label: 'Grand (260×85)', w: 260, h: 85 },
                              ].map((pre) => (
                                <button
                                  key={pre.label}
                                  onClick={() => setToolCustomization((p) => ({ ...p, sofa: { ...p.sofa, w: pre.w, h: pre.h } }))}
                                  className={`py-0.5 text-[8px] font-medium rounded border transition-colors ${
                                    curCustom.w === pre.w && curCustom.h === pre.h
                                      ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] font-bold'
                                      : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white'
                                  }`}
                                >
                                  {pre.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Server Rack Controls */}
                          {activeTool === 'server_rack' && (
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { label: 'Single (75×60)', w: 75, h: 60 },
                                { label: 'Dual Bay (75×120)', w: 75, h: 120 },
                                { label: 'Triple (75×180)', w: 75, h: 180 },
                              ].map((pre) => (
                                <button
                                  key={pre.label}
                                  onClick={() => setToolCustomization((p) => ({ ...p, server_rack: { ...p.server_rack, w: pre.w, h: pre.h } }))}
                                  className={`py-0.5 text-[8px] font-medium rounded border transition-colors ${
                                    curCustom.w === pre.w && curCustom.h === pre.h
                                      ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] font-bold'
                                      : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white'
                                  }`}
                                >
                                  {pre.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Plant Controls */}
                          {activeTool === 'plant' && (
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { label: 'Small 16px', r: 16 },
                                { label: 'Medium 22px', r: 22 },
                                { label: 'Large 32px', r: 32 },
                              ].map((pre) => (
                                <button
                                  key={pre.label}
                                  onClick={() => setToolCustomization((p) => ({ ...p, plant: { ...p.plant, r: pre.r } }))}
                                  className={`py-0.5 text-[8px] font-medium rounded border transition-colors ${
                                    curCustom.r === pre.r
                                      ? 'bg-[#38bdf8]/20 border-[#38bdf8] text-[#38bdf8] font-bold'
                                      : 'bg-[#0b101c] border-[#162136] text-[#818ea3] hover:text-white'
                                  }`}
                                >
                                  {pre.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 3. Material Finish & Color Palette */}
                        <div className="pt-1.5 border-t border-[#141d2e] space-y-1">
                          <div className="text-[9px] font-semibold text-[#64748b] uppercase tracking-wider">
                            Finish & Color
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(activeModel?.availableColors || [
                              { name: 'Slate Concrete', hex: '#2c3050' },
                              { name: 'Obsidian Black', hex: '#1e293b' },
                              { name: 'Warm Timber', hex: '#854d0e' },
                              { name: 'Frosted Glass', hex: '#0284c7' },
                              { name: 'Studio White', hex: '#cbd5e1' },
                            ]).map((swatch) => {
                              const isSelected = curCustom.color === swatch.hex;
                              return (
                                <button
                                  key={swatch.hex}
                                  onClick={() => setToolCustomization((p) => ({
                                    ...p,
                                    [activeTool]: { ...p[activeTool], color: swatch.hex }
                                  }))}
                                  title={swatch.name}
                                  className={`w-4 h-4 rounded-full border transition-all ${
                                    isSelected
                                      ? 'scale-125 ring-2 ring-[#38bdf8] ring-offset-1 ring-offset-[#090e1a] border-white'
                                      : 'border-transparent hover:scale-110 opacity-75 hover:opacity-100'
                                  }`}
                                  style={{ backgroundColor: swatch.hex }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Section-Organized Tool List with Clean Alignment */}

                <div className="flex-1 overflow-y-auto studio-scrollbar p-2.5 space-y-3 min-h-0">

                  {groupedSections.length === 0 ? (

                    <div className="text-center py-8 text-[#64748b] text-xs">

                      No components found matching &ldquo;{searchQuery}&rdquo;

                    </div>

                  ) : (

                    groupedSections.map((section) => (

                      <div key={section.id} className="space-y-1">

                        {/* Section Header */}

                        <div className="px-1 pt-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">

                          <span className="flex items-center gap-1.5">

                            <span className="material-symbols-outlined text-[13px] text-[#38bdf8]">

                              {section.icon}

                            </span>

                            <span>{section.title}</span>

                          </span>

                          <span className="font-mono text-[9px] text-[#64748b]">

                            {section.tools.length}

                          </span>

                        </div>

                        {/* Section Tool Items */}

                        <div className="space-y-1">

                          {section.tools.map((tool) => {

                            const isActive = activeTool === tool.id;

                            return (

                              <div

                                key={tool.id}

                                onClick={() => {
                                  if (activeTool === tool.id && tool.id !== 'select') {
                                    setIsCustomizerExpanded((prev) => !prev);
                                  } else {
                                    handleSelectTool(tool.id);
                                    setIsCustomizerExpanded(true);
                                  }
                                }}

                                className={`group px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${

                                  isActive

                                    ? 'bg-[#152033] border-[#38bdf8] shadow-[0_0_12px_rgba(56,189,248,0.18)]'

                                    : 'bg-[#0f1524] border-[#182133] hover:border-[#263550] hover:bg-[#131b2e]'

                                }`}

                              >

                                {/* Left: Semantic Icon Box + Text Info */}

                                <div className="flex items-center gap-2.5 min-w-0">

                                  <div

                                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"

                                    style={{

                                      backgroundColor: `${tool.color}15`,

                                      color: tool.color,

                                      border: `1px solid ${tool.color}35`,

                                    }}

                                  >

                                    <span className="material-symbols-outlined text-[17px]">

                                      {tool.icon}

                                    </span>

                                  </div>

                                  <div className="min-w-0 flex-1">

                                    <div className="flex items-center gap-1.5">

                                      <span className="text-[12px] font-semibold text-slate-100 truncate group-hover:text-white">

                                        {tool.label}

                                      </span>

                                      {isActive && (

                                        <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shadow-[0_0_6px_#38bdf8]" />

                                      )}

                                    </div>

                                    <p className="text-[10px] text-slate-400 truncate leading-tight mt-0.5">

                                      {tool.description}

                                    </p>

                                  </div>

                                </div>

                                {/* Right: Clean Monospace Hotkey & Specs Indicator */}
                                <div className="flex items-center gap-1 shrink-0 ml-2">
                                  {isActive && tool.id !== 'select' && (
                                    <span
                                      className="text-[8px] font-mono font-bold px-1 py-0.5 rounded bg-[#18263e] text-[#38bdf8] border border-[#38bdf8]/40"
                                      title={isCustomizerExpanded ? "Specs panel open" : "Specs panel collapsed"}
                                    >
                                      {isCustomizerExpanded ? '▲ SPECS' : '▼ SPECS'}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#162136] text-slate-300 border border-[#23334e]">
                                    {tool.hotkey}
                                  </span>
                                </div>

                              </div>

                            );

                          })}

                        </div>

                      </div>

                    ))

                  )}

                </div>

              </div>

            )}

            {/* TAB 2: Entity & Tool Inspector */}

            {panelTab === 'inspector' && (

              <div className="flex-1 overflow-y-auto studio-scrollbar p-3 space-y-3 min-h-0">

                {selectedItemDetails ? (

                  /* STATE A: Selected Canvas Element Inspector */

                  <div className="space-y-3">

                    {/* Header Card */}

                    <div className="p-3 rounded-lg bg-[#0e1424] border border-[#1e2a40] space-y-2">

                      <div className="flex items-center justify-between">

                        <span className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-[#141d2e] border border-[#23334d] text-[#38bdf8]">

                          {selectedItemDetails.badge}

                        </span>

                        <span className="text-[10px] text-[#10b981] font-semibold flex items-center gap-1">

                          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" />

                          {selectedItemDetails.status}

                        </span>

                      </div>

                      <div className="flex items-center gap-2.5 pt-1">

                        <div

                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"

                          style={{

                            backgroundColor: `${selectedItemDetails.color}20`,

                            color: selectedItemDetails.color,

                            border: `1px solid ${selectedItemDetails.color}40`,

                          }}

                        >

                          <span className="material-symbols-outlined text-[18px]">

                            {selectedItemDetails.icon}

                          </span>

                        </div>

                        <div className="min-w-0 flex-1">

                          <div className="text-[13px] font-bold text-white truncate">

                            {selectedItemDetails.title}

                          </div>

                          <div className="text-[10px] text-[#64748b] font-mono">

                            Type: {selectedItem.type.toUpperCase()}

                          </div>

                        </div>

                      </div>

                    </div>

                    {/* Spatial Geometry Matrix */}

                    <div className="p-2.5 rounded-lg bg-[#0c121e] border border-[#172133] space-y-1.5">

                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] flex items-center gap-1">

                        <span className="material-symbols-outlined text-[13px] text-[#38bdf8]">

                          straighten

                        </span>

                        <span>Spatial Coordinates & Bounds</span>

                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-xs">

                        <div className="p-1.5 rounded bg-[#131b2c] border border-[#1b263b]">

                          <span className="text-[9px] text-[#64748b] block font-mono">X POSITION</span>

                          <span className="font-semibold text-white">{Math.round(selectedItemDetails.x)} px</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#131b2c] border border-[#1b263b]">

                          <span className="text-[9px] text-[#64748b] block font-mono">Y POSITION</span>

                          <span className="font-semibold text-white">{Math.round(selectedItemDetails.y)} px</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#131b2c] border border-[#1b263b]">

                          <span className="text-[9px] text-[#64748b] block font-mono">WIDTH / EXTENT</span>

                          <span className="font-semibold text-white">{Math.round(selectedItemDetails.w)} px</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#131b2c] border border-[#1b263b]">

                          <span className="text-[9px] text-[#64748b] block font-mono">HEIGHT / EXTENT</span>

                          <span className="font-semibold text-white">{Math.round(selectedItemDetails.h)} px</span>

                        </div>

                      </div>

                    </div>

                    {/* Rotation & Orientation Controls */}

                    <div className="p-2.5 rounded-lg bg-[#0c121e] border border-[#172133] space-y-2">

                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">

                        <span className="flex items-center gap-1">

                          <span className="material-symbols-outlined text-[13px] text-[#38bdf8]">rotate_right</span>

                          <span>Orientation Angle</span>

                        </span>

                        <span className="text-white font-mono">{selectedItemDetails.rotation || 0}°</span>

                      </div>

                      <div className="flex items-center gap-1.5">

                        <button

                          onClick={() => handleRotate(-45)}

                          className="flex-1 py-1 px-2 rounded bg-[#131d2e] hover:bg-[#1a273e] text-xs font-semibold text-[#cbd5e1] border border-[#202f48] flex items-center justify-center gap-1 transition-colors"

                        >

                          <span className="material-symbols-outlined text-[14px]">rotate_left</span>

                          <span>-45°</span>

                        </button>

                        <button

                          onClick={() => handleRotate(45)}

                          className="flex-1 py-1 px-2 rounded bg-[#131d2e] hover:bg-[#1a273e] text-xs font-semibold text-[#cbd5e1] border border-[#202f48] flex items-center justify-center gap-1 transition-colors"

                        >

                          <span className="material-symbols-outlined text-[14px]">rotate_right</span>

                          <span>+45°</span>

                        </button>

                        <button

                          onClick={() => handleRotate(90)}

                          className="py-1 px-2.5 rounded bg-[#1a273e] hover:bg-[#233554] text-xs font-semibold text-[#38bdf8] border border-[#273a5a] transition-colors"

                          title="Rotate 90 degrees"

                        >

                          90°

                        </button>

                      </div>

                    </div>

                    {/* Architectural Model & Variation Customizer for Placed Entity */}

                    {['wall', 'door', 'zone', 'furniture'].includes(selectedItem.type) && (

                      <div className="p-2.5 rounded-lg bg-[#0c121e] border border-[#172133] space-y-2">

                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">

                          <span className="flex items-center gap-1">

                            <span className="material-symbols-outlined text-[13px] text-[#38bdf8]">style</span>

                            <span>Model Variation</span>

                          </span>

                          <span className="font-mono text-[#38bdf8] text-[9.5px]">

                            {(ACOUSTIC_VARIATIONS[selectedItem.type] || FURNITURE_VARIATIONS[selectedItemDetails.furnitureType])?.find((m) => m.id === selectedItemDetails.variation)?.shortName}

                          </span>

                        </div>

                        {/* Model Switcher Buttons */}

                        <div className="grid grid-cols-1 gap-1">

                          {(ACOUSTIC_VARIATIONS[selectedItem.type] || FURNITURE_VARIATIONS[selectedItemDetails.furnitureType])?.map((m) => {

                            const isCur = selectedItemDetails.variation === m.id;

                            return (

                              <button

                                key={m.id}

                                onClick={() => {

                                  updateSelectedEntity({

                                    variation: m.id,

                                    color: m.defaultColor || selectedItemDetails.color,

                                    ...(m.defaultThickness ? { thickness: m.defaultThickness } : {}),

                                    ...(m.defaultWidth && selectedItem.type === 'door' ? { w: m.defaultWidth } : {}),

                                  });

                                }}

                                className={`px-2 py-1.5 rounded text-left border flex items-center justify-between text-xs transition-colors ${

                                  isCur

                                    ? 'bg-[#152238] border-[#38bdf8] text-white font-semibold'

                                    : 'bg-[#101726] border-[#1a2538] text-[#818ea3] hover:text-white'

                                }`}

                              >

                                <span className="flex items-center gap-1.5 truncate">

                                  <span className="material-symbols-outlined text-[14px] text-[#38bdf8]">{m.icon}</span>

                                  <span>{m.shortName}</span>

                                </span>

                                <span className="text-[8.5px] font-mono text-[#38bdf8]">{m.badge}</span>

                              </button>

                            );

                          })}

                        </div>

                        {/* Color Swatches for Placed Entity */}

                        <div className="pt-1.5 border-t border-[#172133] space-y-1">

                          <span className="text-[9.5px] font-semibold text-[#818ea3] block uppercase tracking-wider">

                            Material Color

                          </span>

                          <div className="flex items-center gap-2">

                            {(selectedItem.type === 'wall'

                              ? [

                                  { name: 'Slate Concrete', hex: '#2c3050' },

                                  { name: 'Obsidian Black', hex: '#1e293b' },

                                  { name: 'Slatted Timber', hex: '#854d0e' },

                                  { name: 'Frosted Glass', hex: '#0284c7' },

                                  { name: 'Studio White', hex: '#cbd5e1' },

                                ]

                              : selectedItem.type === 'door'

                              ? [

                                  { name: 'Rich Walnut', hex: '#78350f' },

                                  { name: 'Executive Oak', hex: '#a16207' },

                                  { name: 'Anodized Slate', hex: '#334155' },

                                  { name: 'Frosted Glass', hex: '#0284c7' },

                                  { name: 'Matte Black', hex: '#18181b' },

                                ]

                              : selectedItem.type === 'furniture'
                              ? (FURNITURE_VARIATIONS[selectedItemDetails.furnitureType]?.find((m) => m.id === selectedItemDetails.variation)?.availableColors || [
                                  { name: 'Warm Walnut', hex: '#78350f' },
                                  { name: 'Deep Oak', hex: '#854d0e' },
                                  { name: 'Studio Slate', hex: '#334155' },
                                  { name: 'Nordic Bleached', hex: '#cbd5e1' },
                                  { name: 'Obsidian Black', hex: '#1e293b' },
                                ])

                              : [

                                  { name: 'Focus Emerald', hex: '#10b981' },

                                  { name: 'Suite Cyan', hex: '#0284c7' },

                                  { name: 'Vault Indigo', hex: '#6366f1' },

                                  { name: 'Studio Amber', hex: '#f59e0b' },

                                ]

                            ).map((swatch) => (

                              <button

                                key={swatch.hex}

                                onClick={() => updateSelectedEntity({ color: swatch.hex })}

                                title={swatch.name}

                                className={`w-5 h-5 rounded-full border-2 transition-transform ${

                                  selectedItemDetails.color === swatch.hex

                                    ? 'border-[#38bdf8] scale-110 shadow-[0_0_6px_#38bdf8]'

                                    : 'border-transparent hover:scale-105'

                                }`}

                                style={{ backgroundColor: swatch.hex }}

                              />

                            ))}

                          </div>

                        </div>

                      </div>

                    )}

                    {/* ProxiSpeak Acoustic Audio Profile */}

                    <div className="p-2.5 rounded-lg bg-[#0c121e] border border-[#172133] space-y-1">

                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] flex items-center gap-1">

                        <span className="material-symbols-outlined text-[13px] text-[#10b981]">

                          graphic_eq

                        </span>

                        <span>ProxiSpeak Acoustic Profile</span>

                      </div>

                      <p className="text-[11px] text-[#cbd5e1] leading-relaxed">

                        {selectedItemDetails.acoustic}

                      </p>

                    </div>

                    {/* Entity Actions */}

                    <div className="space-y-1.5 pt-1">

                      <button

                        onClick={handleDuplicateSelected}

                        className="w-full py-1.5 px-2.5 rounded-md bg-[#131d2e] hover:bg-[#1a273e] border border-[#202f48] text-[#38bdf8] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"

                      >

                        <span className="material-symbols-outlined text-[15px]">content_copy</span>

                        <span>Duplicate Element (Ctrl+D)</span>

                      </button>

                      <button

                        onClick={() => {

                          if (selectedItem.type === 'wall') {

                            setWalls((prev) => prev.filter((_, idx) => idx !== selectedItem.index));

                          } else if (selectedItem.type === 'door') {

                            setDoors((prev) => prev.filter((_, idx) => idx !== selectedItem.index));

                          } else if (selectedItem.type === 'furniture') {

                            setFurniture((prev) => prev.filter((_, idx) => idx !== selectedItem.index));

                          } else if (selectedItem.type === 'zone') {

                            setSoundZones((prev) => prev.filter((_, idx) => idx !== selectedItem.index));

                          }

                          setSelectedItem(null);

                        }}

                        className="w-full py-1.5 px-2.5 rounded-md bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 text-red-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"

                      >

                        <span className="material-symbols-outlined text-[15px]">delete</span>

                        <span>Delete Selected (Del)</span>

                      </button>

                      <button

                        onClick={() => setSelectedItem(null)}

                        className="w-full py-1 px-2.5 rounded-md bg-[#121927] hover:bg-[#182338] border border-[#1b263b] text-[#94a3b8] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"

                      >

                        <span className="material-symbols-outlined text-[15px]">close</span>

                        <span>Deselect (Esc)</span>

                      </button>

                    </div>

                  </div>

                ) : (

                  /* STATE B: Armed Tool Overview & Architecture Guide */

                  <div className="space-y-3">

                    {/* Active Armed Tool Overview Card */}

                    <div className="p-3 rounded-lg bg-[#0e1424] border border-[#1e2a40] space-y-2">

                      <div className="flex items-center justify-between">

                        <span className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-[#141d2e] border border-[#23334d] text-[#38bdf8]">

                          ARMED DRAWING TOOL

                        </span>

                        <span className="text-[10px] text-[#38bdf8] font-mono font-semibold">

                          [{armedToolDetails.hotkey}]

                        </span>

                      </div>

                      <div className="flex items-center gap-2.5 pt-1">

                        <div

                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"

                          style={{

                            backgroundColor: `${armedToolDetails.color}20`,

                            color: armedToolDetails.color,

                            border: `1px solid ${armedToolDetails.color}40`,

                          }}

                        >

                          <span className="material-symbols-outlined text-[18px]">

                            {armedToolDetails.icon}

                          </span>

                        </div>

                        <div className="min-w-0 flex-1">

                          <div className="text-[13px] font-bold text-white truncate">

                            {armedToolDetails.label}

                          </div>

                          <div className="text-[10px] text-[#94a3b8]">

                            {armedToolDetails.badge}

                          </div>

                        </div>

                      </div>

                      <p className="text-[11px] text-[#cbd5e1] leading-relaxed pt-1">

                        {armedToolDetails.description}

                      </p>

                    </div>

                    {/* Armed Tool Rotation Controls */}

                    <div className="p-2.5 rounded-lg bg-[#0c121e] border border-[#172133] space-y-2">

                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#94a3b8]">

                        <span className="flex items-center gap-1">

                          <span className="material-symbols-outlined text-[13px] text-[#38bdf8]">rotate_right</span>

                          <span>Deployment Angle</span>

                        </span>

                        <span className="text-[#38bdf8] font-mono font-bold text-xs">{rotationAngle}°</span>

                      </div>

                      <div className="grid grid-cols-4 gap-1">

                        {[0, 90, 180, 270].map((deg) => (

                          <button

                            key={deg}

                            onClick={() => setRotationAngle(deg)}

                            className={`py-1 text-xs rounded font-mono font-semibold transition-all border ${

                              rotationAngle === deg

                                ? 'bg-[#0284c7]/20 text-[#38bdf8] border-[#0284c7]/60'

                                : 'bg-[#131b2c] text-[#64748b] border-[#1b263b] hover:text-white'

                            }`}

                          >

                            {deg}°

                          </button>

                        ))}

                      </div>

                      <div className="text-[10px] text-[#64748b] flex items-center gap-1 pt-0.5">

                        <span className="material-symbols-outlined text-[12px] text-[#38bdf8]">mouse</span>

                        <span>Tip: Scroll mouse wheel on canvas to rotate 45°</span>

                      </div>

                    </div>

                    {/* How to Plot & Use */}

                    <div className="p-2.5 rounded-lg bg-[#0c121e] border border-[#172133] space-y-1.5 text-xs text-[#94a3b8]">

                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#38bdf8] flex items-center gap-1">

                        <span className="material-symbols-outlined text-[13px]">info</span>

                        <span>Live Placement Controls</span>

                      </div>

                      <ul className="text-[10.5px] space-y-1 list-disc list-inside text-slate-400">

                        <li><strong>Hover Canvas:</strong> View live translucent ghost preview.</li>

                        <li><strong>Scroll Wheel / [R]:</strong> Rotate preview angle in real-time.</li>

                        <li><strong>Left Click:</strong> Deploy component at preview position.</li>

                        <li><strong>Switch to [V]:</strong> Drag and select existing objects.</li>

                      </ul>

                    </div>

                    {/* Floor Blueprint Telemetry */}

                    <div className="p-2.5 rounded-lg bg-[#0c121e] border border-[#172133] space-y-2">

                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#94a3b8] flex items-center gap-1">

                        <span className="material-symbols-outlined text-[13px] text-[#38bdf8]">

                          analytics

                        </span>

                        <span>Office Floor Blueprint Stats</span>

                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-xs">

                        <div className="p-1.5 rounded bg-[#131b2c] border border-[#1b263b]">

                          <span className="text-[9px] text-[#64748b] block font-mono">WALLS</span>

                          <span className="font-semibold text-white">{walls.length} partitions</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#131b2c] border border-[#1b263b]">

                          <span className="text-[9px] text-[#64748b] block font-mono">DOORS</span>

                          <span className="font-semibold text-white">{doors.length} entries</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#131b2c] border border-[#1b263b]">

                          <span className="text-[9px] text-[#64748b] block font-mono">FURNITURE</span>

                          <span className="font-semibold text-white">{furniture.length} objects</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#131b2c] border border-[#1b263b]">

                          <span className="text-[9px] text-[#64748b] block font-mono">SOUND ZONES</span>

                          <span className="font-semibold text-white">{soundZones.length} zones</span>

                        </div>

                      </div>

                    </div>

                  </div>

                )}

              </div>

            )}

            {/* TAB 3: Floor Templates */}

            {panelTab === 'presets' && (

              <div className="flex-1 overflow-y-auto studio-scrollbar p-3 space-y-2 min-h-0">

                <div className="text-[11px] text-[#94a3b8] pb-1">

                  Load ready-made architectural layouts:

                </div>

                {PRESETS.map((preset) => (

                  <div

                    key={preset.id}

                    onClick={() => handleLoadPreset(preset.id)}

                    className="p-2.5 rounded-lg bg-[#0e1424] border border-[#1a2336] hover:border-[#38bdf8]/50 hover:bg-[#131b2e] cursor-pointer transition-all space-y-1 group"

                  >

                    <div className="flex items-center justify-between">

                      <span className="text-xs font-bold text-white group-hover:text-[#38bdf8] transition-colors">

                        {preset.name}

                      </span>

                      <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-full border ${preset.tagColor}`}>

                        {preset.badge}

                      </span>

                    </div>

                    <p className="text-[10.5px] text-[#818ea3] leading-snug">

                      {preset.description}

                    </p>

                  </div>

                ))}

              </div>

            )}

            {/* Drawer Bottom Status Pill */}

            <div className="p-2 border-t border-[#171f2e] bg-[#090d16] shrink-0 text-[10px] text-[#64748b] flex items-center justify-between">

              <span>Tool: <strong className="text-white font-mono uppercase">{activeTool}</strong></span>

              <span className="font-mono text-[#818ea3]">Angle: {rotationAngle}° · [R] Rotate</span>

            </div>

          </div>

        </div>

        {/* Dynamic Studio Canvas Viewport (Automatically takes remaining space) */}

        <main ref={containerRef} className="flex-1 h-full relative overflow-hidden bg-[#070b12] min-w-0">

          {/* Toast Notification */}

          {saveToast && (

            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-[#0f172a] border border-[#23334d] text-white text-xs font-medium shadow-2xl flex items-center gap-2.5">

              <span className="material-symbols-outlined text-[#10b981] text-[16px]">

                check_circle

              </span>

              <span>{saveToast.msg}</span>

              {onLaunchOffice && saveToast.layout && (

                <button

                  onClick={() => {

                    onLaunchOffice({

                      roomId: saveToast.layout.layoutId || `custom-${Date.now()}`,

                      name: saveToast.layout.name || officeName,

                      theme: 'office',

                      layout: saveToast.layout,

                    });

                  }}

                  className="ml-1.5 px-2 py-0.5 rounded bg-[#2563eb] hover:bg-[#1d4ed8] text-[11px] font-bold text-white transition-colors"

                >

                  Enter Office

                </button>

              )}

            </div>

          )}

          {/* Live Collision Warning Alert */}
          {collisionAlert && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-red-950/92 border border-red-500/60 text-red-200 text-xs font-semibold shadow-2xl backdrop-blur pointer-events-none animate-in fade-in zoom-in-95 duration-150">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
              <span>{collisionAlert.message}</span>
            </div>
          )}

          {/* Canvas Tag: sized reactively with pointer and wheel listeners */}

          <canvas

            ref={canvasRef}

            width={canvasSize.width}

            height={canvasSize.height}

            onPointerDown={handlePointerDown}

            onPointerMove={handlePointerMove}

            onPointerUp={handlePointerUp}

            onPointerLeave={handlePointerLeave}

            onWheel={handleWheel}

            className={`w-full h-full block ${canvasCursor}`}

          />

          {/* Bottom Floating Helper Bar with Rotation HUD */}

          <footer className="absolute bottom-2.5 left-1/2 -translate-x-1/2 px-3.5 py-1 rounded-full bg-[#0a0f1c]/85 backdrop-blur-md border border-[#172133] text-[10.5px] text-[#818ea3] flex items-center gap-3 z-10 shadow-lg pointer-events-none">

            <span className="flex items-center gap-1">

              <span className="material-symbols-outlined text-[13px] text-[#38bdf8]">mouse</span>

              <span>Click to place</span>

            </span>

            <span>•</span>

            <span className="flex items-center gap-1 text-[#38bdf8] font-medium">

              <span className="material-symbols-outlined text-[13px]">rotate_right</span>

              <span>Wheel / [R]: Rotate ({rotationAngle}°)</span>

            </span>

            <span>•</span>

            <span className="flex items-center gap-1">

              <span className="material-symbols-outlined text-[13px] text-[#38bdf8]">pan_tool</span>

              <span>Shift + Drag to pan</span>

            </span>

            <span>•</span>

            <span>Del to remove</span>

            <span>•</span>

            <span className="font-mono text-[#64748b]">World: 2200x1300</span>

          </footer>

        </main>

      </div>

    </div>

  );

}

