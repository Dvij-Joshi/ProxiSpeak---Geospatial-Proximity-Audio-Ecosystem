import { useState, useRef, useEffect, useCallback, useMemo } from 'react';

import { SERVER_URL } from '../config';

import { ACOUSTIC_VARIATIONS, FURNITURE_VARIATIONS } from './modelCatalog';
import { layoutWallSegments, toSceneModel, toSceneZone } from './layoutModels';
import { drawFloor, drawModel, drawSpawn, drawZone } from '../world/models';

import {
  checkPlacementCollision,
  getWallExpansionArrows,
  drawExpansionArrow,
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

function makePlacement(tool, config, x, y, rotation) {
  const vertical = rotation === 90 || rotation === 270;
  const { color, variation } = config;
  if (tool === 'wall' || tool === 'door') {
    const length = config.length || config.width;
    const thickness = config.thickness || 8;
    const w = vertical ? thickness : length;
    const h = vertical ? length : thickness;
    const model = { type: tool, x: x - w / 2, y: y - h / 2, w, h, rotation, variation, color };
    if (tool === 'wall') return { ...model, thickness };
    const name = ACOUSTIC_VARIATIONS.door.find(d => d.id === variation)?.shortName || 'Door';
    return { ...model, name, isIsolated: true };
  }
  if (tool === 'zone') {
    const w = vertical ? config.height : config.width;
    const h = vertical ? config.width : config.height;
    return { type: tool, bounds: { x1: x - w/2, x2: x + w/2, y1: y - h/2, y2: y + h/2 },
      variation, color, name: config.name, maxDistance: config.maxDistance, rotation, isIsolated: true };
  }
  if (tool === 'spawn') return { type: tool, x, y, variation, color };
  const name = FURNITURE_VARIATIONS[tool]?.find(item => item.id === variation)?.shortName;
  if (tool === 'plant') {
    const size = variation === 'planter_partition_box' ? {w: config.w || 140, h: config.h || 36} : {r: config.r};
    return { type: tool, furnitureType: tool, name, x, y, ...size, variation, rotation, color };
  }
  return { type: ['desk', 'conf_table'].includes(tool) ? 'rect' : tool,
    furnitureType: tool, name, x: x - config.w / 2, y: y - config.h / 2, w: config.w, h: config.h,
    seats: config.seats, variation, rotation, color };
}

function containsPoint(model, x, y) {
  const dx = x - model.x - model.w / 2, dy = y - model.y - model.h / 2;
  const angle = (model.rotation || 0) * Math.PI / 180;
  return Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle)) <= model.w / 2 + 3 &&
    Math.abs(dy * Math.cos(angle) - dx * Math.sin(angle)) <= model.h / 2 + 3;
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

  // Active placement tool settings

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

      maxDistance: 850,

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

  const [isSaving, setIsSaving] = useState(false);

  const [saveToast, setSaveToast] = useState(null);

  // Live cursor position for ghost preview

  const [cursorPos, setCursorPos] = useState({ wx: 0, wy: 0, snX: 0, snY: 0, isOver: false });

  // Sliding panel state

  const [isPanelOpen, setIsPanelOpen] = useState(() => window.innerWidth >= 768);
  const [isCustomizerExpanded, setIsCustomizerExpanded] = useState(true);
  const [hoveredExpansionArrow, setHoveredExpansionArrow] = useState(null);
  const [collisionAlert, setCollisionAlert] = useState(null);

  const [panelTab, setPanelTab] = useState('catalog'); // 'catalog' | 'inspector' | 'presets'

  const [searchQuery, setSearchQuery] = useState('');

  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'acoustics' | 'workspace' | 'decor'

  // Canvas viewport container and reactive sizing

  const containerRef = useRef(null);

  const canvasRef = useRef(null);
  const handleWheelRef = useRef(null);

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

    },

  ]);

  const [furniture, setFurniture] = useState(initialLayout?.furniture || [
    { type:'conf_table', variation:'racetrack_oval', name:'Boardroom table', x:140,y:160,w:300,h:160,seats:8 },
    { type:'screen',x:290,y:90,w:112,h:18 },
    { type:'plant',x:540,y:88,r:18 },
    ...[720,1320].flatMap(x=>[
      {type:'desk',variation:'dual_bench',name:'Studio desk',x,y:580,w:160,h:60},
      {type:'chair',x:x+40,y:672,rotation:180}, {type:'chair',x:x+120,y:672,rotation:180}
    ])
  ]);

  const [soundZones, setSoundZones] = useState(initialLayout?.soundZones || [

    {

      id: 'meeting-room',

      name: 'Meeting Room',

      bounds: { x1: 18, y1: 18, x2: 606, y2: 506 },

      isIsolated: true,

      maxDistance: 850,

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

    // Non-passive wheel event listener to avoid 'Unable to preventDefault inside passive event listener invocation'
    const canvas = canvasRef.current;
    const onWheelNonPassive = (e) => {
      handleWheelRef.current?.(e);
    };
    if (canvas) {
      canvas.addEventListener('wheel', onWheelNonPassive, { passive: false });
    }

    return () => {
      ro.disconnect();
      if (canvas) {
        canvas.removeEventListener('wheel', onWheelNonPassive);
      }
    };

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

        { x: 1870, y: 378, w: WORLD_W - 18 - 1870, h: 8, rotation: 0 },

      ]);

      setDoors([

        { key: 'pod-a', name: 'Focus Pod A', x: 338, y: 378, w: 90, h: 8, rotation: 0, isIsolated: true },

        { key: 'pod-b', name: 'Focus Pod B', x: 1780, y: 378, w: 90, h: 8, rotation: 0, isIsolated: true },

      ]);

      setSoundZones([

        { id: 'pod-a', name: 'Focus Pod A', bounds: { x1: 18, y1: 18, x2: 428, y2: 386 }, isIsolated: true, maxDistance: 600, rotation: 0 },

        { id: 'pod-b', name: 'Focus Pod B', bounds: { x1: 1780, y1: 18, x2: WORLD_W - 18, y2: 386 }, isIsolated: true, maxDistance: 600, rotation: 0 },

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
        { type: 'furniture', furnitureType: 'plant', variation: 'ficus_lyrata', name: 'Fiddle-leaf fig', x: 1260, y: 240, r: 20, color: '#22c55e' },
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

        { key: 'boardroom', name: 'Executive Boardroom', x: 1030, y: 538, w: 140, h: 8, rotation: 0, isIsolated: true },

      ]);

      setSoundZones([

        { id: 'boardroom', name: 'Boardroom Sanctuary', bounds: { x1: 658, y1: 18, x2: 1542, y2: 538 }, isIsolated: true, maxDistance: 1000, rotation: 0 },

      ]);

      setFurniture([
        // Large executive table (architectural 12-seat table with integrated chairs)
        { type: 'furniture', furnitureType: 'conf_table', variation: 'rectangular_executive', name: 'Grand Boardroom Table', x: 880, y: 180, w: 420, h: 160, color: '#78350f', seats: 12, rotation: 0 },
        // Server infrastructure (architectural IT server racks)
        { type: 'furniture', furnitureType: 'server_rack', variation: 'enterprise_rack', name: 'Mainframe Rack 01', x: 70, y: 70, w: 75, h: 120, color: '#0f172a', rotation: 0 },
        { type: 'furniture', furnitureType: 'server_rack', variation: 'enterprise_rack', name: 'Mainframe Rack 02', x: 160, y: 70, w: 75, h: 120, color: '#0f172a', rotation: 0 },
        // Greenery (architectural biophilic plants)
        { type: 'furniture', furnitureType: 'plant', variation: 'monstera_deliciosa', name: 'Boardroom Plant L', x: 690, y: 70, r: 22, color: '#22c55e' },
        { type: 'furniture', furnitureType: 'plant', variation: 'ficus_lyrata', name: 'Boardroom Plant R', x: 1510, y: 70, r: 22, color: '#22c55e' },
        // Reception & Desk Pod (architectural executive desk with integrated chair and monitor)
        { type: 'furniture', furnitureType: 'desk', variation: 'executive_l_desk', name: 'Reception Pod', x: 950, y: 790, w: 260, h: 90, color: '#334155', rotation: 0 },
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

  const sceneObjects = useMemo(() => [
    ...layoutWallSegments(walls, doors).map(model => ({ type: 'wall', index: model.index, model })),
    ...furniture.map((item, index) => ({ type: 'furniture', index, model: toSceneModel(item) })),
    ...doors.map((item, index) => ({ type: 'door', index, model: toSceneModel(item, 'door') })),
  ].sort((a,b) => (a.model.y + a.model.h) - (b.model.y + b.model.h)), [walls, doors, furniture]);

  const ground = useMemo(() => {
    const surface = document.createElement('canvas');
    surface.width = WORLD_W;
    surface.height = WORLD_H;
    const ctx = surface.getContext('2d');
    drawFloor(ctx, WORLD_W, WORLD_H);
    soundZones.forEach((zone, index) => drawZone(ctx, toSceneZone(zone), {
      selected: selectedItem?.type === 'zone' && selectedItem.index === index,
    }));
    return surface;
  }, [soundZones, selectedItem]);

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

    ctx.drawImage(ground,0,0);
    drawSpawn(ctx, spawnPoint, { selected: selectedItem?.type === 'spawn' });
    for (const { model, type, index } of sceneObjects) {
      drawModel(ctx, model, { selected: selectedItem?.type === type && selectedItem.index === index });
    }

    // Keep wall extension handles above all scene objects.
    if (selectedItem?.type === 'wall' && (activeTool === 'select' || activeTool === 'wall')) {
      const selWall = walls[selectedItem.index];
      if (selWall) {
        const arrows = getWallExpansionArrows(selWall, walls, WORLD_W, WORLD_H);
        for (let aIdx = 0; aIdx < arrows.length; aIdx++) {
          const arrow = arrows[aIdx];
          const isHov = hoveredExpansionArrow?.id === arrow.id;
          if (isHov) {
            drawModel(ctx, toSceneModel(arrow.targetWall, 'wall'), { ghost: true });
          }
          drawExpansionArrow(ctx, arrow, isHov, zoom);
        }
      }
    }

    if (cursorPos.isOver && activeTool !== 'select') {

      const gcx = cursorPos.snX;

      const gcy = cursorPos.snY;

      const candidate = makePlacement(activeTool, toolCustomization[activeTool], gcx, gcy, rotationAngle);
      const ghostCollision = checkPlacementCollision(candidate, { walls, doors, furniture, spawnPoint });
      ctx.save();
      if (activeTool === 'zone' || activeTool === 'spawn') {
        ctx.globalAlpha = 0.65;
        if (activeTool === 'zone') drawZone(ctx, toSceneZone(candidate));
        else drawSpawn(ctx, candidate);
      } else {
        drawModel(ctx, toSceneModel(candidate, activeTool === 'wall' || activeTool === 'door' ? activeTool : 'furniture'), { ghost: true });
      }
      ctx.restore();

      // Floating Live HUD Angle Pill & Placement Collision Status
      ctx.save();

      const pillX = gcx + 24;
      const pillY = gcy - 28;
      const isBlocked = ghostCollision.isCollision;
      const label = isBlocked ? `BLOCKED / ${ghostCollision.collidingType}` : `${rotationAngle}?  /  R to rotate`;
      ctx.font = 'bold 10px monospace';
      const pillW = ctx.measureText(label).width + 16;

      ctx.fillStyle = isBlocked ? '#963b32' : '#20373b';
      ctx.fillRect(pillX, pillY - 14, pillW, 22);
      ctx.strokeStyle = '#15292e';
      ctx.strokeRect(pillX, pillY - 14, pillW, 22);
      ctx.fillStyle = '#fff2d7';
      ctx.textAlign = 'left';
      ctx.fillText(label, pillX + 8, pillY + 1);
      ctx.restore();

    }

    ctx.restore();

  }, [walls, doors, furniture, soundZones, spawnPoint, selectedItem, camera, zoom, canvasSize, cursorPos, activeTool, rotationAngle, hoveredExpansionArrow, sceneObjects, toolCustomization, ground]);

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


        setIsDragging(true);
        dragStartRef.current = { x: snX - spawnPoint.x, y: snY - spawnPoint.y };

        return;

      }

      for (let i = sceneObjects.length - 1; i >= 0; i--) {
        const { type, index, model } = sceneObjects[i];
        if (!containsPoint(model, wx, wy)) continue;
        const item = (type === 'wall' ? walls : type === 'door' ? doors : furniture)[index];
        setSelectedItem({ type, index });
        isDraggingRef.current = true;
        setIsDragging(true);
        dragStartRef.current = { x: snX - item.x, y: snY - item.y };
        return;
      }

      // Check sound zones

      for (let i = soundZones.length - 1; i >= 0; i--) {

        const z = soundZones[i];

        if (wx >= z.bounds.x1 && wx <= z.bounds.x2 && wy >= z.bounds.y1 && wy <= z.bounds.y2) {

          setSelectedItem({ type: 'zone', index: i });

          isDraggingRef.current = true;


          setIsDragging(true);
          dragStartRef.current = { x: snX - z.bounds.x1, y: snY - z.bounds.y1 };

          return;

        }

      }

      setSelectedItem(null);
      if (e.pointerType === 'touch') {
        isPanningRef.current = true;
        setIsPanning(true);
        panStartRef.current = { x: e.clientX, y: e.clientY };
      }

    } else {
      const item = makePlacement(activeTool, toolCustomization[activeTool], snX, snY, rotationAngle);
      const check = checkPlacementCollision(item, { walls, doors, furniture, spawnPoint });
      if (check.isCollision) {
        setCollisionAlert({ message: check.reason });
        setTimeout(() => setCollisionAlert(null), 2500);
        return;
      }
      if (activeTool === 'spawn') {
        setSpawnPoint(item);
        setSelectedItem({ type: 'spawn', index: 0 });
      } else if (activeTool === 'zone') {
        setSoundZones([...soundZones, { ...item, id: `zone-${Date.now().toString(36)}` }]);
        setSelectedItem({ type: 'zone', index: soundZones.length });
      } else if (activeTool === 'door') {
        setDoors([...doors, { ...item, key: `door-${Date.now().toString(36)}` }]);
        setSelectedItem({ type: 'door', index: doors.length });
      } else if (activeTool === 'wall') {
        setWalls([...walls, item]);
        setSelectedItem({ type: 'wall', index: walls.length });
      } else {
        setFurniture([...furniture, item]);
        setSelectedItem({ type: 'furniture', index: furniture.length });
      }
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

    if (selectedItem.type !== 'zone') {
      const {type, index} = selectedItem;
      const source = type === 'spawn' ? spawnPoint : (type === 'wall' ? walls : type === 'door' ? doors : furniture)[index];
      const candidate = { ...source, type: type === 'furniture' ? source.type : type, x: dragSnX, y: dragSnY };
      const check = checkPlacementCollision(candidate, { walls, doors, furniture, spawnPoint }, { ignoreType: type, ignoreIndex: index });
      if (check.isCollision) return;
    }

    if (selectedItem.type === 'spawn') {

      setSpawnPoint({ ...spawnPoint, x: dragSnX, y: dragSnY });

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

          next[selectedItem.index] = { ...d, x: dragSnX, y: dragSnY };

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

  handleWheelRef.current = handleWheel;

  const collections = {
    wall:[walls,setWalls], door:[doors,setDoors], zone:[soundZones,setSoundZones],
    furniture:[furniture,setFurniture]
  };

  function placementError(reason) {
    setCollisionAlert({message:reason});
    setTimeout(() => setCollisionAlert(null),2500);
  }

  function updateSelectedEntity(updates) {
    if (!selectedItem) return;
    const {type,index} = selectedItem;
    if (type === 'spawn') {
      setSpawnPoint(prev => ({...prev,...updates}));
      return;
    }
    const [items,setItems] = collections[type];
    const item = {...items[index],...updates};
    if (type === 'door' || type === 'wall') item.type = type;
    if (type === 'zone') item.type = 'zone';
    if (Object.keys(updates).some(k=>k!=='color')) {
      const check=checkPlacementCollision(item,{walls,doors,furniture,spawnPoint},{ignoreType:type,ignoreIndex:index});
      if(check.isCollision) return placementError(check.reason);
    }
    setItems(prev => prev.map((current,i)=>i===index ? item : current));
  }

  const handleRotate = (step=45) => {
    if(activeTool !== 'select') return setRotationAngle(prev=>(prev+step+360)%360);
    if(!selectedItem || selectedItem.type==='spawn') return;
    const {type,index}=selectedItem;
    const item=collections[type][0][index];
    if(!item) return;
    const partition=type==='wall'||type==='door';
    const angle=item.rotation || (partition && item.h>item.w ? 90 : 0);
    if(type==='zone') {
      // Acoustic zones use axis-aligned bounds on both client and server.
      const b=item.bounds, dx=(b.y2-b.y1)/2, dy=(b.x2-b.x1)/2;
      const cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2;
      return updateSelectedEntity({rotation:(angle+Math.sign(step)*90+360)%360,
        bounds:{x1:cx-dx,x2:cx+dx,y1:cy-dy,y2:cy+dy}});
    }
    const rotation=(angle+step+360)%360;
    if(!partition) return updateSelectedEntity({rotation});
    const length=Math.max(item.w,item.h), thickness=Math.min(item.w,item.h);
    const vertical=rotation%180===90;
    const w=vertical?thickness:length, h=vertical?length:thickness;
    updateSelectedEntity({rotation,w,h,x:item.x+(item.w-w)/2,y:item.y+(item.h-h)/2});
  };

  function handleDuplicateSelected() {
    if(!selectedItem || selectedItem.type==='spawn') return;
    const {type,index}=selectedItem;
    const [items,setItems]=collections[type];
    const original=items[index];
    if(!original) return;
    // Prefer a nearby vacant grid cell. Keep furniture, spawn and doors clear.
    for(let radius=GRID_SIZE;radius<=WORLD_W;radius+=GRID_SIZE) {
      for(const [dx,dy] of [[radius,radius],[radius,0],[0,radius],[-radius,0],[0,-radius]]) {
        const copy={...original,type:type==='furniture'?original.type:type};
        if(type==='zone') {
          const b=original.bounds;
          copy.bounds={x1:b.x1+dx,x2:b.x2+dx,y1:b.y1+dy,y2:b.y2+dy};
          copy.id='zone-'+Date.now().toString(36);
        } else {
          copy.x+=dx; copy.y+=dy;
          if(type==='door') copy.key='door-'+Date.now().toString(36);
        }
        if(checkPlacementCollision(copy,{walls,doors,furniture,spawnPoint}).isCollision) continue;
        setItems(prev=>[...prev,copy]);
        setSelectedItem({type,index:items.length});
        return;
      }
    }
    placementError('No clear grid position nearby.');
  }

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
    const {type,index}=selectedItem;
    const item=type==='spawn' ? spawnPoint : collections[type][0][index];
    if(!item) return null;
    const kind=type==='furniture' ? (item.furnitureType || item.type) : type;
    const category=kind==='table' || kind==='rect' ? 'conf_table' : kind;
    const options=ACOUSTIC_VARIATIONS[category] || FURNITURE_VARIATIONS[category] || [];
    const variant=options.find(v=>v.id===item.variation) || options[0];
    const model=type==='zone' ? toSceneZone(item) :
      type==='spawn' ? {...item,w:80,h:48} : toSceneModel(item,type);
    const tool=TOOLS.find(t=>t.id===category);
    return {...model,
      title:item.name || variant?.shortName || kind,
      variation:variant?.id, furnitureType:category,
      color:item.color || variant?.defaultColor || '#399c92',
      icon:variant?.icon || tool?.icon || (kind==='chair' ? 'chair' : 'desktop_windows'),
      badge:tool?.label || kind, acoustic:variant?.desc || tool?.description || 'Placed on the studio floor.',
      status:type==='spawn' ? 'Arrival point' : 'Placed on floor'
    };
  }, [selectedItem,walls,doors,furniture,soundZones,spawnPoint]);

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
    if (['desk', 'conf_table', 'sofa', 'server_rack', 'plant', 'chair', 'door', 'spawn'].includes(activeTool)) {
      return 'cursor-grab';
    }
    if (activeTool === 'zone') return 'cursor-crosshair';
    if (selectedItem) return 'cursor-grab';
    return 'cursor-default';
  }, [isDragging, isPanning, hoveredExpansionArrow, activeTool, selectedItem]);

  // Armed Tool Details (for when no object is selected)

  const armedToolDetails = useMemo(() => {

    const t = TOOLS.find((item) => item.id === activeTool) || TOOLS[0];

    return t;

  }, [activeTool]);

  return (

    <div className="flex flex-col h-dvh w-screen bg-[#f4edda] text-[#203334] select-none overflow-hidden font-sans">

      {/* Top Studio Control Header */}

      <header onPointerEnter={() => { setHoveredExpansionArrow(null); setCursorPos((prev) => ({ ...prev, isOver: false })); }} className="h-14 border-b-2 border-[#697c71] bg-[#fff9e9] px-2 md:px-4 flex items-center justify-between z-30 shrink-0 shadow-xs">

        <div className="flex items-center gap-2.5">

          <button

            onClick={onBackToLobby}

            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-[#f4edda] hover:bg-[#e9dfc7] text-xs font-semibold text-[#203334] border border-[#88968a] transition-colors cursor-pointer"

            title="Return to Space Lobby"

          >

            <span className="material-symbols-outlined text-[15px]">arrow_back</span>

            <span className="hidden sm:inline">Back</span>

          </button>

          <div className="h-4 w-[1px] bg-[#a7ab99]" />

          <div className="flex items-center gap-1.5">

            <span className="material-symbols-outlined text-[17px] text-[#418b7e]">architecture</span>

            <input

              type="text"

              value={officeName}

              onChange={(e) => setOfficeName(e.target.value)}

              className="bg-transparent border-b border-transparent hover:border-[#23776e]/50 focus:border-[#23776e] focus:outline-none text-xs font-bold text-[#203334] px-1 py-0.5 rounded transition-all w-24 sm:w-48 lg:w-60"

              placeholder="Custom Office Name"

            />

          </div>

          <span className="hidden lg:inline text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-sm bg-[#f4edda] border border-[#88968a] text-[#4c615b]">

            {organization?.name || 'Workspace HQ'}

          </span>

        </div>

        {/* Center Quick Presets */}

        <div className="hidden md:flex items-center gap-1.5">

          <button

            onClick={() => handleLoadPreset('startup')}

            className="px-3 py-1 text-xs rounded-sm bg-[#e9dfc7] hover:bg-[#ded4b8] text-[#203334] border border-[#88968a] font-medium transition-colors cursor-pointer"

          >

            Startup Loft

          </button>

          <button

            onClick={() => handleLoadPreset('executive')}

            className="px-3 py-1 text-xs rounded-sm bg-[#e9dfc7] hover:bg-[#ded4b8] text-[#203334] border border-[#88968a] font-medium transition-colors cursor-pointer"

          >

            Executive Suite

          </button>

          <button

            onClick={() => handleLoadPreset('clear')}

            className="px-3 py-1 text-xs rounded-sm bg-[#fef2f2] hover:bg-[#fee2e2] text-[#dc2626] border border-[#fecaca] font-medium transition-colors cursor-pointer"

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

                ? 'bg-[#d9eadb] text-[#23776e] border-[#82ab99] font-semibold'

                : 'bg-[#e9dfc7] text-[#4c615b] border-[#88968a]'

            }`}

            aria-label="Toggle grid snapping" title="Toggle 20px Grid Snapping (Hotkey: G)"

          >

            <span className="material-symbols-outlined text-[14px]">grid_4x4</span>

            <span className="hidden sm:inline">Snap {gridSnap ? '20px' : 'Off'}</span>

          </button>

          {/* Quick Rotation Indicator & Selector */}

          <button

            onClick={() => handleRotate(45)}

            className="px-3 py-1 rounded-sm bg-[#e9dfc7] hover:bg-[#ded4b8] text-xs font-semibold text-[#203334] border border-[#88968a] flex items-center gap-1 transition-colors cursor-pointer"

            aria-label="Rotate component" title="Rotate Component (Scroll Wheel / Hotkey: R)"

          >

            <span className="material-symbols-outlined text-[14px]">rotate_right</span>

            <span className="font-mono text-[11px] font-bold">{rotationAngle}°</span>

          </button>

          <button

            onClick={handleSaveLayout}

            disabled={isSaving}

            className="flex items-center gap-1.5 px-4 py-1.5 rounded-sm bg-[#23776e] hover:bg-[#145951] text-white text-xs font-semibold shadow-md shadow-black/20 border-none transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 cursor-pointer"

          >

            <span className="material-symbols-outlined text-[15px]">rocket_launch</span>

            <span>{isSaving ? 'Deploying...' : 'Deploy Office'}</span>

          </button>

        </div>

      </header>

      {/* Main Studio Flex Workspace */}

      <div className="flex-1 flex overflow-hidden relative">

        {/* Left Fixed Rail Bar (56px width, always clickable) */}

        <aside onPointerEnter={() => { setHoveredExpansionArrow(null); setCursorPos((prev) => ({ ...prev, isOver: false })); }} className="w-14 h-full bg-[#f4edda] border-r border-[#a7ab99] flex flex-col items-center py-2 shrink-0 z-20 select-none justify-between">

          {/* Top Rail Section: Toggle Drawer + Mode Switchers */}

          <div className="flex flex-col items-center gap-1.5 w-full">

            {/* Collapse / Expand Toggle Button */}

            <button

              onClick={() => setIsPanelOpen((prev) => !prev)}

              className={`w-9 h-9 rounded-sm flex items-center justify-center transition-all ${

                isPanelOpen

                  ? 'bg-[#fff9e9] text-[#203334] border border-[#88968a] shadow-xs'

                  : 'text-[#4c615b] hover:text-[#203334] hover:bg-[#eadbba]'

              }`}

              title={isPanelOpen ? 'Collapse Studio Drawer (Ctrl+B / [)' : 'Expand Studio Drawer (Ctrl+B / [)'}

            >

              <span className="material-symbols-outlined text-[19px]">

                {isPanelOpen ? 'left_panel_close' : 'left_panel_open'}

              </span>

            </button>

            <div className="w-7 h-[1px] bg-[#a7ab99] my-0.5" />

            {/* Mode 1: Catalog */}

            <button

              onClick={() => {

                setPanelTab('catalog');

                if (!isPanelOpen) setIsPanelOpen(true);

              }}

              className={`w-9 h-9 rounded-sm flex items-center justify-center transition-all ${

                panelTab === 'catalog' && isPanelOpen

                  ? 'bg-[#203334] text-white border border-[#697c71] shadow-xs'

                  : 'text-[#4c615b] hover:text-[#203334] hover:bg-[#eadbba]'

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

              className={`w-9 h-9 rounded-sm flex items-center justify-center relative transition-all ${

                panelTab === 'inspector' && isPanelOpen

                  ? 'bg-[#203334] text-white border border-[#697c71] shadow-xs'

                  : 'text-[#4c615b] hover:text-[#203334] hover:bg-[#eadbba]'

              }`}

              title="Object Inspector"

            >

              <span className="material-symbols-outlined text-[19px]">tune</span>

              {selectedItem && (

                <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-sm animate-pulse shadow-[0_0_6px_#f59e0b]" />

              )}

            </button>

            {/* Mode 3: Presets */}

            <button

              onClick={() => {

                setPanelTab('presets');

                if (!isPanelOpen) setIsPanelOpen(true);

              }}

              className={`w-9 h-9 rounded-sm flex items-center justify-center transition-all ${

                panelTab === 'presets' && isPanelOpen

                  ? 'bg-[#203334] text-white border border-[#697c71] shadow-xs'

                  : 'text-[#4c615b] hover:text-[#203334] hover:bg-[#eadbba]'

              }`}

              title="Floor Presets"

            >

              <span className="material-symbols-outlined text-[19px]">layers</span>

            </button>

          </div>

          {/* Center Quick Tools Stack */}

          <div className="flex flex-col items-center gap-1 w-full my-auto overflow-y-auto no-scrollbar py-1">

            <div className="w-7 h-[1px] bg-[#a7ab99] my-0.5" />

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

                  className={`w-8 h-8 rounded-sm flex items-center justify-center relative transition-all ${

                    isActive

                      ? 'bg-[#203334] text-white border border-[#697c71] shadow-xs'

                      : 'text-[#4c615b] hover:text-[#203334] hover:bg-[#eadbba]'

                  }`}

                  title={`${tool.label} [${tool.hotkey}]`}

                >

                  <span className="material-symbols-outlined text-[17px]">{tool.icon}</span>

                  {isActive && (

                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[#FF4B2B] rounded-r-full" />

                  )}

                </button>

              );

            })}

          </div>

          {/* Bottom Zoom & Reset Utilities */}

          <div className="flex flex-col items-center gap-1 w-full pt-1 border-t border-[#a7ab99]">

            <button

              onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}

              className="w-8 h-8 rounded-sm flex items-center justify-center text-[#4c615b] hover:text-[#203334] hover:bg-[#eadbba] transition-colors"

              title="Zoom In"

            >

              <span className="material-symbols-outlined text-[15px]">add</span>

            </button>

            <span className="text-[9px] font-mono font-bold text-[#64748b]">

              {Math.round(zoom * 100)}%

            </span>

            <button

              onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))}

              className="w-8 h-8 rounded-sm flex items-center justify-center text-[#4c615b] hover:text-[#203334] hover:bg-[#eadbba] transition-colors"

              title="Zoom Out"

            >

              <span className="material-symbols-outlined text-[15px]">remove</span>

            </button>

            <button

              onClick={() => {

                setZoom(0.65);

                setCamera({ x: WORLD_W / 2, y: WORLD_H / 2 });

              }}

              className="w-8 h-8 rounded-sm flex items-center justify-center text-[#4c615b] hover:text-[#23776e] hover:bg-[#eadbba] transition-colors"

              title="Center Canvas"

            >

              <span className="material-symbols-outlined text-[15px]">filter_center_focus</span>

            </button>

          </div>

        </aside>

        {/* Sliding Flyout Drawer (Natural Flex width transition) */}

        <div

          onPointerEnter={() => { setHoveredExpansionArrow(null); setCursorPos((prev) => ({ ...prev, isOver: false })); }}

          className={`absolute left-14 top-0 md:static h-full bg-[#fff9e9] border-r border-[#a7ab99] transition-[width,opacity] duration-300 ease-in-out shrink-0 overflow-hidden z-10 flex flex-col ${


            isPanelOpen ? 'w-[min(20rem,calc(100vw-3.5rem))] opacity-100' : 'w-0 opacity-0 pointer-events-none border-r-0'

          }`}

        >

          {/* Inner 320px fixed wrapper to ensure clean alignment */}

          <div className="w-[min(20rem,calc(100vw-3.5rem))] h-full flex flex-col min-h-0 select-none">

            {/* Drawer Top Navigation Header */}

            <div className="h-12 px-3.5 border-b border-[#a7ab99] flex items-center justify-between shrink-0 bg-[#f4edda]">

              <div className="flex items-center gap-1.5">

                <span className="material-symbols-outlined text-[17px] text-[#418b7e]">

                  {panelTab === 'catalog' ? 'category' : panelTab === 'inspector' ? 'tune' : 'layers'}

                </span>

                <span className="text-[12px] font-bold uppercase tracking-wider text-[#203334]">

                  {panelTab === 'catalog' ? 'Studio Components' : panelTab === 'inspector' ? 'Object Inspector' : 'Floor Templates'}

                </span>

              </div>

              <button

                onClick={() => setIsPanelOpen(false)}

                className="w-6 h-6 rounded flex items-center justify-center text-[#64748b] hover:text-[#203334] hover:bg-[#ded4b8] transition-colors"

                title="Collapse drawer (Hotkey: [)"

              >

                <span className="material-symbols-outlined text-[17px]">chevron_left</span>

              </button>

            </div>

            {/* TAB 1: Components Catalog */}

            {panelTab === 'catalog' && (

              <div className="flex-1 flex flex-col min-h-0">

                {/* Search & Segment Control */}

                <div className="p-3 border-b border-[#a7ab99] space-y-2 shrink-0 bg-[#fff9e9]">

                  <div className="relative">

                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-[#64748b]">

                      search

                    </span>

                    <input

                      type="text"

                      value={searchQuery}

                      onChange={(e) => setSearchQuery(e.target.value)}

                      placeholder="Filter components (e.g. wall, desk)..."

                      className="w-full bg-[#f4edda] border border-[#88968a] focus:border-[#23776e] rounded-sm pl-8 pr-7 py-1.5 text-xs text-[#203334] placeholder-[#8C8880] focus:outline-none transition-colors"

                    />

                    {searchQuery && (

                      <button

                        onClick={() => setSearchQuery('')}

                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#203334]"

                      >

                        <span className="material-symbols-outlined text-[13px]">close</span>

                      </button>

                    )}

                  </div>

                  {/* 4-Segment Clean Category Bar */}

                  <div className="grid grid-cols-4 gap-1 p-1 bg-[#e9dfc7] rounded-sm border border-[#a7ab99] text-[10px]">

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

                            ? 'bg-[#203334] text-white shadow-xs font-semibold'

                            : 'text-[#4c615b] hover:text-[#203334]'

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
                    if (activeTool === 'plant') return curCustom.variation === 'planter_partition_box' ? `${curCustom.w} x ${curCustom.h}` : `r:${curCustom.r || 22}px`;
                    if (activeTool === 'spawn') return 'Portal';
                    return 'Custom';
                  };

                  {/* State A: Collapsed Single-Row Mini Bar */}
                  if (!isCustomizerExpanded) {
                    return (
                      <div
                        onClick={() => setIsCustomizerExpanded(true)}
                        className="mx-2.5 my-1.5 px-3 py-2 rounded-sm bg-[#f4edda] border border-[#a7ab99] hover:border-[#88968a] cursor-pointer flex items-center justify-between transition-all group shrink-0 shadow-xs"
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
                          <span className="text-[11px] font-bold text-[#203334] truncate">
                            {activeModel?.shortName || armedToolDetails.label}
                          </span>
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-sm bg-[#fff9e9] text-[#23776e] border border-[#82ab99] font-semibold shrink-0">
                            {getDimensionSummary()}
                          </span>
                          {curCustom.color && (
                            <span
                              className="w-2.5 h-2.5 rounded-sm border border-white/20 shrink-0"
                              style={{ backgroundColor: curCustom.color }}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-[#418b7e] font-semibold group-hover:text-[#203334] transition-colors shrink-0">
                          <span>Specs</span>
                          <span className="material-symbols-outlined text-[14px]">tune</span>
                        </div>
                      </div>
                    );
                  }

                  {/* State B: Expanded Studio Customizer Panel */}
                  return (
                    <div className="mx-2.5 my-1.5 rounded-sm bg-[#fff9e9] border border-[#a7ab99] overflow-hidden shadow-sm transition-all shrink-0">
                      {/* Subpanel Header */}
                      <div className="px-3 py-2 bg-[#f4edda] border-b border-[#a7ab99] flex items-center justify-between">
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
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#203334] truncate">
                            {armedToolDetails.label}
                          </span>
                          <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-sm bg-[#d9eadb] text-[#23776e] border border-[#82ab99] shrink-0">
                            ARMED
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => setIsCustomizerExpanded(false)}
                            className="w-5 h-5 rounded flex items-center justify-center text-[#64748b] hover:text-[#203334] hover:bg-[#ded4b8] transition-colors"
                            title="Minimize options panel"
                          >
                            <span className="material-symbols-outlined text-[15px]">keyboard_arrow_up</span>
                          </button>
                          <button
                            onClick={() => handleSelectTool('select')}
                            className="w-5 h-5 rounded flex items-center justify-center text-[#64748b] hover:text-rose-400 hover:bg-[#ded4b8] transition-colors"
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
                            <span className="font-mono text-[#418b7e] text-[9px] truncate max-w-[130px]">
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
                                      ? 'bg-[#203334] border-[#418b7e] text-white shadow-sm'
                                      : 'bg-[#e9dfc7] border-[#88968a] text-[#4c615b] hover:text-[#203334] hover:bg-[#ded4b8]'
                                  }`}
                                  title={model.desc}
                                >
                                  <div
                                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
                                      isSelected ? 'bg-[#418b7e]/20 text-[#418b7e]' : 'bg-[#ded4b8] text-[#64748b]'
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-[13px]">{model.icon}</span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-[9.5px] font-bold truncate leading-tight">{model.shortName}</div>
                                    <div className="text-[7.5px] font-mono text-[#64748b] truncate leading-tight">{model.badge}</div>
                                  </div>
                                  {isSelected && (
                                    <span className="w-1.5 h-1.5 rounded-sm bg-[#418b7e] shrink-0 mr-0.5" />
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
                        <div className="pt-1.5 border-t border-[#697c71] space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wider text-[#64748b]">
                            <span>Dimensions & Scale</span>
                            <span className="font-mono text-[#418b7e] text-[8.5px]">
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
                                        ? 'bg-[#d9eadb] border-2 border-[#23776e] text-[#15584e] font-bold'
                                        : 'bg-[#e9dfc7] border-[#88968a] text-[#4c615b] hover:text-[#203334] hover:bg-[#ded4b8]'
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
                                        ? 'bg-[#d9eadb] border-2 border-[#23776e] text-[#15584e] font-semibold'
                                        : 'bg-[#e9dfc7] border-[#88968a] text-[#4c615b] hover:text-[#203334] hover:bg-[#ded4b8]'
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
                                      ? 'bg-[#d9eadb] border-2 border-[#23776e] text-[#15584e] font-bold'
                                      : 'bg-[#e9dfc7] border-[#88968a] text-[#4c615b] hover:text-[#203334] hover:bg-[#ded4b8]'
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
                                      ? 'bg-[#d9eadb] border-2 border-[#23776e] text-[#15584e] font-bold'
                                      : 'bg-[#e9dfc7] border-[#88968a] text-[#4c615b] hover:text-[#203334] hover:bg-[#ded4b8]'
                                  }`}
                                >
                                  {pre.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {activeModel?.dimensionPresets && (
                            <div className="grid grid-cols-2 gap-1">
                              {activeModel.dimensionPresets.map(({label, ...dimensions}) => (
                                <button key={label}
                                  onClick={() => setToolCustomization(p => ({ ...p, [activeTool]: { ...p[activeTool], ...dimensions } }))}
                                  className={`py-1 px-1 text-[9px] font-medium border ${
                                    Object.entries(dimensions).every(([key,value]) => curCustom[key] === value)
                                      ? 'bg-[#d9eadb] border-[#23776e] text-[#15584e]'
                                      : 'bg-[#e9dfc7] border-[#88968a] text-[#4c615b]'}`}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 3. Material Finish & Color Palette */}
                        <div className="pt-1.5 border-t border-[#697c71] space-y-1">
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
                                  className={`w-4 h-4 rounded-sm border transition-all ${
                                    isSelected
                                      ? 'scale-125 ring-2 ring-[#418b7e] ring-offset-1 ring-offset-[#090e1a] border-white'
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

                        <div className="px-1 pt-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#4c615b]">

                          <span className="flex items-center gap-1.5">

                            <span className="material-symbols-outlined text-[14px] text-[#23776e]">

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

                                className={`group px-2.5 py-1.5 rounded-sm border cursor-pointer transition-all flex items-center justify-between ${

                                  isActive

                                    ? 'bg-[#d9eadb] border-2 border-[#23776e] shadow-xs'

                                    : 'bg-[#fff9e9] border border-[#eadbba] hover:border-[#88968a] hover:bg-[#f4edda] shadow-xs'

                                }`}

                              >

                                {/* Left: Semantic Icon Box + Text Info */}

                                <div className="flex items-center gap-2.5 min-w-0">

                                  <div

                                    className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"

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

                                      <span className="text-[12px] font-semibold text-[#203334] truncate">

                                        {tool.label}

                                      </span>

                                      {isActive && (

                                        <span className="w-1.5 h-1.5 rounded-sm bg-[#418b7e] shadow-[0_0_6px_#418b7e]" />

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
                                      className="text-[8px] font-mono font-bold px-1 py-0.5 rounded bg-[#ded4b8] text-[#418b7e] border border-[#418b7e]/40"
                                      title={isCustomizerExpanded ? "Specs panel open" : "Specs panel collapsed"}
                                    >
                                      {isCustomizerExpanded ? '▲ SPECS' : '▼ SPECS'}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-[#ded4b8] text-[#334b40] border border-[#697c71]">
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

                    <div className="p-3 rounded-sm bg-[#ded4b8] border border-[#697c71] space-y-2">

                      <div className="flex items-center justify-between">

                        <span className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-[#ded4b8] border border-[#697c71] text-[#418b7e]">

                          {selectedItemDetails.badge}

                        </span>

                        <span className="text-[10px] text-[#10b981] font-semibold flex items-center gap-1">

                          <span className="w-1.5 h-1.5 rounded-sm bg-[#10b981]" />

                          {selectedItemDetails.status}

                        </span>

                      </div>

                      <div className="flex items-center gap-2.5 pt-1">

                        <div

                          className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0"

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

                          <div className="text-[13px] font-bold text-[#203334] truncate">

                            {selectedItemDetails.title}

                          </div>

                          <div className="text-[10px] text-[#64748b] font-mono">

                            Type: {selectedItem.type.toUpperCase()}

                          </div>

                        </div>

                      </div>

                    </div>

                    {/* Spatial Geometry Matrix */}

                    <div className="p-3 rounded-sm bg-[#fff9e9] border border-[#a7ab99] shadow-xs space-y-1.5">

                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#4c615b] flex items-center gap-1">

                        <span className="material-symbols-outlined text-[14px] text-[#23776e]">

                          straighten

                        </span>

                        <span>Spatial Coordinates & Bounds</span>

                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-xs">

                        <div className="p-1.5 rounded bg-[#ded4b8] border border-[#697c71]">

                          <span className="text-[9px] text-[#435a50] block font-mono">X POSITION</span>

                          <span className="font-semibold text-[#203334]">{Math.round(selectedItemDetails.x)} px</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#ded4b8] border border-[#697c71]">

                          <span className="text-[9px] text-[#435a50] block font-mono">Y POSITION</span>

                          <span className="font-semibold text-[#203334]">{Math.round(selectedItemDetails.y)} px</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#ded4b8] border border-[#697c71]">

                          <span className="text-[9px] text-[#435a50] block font-mono">WIDTH / EXTENT</span>

                          <span className="font-semibold text-[#203334]">{Math.round(selectedItemDetails.w)} px</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#ded4b8] border border-[#697c71]">

                          <span className="text-[9px] text-[#435a50] block font-mono">HEIGHT / EXTENT</span>

                          <span className="font-semibold text-[#203334]">{Math.round(selectedItemDetails.h)} px</span>

                        </div>

                      </div>

                    </div>

                    {/* Rotation & Orientation Controls */}

                    <div className="p-3 rounded-sm bg-[#fff9e9] border border-[#a7ab99] shadow-xs space-y-2">

                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#4c615b]">

                        <span className="flex items-center gap-1">

                          <span className="material-symbols-outlined text-[14px] text-[#23776e]">rotate_right</span>

                          <span>Orientation Angle</span>

                        </span>

                        <span className="text-[#203334] font-mono">{selectedItemDetails.rotation || 0}°</span>

                      </div>

                      <div className="flex items-center gap-1.5">

                        <button

                          onClick={() => handleRotate(-45)}

                          className="flex-1 py-1 px-2 rounded bg-[#ded4b8] hover:bg-[#ded4b8] text-xs font-semibold text-[#334b40] border border-[#697c71] flex items-center justify-center gap-1 transition-colors"

                        >

                          <span className="material-symbols-outlined text-[14px]">rotate_left</span>

                          <span>-45°</span>

                        </button>

                        <button

                          onClick={() => handleRotate(45)}

                          className="flex-1 py-1 px-2 rounded bg-[#ded4b8] hover:bg-[#ded4b8] text-xs font-semibold text-[#334b40] border border-[#697c71] flex items-center justify-center gap-1 transition-colors"

                        >

                          <span className="material-symbols-outlined text-[14px]">rotate_right</span>

                          <span>+45°</span>

                        </button>

                        <button

                          onClick={() => handleRotate(90)}

                          className="py-1 px-2.5 rounded bg-[#ded4b8] hover:bg-[#ded4b8] text-xs font-semibold text-[#418b7e] border border-[#273a5a] transition-colors"

                          title="Rotate 90 degrees"

                        >

                          90°

                        </button>

                      </div>

                    </div>

                    {/* Architectural Model & Variation Customizer for Placed Entity */}

                    {['wall', 'door', 'zone', 'furniture'].includes(selectedItem.type) && (

                      <div className="p-3 rounded-sm bg-[#fff9e9] border border-[#a7ab99] shadow-xs space-y-2">

                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#4c615b]">

                          <span className="flex items-center gap-1">

                            <span className="material-symbols-outlined text-[14px] text-[#23776e]">style</span>

                            <span>Model Variation</span>

                          </span>

                          <span className="font-mono text-[#418b7e] text-[9.5px]">

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

                                    ...(m.defaultWidth && selectedItem.type === 'door' ? (selectedItemDetails.h>selectedItemDetails.w
                                      ? {h:m.defaultWidth,y:selectedItemDetails.y+(selectedItemDetails.h-m.defaultWidth)/2}
                                      : {w:m.defaultWidth,x:selectedItemDetails.x+(selectedItemDetails.w-m.defaultWidth)/2}) : {}),

                                  });

                                }}

                                className={`px-2 py-1.5 rounded text-left border flex items-center justify-between text-xs transition-colors ${

                                  isCur

                                    ? 'bg-[#d9eadb] border-2 border-[#23776e] text-[#15584e] font-semibold'

                                    : 'bg-[#f4edda] border-[#a7ab99] text-[#203334] hover:bg-[#e9dfc7]'

                                }`}

                              >

                                <span className="flex items-center gap-1.5 truncate">

                                  <span className="material-symbols-outlined text-[14px] text-[#418b7e]">{m.icon}</span>

                                  <span>{m.shortName}</span>

                                </span>

                                <span className="text-[8.5px] font-mono text-[#418b7e]">{m.badge}</span>

                              </button>

                            );

                          })}

                        </div>

                        {/* Color Swatches for Placed Entity */}

                        <div className="pt-1.5 border-t border-[#a7ab99] space-y-1">

                          <span className="text-[9.5px] font-semibold text-[#4c615b] block uppercase tracking-wider">

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

                                className={`w-5 h-5 rounded-sm border-2 transition-transform ${

                                  selectedItemDetails.color === swatch.hex

                                    ? 'border-[#418b7e] scale-110 shadow-[0_0_6px_#418b7e]'

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

                    <div className="p-3 rounded-sm bg-[#fff9e9] border border-[#a7ab99] shadow-xs space-y-1">

                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#4c615b] flex items-center gap-1">

                        <span className="material-symbols-outlined text-[13px] text-[#10b981]">

                          graphic_eq

                        </span>

                        <span>ProxiSpeak Acoustic Profile</span>

                      </div>

                      <p className="text-[11px] text-[#40584f] leading-relaxed">

                        {selectedItemDetails.acoustic}

                      </p>

                    </div>

                    {/* Entity Actions */}

                    <div className="space-y-1.5 pt-1">

                      <button

                        onClick={handleDuplicateSelected}

                        className="w-full py-1.5 px-2.5 rounded-md bg-[#ded4b8] hover:bg-[#ded4b8] border border-[#697c71] text-[#418b7e] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"

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

                        className="w-full py-1 px-2.5 rounded-md bg-[#ded4b8] hover:bg-[#ded4b8] border border-[#697c71] text-[#4c615b] text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"

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

                    <div className="p-3 rounded-sm bg-[#ded4b8] border border-[#697c71] space-y-2">

                      <div className="flex items-center justify-between">

                        <span className="text-[9px] font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-[#ded4b8] border border-[#697c71] text-[#418b7e]">

                          ARMED DRAWING TOOL

                        </span>

                        <span className="text-[10px] text-[#418b7e] font-mono font-semibold">

                          [{armedToolDetails.hotkey}]

                        </span>

                      </div>

                      <div className="flex items-center gap-2.5 pt-1">

                        <div

                          className="w-8 h-8 rounded-sm flex items-center justify-center shrink-0"

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

                          <div className="text-[13px] font-bold text-[#203334] truncate">

                            {armedToolDetails.label}

                          </div>

                          <div className="text-[10px] text-[#4c615b]">

                            {armedToolDetails.badge}

                          </div>

                        </div>

                      </div>

                      <p className="text-[11px] text-[#334b40] leading-relaxed pt-1">

                        {armedToolDetails.description}

                      </p>

                    </div>

                    {/* Armed Tool Rotation Controls */}

                    <div className="p-3 rounded-sm bg-[#fff9e9] border border-[#a7ab99] shadow-xs space-y-2">

                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#4c615b]">

                        <span className="flex items-center gap-1">

                          <span className="material-symbols-outlined text-[14px] text-[#23776e]">rotate_right</span>

                          <span>Deployment Angle</span>

                        </span>

                        <span className="text-[#418b7e] font-mono font-bold text-xs">{rotationAngle}°</span>

                      </div>

                      <div className="grid grid-cols-4 gap-1">

                        {[0, 90, 180, 270].map((deg) => (

                          <button

                            key={deg}

                            onClick={() => setRotationAngle(deg)}

                            className={`py-1 text-xs rounded font-mono font-semibold transition-all border ${

                              rotationAngle === deg

                                ? 'bg-[#0284c7]/20 text-[#418b7e] border-[#0284c7]/60'

                                : 'bg-[#ded4b8] text-[#64748b] border-[#697c71] hover:text-[#203334]'

                            }`}

                          >

                            {deg}°

                          </button>

                        ))}

                      </div>

                      <div className="text-[10px] text-[#64748b] flex items-center gap-1 pt-0.5">

                        <span className="material-symbols-outlined text-[12px] text-[#418b7e]">mouse</span>

                        <span>Tip: Scroll mouse wheel on canvas to rotate 45°</span>

                      </div>

                    </div>

                    {/* How to Plot & Use */}

                    <div className="p-3 rounded-sm bg-[#fff9e9] border border-[#a7ab99] shadow-xs space-y-1.5 text-xs text-[#4c615b]">

                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#418b7e] flex items-center gap-1">

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

                    <div className="p-3 rounded-sm bg-[#fff9e9] border border-[#a7ab99] shadow-xs space-y-2">

                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#4c615b] flex items-center gap-1">

                        <span className="material-symbols-outlined text-[14px] text-[#23776e]">

                          analytics

                        </span>

                        <span>Office Floor Plan Stats</span>

                      </div>

                      <div className="grid grid-cols-2 gap-1.5 text-xs">

                        <div className="p-1.5 rounded bg-[#ded4b8] border border-[#697c71]">

                          <span className="text-[9px] text-[#435a50] block font-mono">WALLS</span>

                          <span className="font-semibold text-[#203334]">{walls.length} partitions</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#ded4b8] border border-[#697c71]">

                          <span className="text-[9px] text-[#435a50] block font-mono">DOORS</span>

                          <span className="font-semibold text-[#203334]">{doors.length} entries</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#ded4b8] border border-[#697c71]">

                          <span className="text-[9px] text-[#435a50] block font-mono">FURNITURE</span>

                          <span className="font-semibold text-[#203334]">{furniture.length} objects</span>

                        </div>

                        <div className="p-1.5 rounded bg-[#ded4b8] border border-[#697c71]">

                          <span className="text-[9px] text-[#435a50] block font-mono">SOUND ZONES</span>

                          <span className="font-semibold text-[#203334]">{soundZones.length} zones</span>

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

                <div className="text-[11px] text-[#4c615b] pb-1">

                  Load ready-made architectural layouts:

                </div>

                {PRESETS.map((preset) => (

                  <div

                    key={preset.id}

                    onClick={() => handleLoadPreset(preset.id)}

                    className="p-2.5 rounded-sm bg-[#ded4b8] border border-[#697c71] hover:border-[#418b7e]/50 hover:bg-[#ded4b8] cursor-pointer transition-all space-y-1 group"

                  >

                    <div className="flex items-center justify-between">

                      <span className="text-xs font-bold text-[#203334] group-hover:text-[#418b7e] transition-colors">

                        {preset.name}

                      </span>

                      <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-sm border ${preset.tagColor}`}>

                        {preset.badge}

                      </span>

                    </div>

                    <p className="text-[10.5px] text-[#4c615b] leading-snug">

                      {preset.description}

                    </p>

                  </div>

                ))}

              </div>

            )}

            {/* Drawer Bottom Status Pill */}

            <div className="p-2.5 border-t border-[#a7ab99] bg-[#f4edda] shrink-0 text-[10px] text-[#4c615b] flex items-center justify-between">

              <span>Tool: <strong className="text-[#203334] font-mono uppercase">{activeTool}</strong></span>

              <span className="font-mono text-[#4c615b]">Angle: {rotationAngle}° · [R] Rotate</span>

            </div>

          </div>

        </div>

        {/* Dynamic Studio Canvas Viewport (Automatically takes remaining space) */}

        <main ref={containerRef} className="flex-1 h-full relative overflow-hidden bg-[#f4edda] min-w-0">

          {/* Toast Notification */}

          {saveToast && (

            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-sm bg-white border border-[#fecaca] text-[#dc2626] text-xs font-semibold shadow-xl flex items-center gap-2.5">

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

                  className="ml-1.5 px-2 py-0.5 rounded bg-[#23776e] hover:bg-[#145951] text-[11px] font-bold text-white transition-colors"

                >

                  Enter Office

                </button>

              )}

            </div>

          )}

          {/* Live Collision Warning Alert */}
          {collisionAlert && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 px-3.5 py-2 rounded-sm bg-red-950/92 border border-red-500/60 text-red-200 text-xs font-semibold shadow-2xl backdrop-blur pointer-events-none animate-in fade-in zoom-in-95 duration-150">
              <span className="w-2 h-2 rounded-sm bg-red-400 animate-ping" />
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

            className={`touch-none w-full h-full block ${canvasCursor}`}

          />

          {/* Bottom Floating Helper Bar with Rotation HUD */}

          <footer className="hidden lg:flex absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-sm bg-[#f4edda] backdrop-blur-md border border-[#88968a] text-[11px] text-[#203334] items-center gap-3.5 z-10 shadow-lg pointer-events-none">

            <span className="flex items-center gap-1">

              <span className="material-symbols-outlined text-[14px] text-[#23776e]">mouse</span>

              <span>Click to place</span>

            </span>

            <span>•</span>

            <span className="flex items-center gap-1 text-[#23776e] font-semibold">

              <span className="material-symbols-outlined text-[13px]">rotate_right</span>

              <span>Wheel / [R]: Rotate ({rotationAngle}°)</span>

            </span>

            <span>•</span>

            <span className="flex items-center gap-1">

              <span className="material-symbols-outlined text-[14px] text-[#23776e]">pan_tool</span>

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

