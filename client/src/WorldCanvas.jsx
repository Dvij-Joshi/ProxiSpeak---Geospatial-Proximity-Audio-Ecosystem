import './meetingActions.css';
import { AvatarPortrait } from './components/WorkspaceArt';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { io } from 'socket.io-client';
import { spatialAudio, MAX_DISTANCE, W, H, countWallIntersections, isDoorOpen, getRoomAt } from './services/spatialAudio';
import { playKnockSound, playUiChime } from './services/meetingSounds';
import { webrtc } from './services/webrtc';
import { SERVER_URL } from './config';
import { THEMES, makeScene } from './world/scenes';
import { blocked, touchesModel, prepareScene, paintScene } from './world/renderScene';

const SPEED = 3.6;
const MOVE_THROTTLE_MS = 50;

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
  const [fetchedLayout, setFetchedLayout] = useState(null);
  useEffect(() => {
    if (room?.layout) return;
    const controller = new AbortController();
    fetch(`${SERVER_URL}/api/layouts/${encodeURIComponent(roomId)}`, {signal:controller.signal})
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.layoutId && !controller.signal.aborted) setFetchedLayout({roomId, layout:data});
      })
      .catch(() => {});
    return () => controller.abort();
  }, [roomId, room?.layout]);

  const customLayout = room?.layout || (fetchedLayout?.roomId === roomId ? fetchedLayout.layout : null);
  const themeKey = (room?.theme && THEMES[room.theme])
    ? room.theme
    : (customLayout?.theme && THEMES[customLayout.theme])
      ? customLayout.theme
      : (propTheme && THEMES[propTheme] ? propTheme : 'office');

  const activeTheme = useMemo(() => makeScene(THEMES[themeKey], customLayout, roomName), [themeKey, customLayout, roomName]);
  const themeRef = useRef(activeTheme);
  themeRef.current = activeTheme;
  const doorLookup = activeTheme.doorLookup;

  const canvasRef   = useRef(null);
  const containerRef = useRef(null);
  const minimapCanvasRef = useRef(null);
  const cameraRef   = useRef({ x: activeTheme.spawn.x, y: activeTheme.spawn.y });
  const zoomRef     = useRef(1.0);
  const [zoom, setZoom] = useState(1.0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showRadar, setShowRadar] = useState(() => window.innerWidth > 760);
  const touchRef = useRef(null);
  const draggedRef = useRef(false);
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

  const shots = useRef([]);
  const targetRef = useRef(null);
  const [target, setTarget] = useState(null);
  const selectTarget = value => { targetRef.current = value; setTarget(value); };
  const [removed,setRemoved] = useState(false);
  const [sfx,setSfx] = useState(() => localStorage.getItem('meeting-sfx') !== 'off');
  const [chair,setChair] = useState(null);
  const [cooldown,setCooldown] = useState(0);
  const [penalty,setPenalty] = useState(0);
  const action = (type, data={}) => {
    if (socketRef.current?.connected) socketRef.current.timeout(5000).emit('meeting-action',{action:type,...data},
      (_error,message) => { if (message) showToast(message,'warn'); });
  };
  useEffect(() => {
    const timer = setInterval(() => {
      const me = stateRef.current, now = Date.now();
      const occupied = new Set(Object.values(peersRef.current).map(p => p.seat));
      let closest = null, distance = 50;
      for (const c of themeRef.current.chairs) {
        const d = Math.hypot(me.x-c.x,me.y-c.y);
        if (d < distance && !occupied.has(c.id) && !countWallIntersections(me.x,me.y,c.x,c.y,doorsRef.current,themeRef.current)) { closest=c.id; distance=d; }
      }
      setChair(closest);
      setCooldown(Math.max(0,Math.ceil(((me.cooldownUntil||0)-now)/1000)));
      setPenalty(Math.max(0,Math.ceil(((me.penaltyUntil||0)-now)/1000)));
    },200);
    return () => clearInterval(timer);
  }, []);
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

  const refreshAudioInputDevices = useCallback(async () => {
    try {
      const devs = await webrtc.getAudioInputDevices();
      if (devs && devs.length > 0) {
        setMicDevices(devs);
        if (webrtc.selectedMicDeviceId) {
          setSelectedMicId(webrtc.selectedMicDeviceId);
        }
      }
    } catch (_err) {
      console.warn('[WorldCanvas] Failed to enumerate audio devices:', _err);
    }
  }, []);

  // Studio Multi-Tool Side Panel State (People, Chat & DMs, Settings)
  const [showSidePanel, setShowSidePanel] = useState(() => window.innerWidth > 760);
  const [activeSideTab, setActiveSideTab] = useState('people'); // 'people' | 'chat' | 'settings'
  const [chatChannel, setChatChannel] = useState('room'); // 'room' | 'direct'
  const [dmTargetPeerId, setDmTargetPeerId] = useState(null);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [peopleFilter, setPeopleFilter] = useState('');
  const [peersVersion, setPeersVersion] = useState(0);

  // Chat State
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef(null);
  const chatMessagesRef = useRef([]);

  const handleOpenDirectChat = useCallback((targetPeerId) => {
    setDmTargetPeerId(targetPeerId);
    setChatChannel('direct');
    setActiveSideTab('chat');
    setShowSidePanel(true);
  }, []);

  const [isPttActive, setIsPttActive] = useState(false);
  const isPttActiveRef = useRef(false);
  const isMutedRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const voiceMeterBarRef = useRef(null);
  const settingsVoiceMeterRef = useRef(null);
  const renderRef = useRef(null);
  const sceneArtRef = useRef(null);
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

  // Listen to device changes and enumerate on mount
  useEffect(() => {
    refreshAudioInputDevices();
    const handleDeviceChange = () => {
      refreshAudioInputDevices();
    };
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    }
  }, [refreshAudioInputDevices]);

  // Refresh audio devices whenever settings tab is selected
  useEffect(() => {
    if (activeSideTab === 'settings') {
      refreshAudioInputDevices();
    }
  }, [activeSideTab, refreshAudioInputDevices]);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (showChat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, showChat]);

  const handleSendChatMessage = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg || !socketRef.current) return;
    if (chatChannel === 'direct' && dmTargetPeerId) {
      const targetPeer = peersRef.current[dmTargetPeerId];
      socketRef.current.emit('private:chat:send', {
        toSocketId: dmTargetPeerId,
        message: msg,
        toUsername: targetPeer?.username || 'Peer',
      });
    } else {
      socketRef.current.emit('room:chat:send', { roomId, message: msg });
    }
    setChatInput('');
  }, [chatInput, chatChannel, dmTargetPeerId, roomId]);

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
      playUiChime('leave');
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

  // Handle container and viewport resizing with ResizeObserver
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current && canvasRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const nw = Math.max(320, Math.floor(rect.width));
        const nh = Math.max(320, Math.floor(rect.height));
        if (canvasRef.current.width !== nw || canvasRef.current.height !== nh) {
          canvasRef.current.width = nw;
          canvasRef.current.height = nh;
        }
      }
    };
    updateSize();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => updateSize());
      ro.observe(containerRef.current);
    }
    window.addEventListener('resize', updateSize);
    return () => {
      window.removeEventListener('resize', updateSize);
      if (ro) ro.disconnect();
    };
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

    if (sceneArtRef.current) mctx.drawImage(sceneArtRef.current.radar, 0, 0, mw, mh);
    for (const d of activeTheme.doors) {
      mctx.fillStyle = isDoorOpen(doorsRef.current,d.key) ? '#478c74' : '#c25b40';
      mctx.fillRect(d.x*sx,d.y*sy,Math.max(2,d.w*sx),Math.max(2,d.h*sy));
    }
    const blip=(x,y,color,size)=>{
      mctx.beginPath(); mctx.moveTo(x,y-size); mctx.lineTo(x+size,y);
      mctx.lineTo(x,y+size); mctx.lineTo(x-size,y); mctx.closePath();
      mctx.fillStyle=color; mctx.fill(); mctx.strokeStyle='#203334'; mctx.lineWidth=1.5; mctx.stroke();
    };
    for(const [id,p] of Object.entries(peersRef.current)) {
      blip(p.x*sx,p.y*sy,peerIntensitiesRef.current[id]>.05?'#a6df8f':p.avatarColor||'#d89474',3.5);
    }
    const lx=stateRef.current.x*sx, ly=stateRef.current.y*sy;
    mctx.strokeStyle='#477a70'; mctx.beginPath(); mctx.ellipse(lx,ly,MAX_DISTANCE*sx,MAX_DISTANCE*sy,0,0,Math.PI*2); mctx.stroke();
    blip(lx,ly,avatarColor,4.5);

    // Camera Viewport Frustum Box
    const canvas = canvasRef.current;
    if (canvas) {
      const z = zoomRef.current;
      const vw = canvas.width / z;
      const vh = canvas.height / z;
      const vx = cameraRef.current.x - vw / 2;
      const vy = cameraRef.current.y - vh / 2;
      mctx.strokeStyle = '#203334';
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

    const players = [];
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

      if (Math.abs(dx) > .2) peer.facing = Math.sign(dx);
      if (peerMoving) peer.back = dy < -Math.abs(dx)*.5;
      players.push({ selected:targetRef.current===peerId, seatAt:peer.seatAt, handAt:peer.handAt, seat:peer.seat, raised:peer.raised, red:peer.penaltyUntil>Date.now(), x: peer.x, y: peer.y, color: peer.avatarColor, name: peer.username,
        moving: peerMoving, facing: peer.facing, back: peer.back, muted: peer.isMuted, speaking: peerSpeaking,
        volume: vol, intensity, acoustic });
    }
    players.push({ seatAt:s.seatAt, handAt:s.handAt, seat:s.seat, raised:s.raised, red:s.penaltyUntil>Date.now(), x:s.x,y:s.y,color:avatarColor,name:username,moving:s.moving,facing:s.facing,back:s.back,
      local:true,muted:isMutedRef.current,speaking:isSpeakingRef.current,volume:1,
      intensity:localIntensityRef.current,acoustic:{localRoom:localRoomRef.current} });
    const time = performance.now();
    if (shots.current.length) shots.current = shots.current.filter(shot => time-shot.start<720);
    paintScene(ctx,activeTheme,sceneArtRef.current,players,doorsRef.current,cameraRef.current,vw,vh,z,time,shots.current);
    ctx.save();
    ctx.font='bold 11px Arial';
    const connected=socketRef.current?.connected;
    const label=connected?'ONLINE':'OFFLINE';
    ctx.fillStyle='#203334'; ctx.fillRect(12,16,72,20);
    ctx.fillStyle=connected?'#a6df8f':'#e98769'; ctx.fillRect(19,23,6,6);
    ctx.fillStyle='#f4edda'; ctx.fillText(label,31,30);
    if (vw > 640) {
      ctx.fillStyle='#203334';ctx.fillRect(12,vh-32,175,20);
      ctx.fillStyle='#f4edda';ctx.fillText('WASD / Arrows  |  Scroll to zoom',18,vh-18);
    }
    ctx.restore();
    drawMinimap();
  }, [username, avatarColor, activeTheme, drawMinimap]);

  renderRef.current = render;

  // Audio Control Handlers
  const handleToggleMic = async () => {
    if (stateRef.current.penaltyUntil > Date.now()) return;
    spatialAudio.resumeAll();
    setAudioUnlocked(true);

    if (!micActive) {
      try {
        const audioCtx = spatialAudio.ensureContext();
        await webrtc.startMicrophone(audioCtx);
        setMicActive(true);
        isMutedRef.current = webrtc.isMuted;
        setIsMuted(webrtc.isMuted);
        playUiChime('unmute');
        await refreshAudioInputDevices();
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

  const toggleMicRef = useRef(handleToggleMic);
  toggleMicRef.current = handleToggleMic;

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
      const pct = Math.round(v * 100);
      if (voiceMeterBarRef.current) {
        voiceMeterBarRef.current.style.width = `${pct}%`;
        voiceMeterBarRef.current.style.minWidth = v > 0.02 ? '4px' : '0px';
        voiceMeterBarRef.current.style.background = v > 0.6 ? '#f59e0b' : '#22c55e';
        voiceMeterBarRef.current.style.boxShadow = v > 0.1 ? '0 0 8px rgba(34, 197, 94, 0.7)' : 'none';
      }
      if (settingsVoiceMeterRef.current) {
        settingsVoiceMeterRef.current.style.width = `${pct}%`;
        settingsVoiceMeterRef.current.style.background = v > 0.6 ? '#f59e0b' : '#22c55e';
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
    sceneArtRef.current = prepareScene(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    Object.assign(stateRef.current,activeTheme.spawn);
    cameraRef.current = {...activeTheme.spawn};
    if (socketRef.current?.connected) socketRef.current.emit('move',{...activeTheme.spawn,roomId});
  }, [roomId,activeTheme.id,activeTheme.spawn.x,activeTheme.spawn.y]);

  // Non-passive wheel zoom listener
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onCanvasWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom((prev) => {
        const next = Math.min(1.5, Math.max(0.55, Number((prev + delta).toFixed(2))));
        zoomRef.current = next;
        return next;
      });
    };
    canvas.addEventListener('wheel', onCanvasWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onCanvasWheel);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) canvas.focus();

    // Reset position to theme spawn
    stateRef.current.x = activeTheme.spawn.x;
    stateRef.current.y = activeTheme.spawn.y;
    cameraRef.current = { ...activeTheme.spawn };

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
      socket.emit('join-room', {
        username,
        avatarColor,
        roomId,
        isMuted: isMutedRef.current,
        x: stateRef.current.x,
        y: stateRef.current.y,
      });
    });

    const timers = new Set();
    const later = (callback,delay) => {
      const timer = setTimeout(() => { timers.delete(timer); callback(); },delay);
      timers.add(timer);
    };
    const removeMember = () => {
      setRemoved(true);
      webrtc.closeAll();
      later(handleLeaveCall,2200);
    };
    const muteForPenalty = until => {
      webrtc.enforcePenalty(until);
      isPttActiveRef.current = false;
      setIsPttActive(false);
      isMutedRef.current = true;
      setIsMuted(true);
    };
    socket.on('meeting-removed',removeMember);
    socket.on('meeting-update', event => {
      const mine = event.id === socket.id;
      const actor = mine ? stateRef.current : peersRef.current[event.id];
      if (event.action === 'throw') {
        const victim = event.target === socket.id ? stateRef.current : peersRef.current[event.target];
        if (mine) stateRef.current.throwCount = event.throwCount;
        if (mine) stateRef.current.cooldownUntil = Date.now()+event.cooldownUntil-event.serverTime;
        if (victim) Object.assign(victim,{hits:event.hits,isMuted:true,penaltyUntil:Date.now()+event.penaltyUntil-event.serverTime});
        shots.current.push({...event,start:performance.now()});
        playUiChime('throw');
        later(() => {
          playUiChime('impact');
          if (victim === stateRef.current) later(()=>playUiChime(event.hits===3?'removed':'warning'),130);
        },400);
        if (victim === stateRef.current) {
          muteForPenalty(victim.penaltyUntil);
          if (event.hits === 3) removeMember();
        }
        if (mine) selectTarget(null);
      } else if (actor) {
        if (event.action === 'hand') Object.assign(actor,{raised:event.raised,handAt:performance.now()});
        else Object.assign(actor,{seatAt:performance.now(),seat:event.seat,x:event.x,y:event.y,targetX:event.x,targetY:event.y,renderX:event.x,renderY:event.y});
        playUiChime(event.action==='hand'&&!event.raised?'lower':event.action);
      }
      setPeersVersion(v=>v+1);
    });
    // Populate existing peers and initiate WebRTC connections
    socket.on('room-state', ({ selfId, users, doors: initialDoors, serverTime = Date.now() }) => {
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
        u.penaltyUntil = Date.now()+((u.penaltyUntil||0)-serverTime);
        if (u.id === selfId) {
          Object.assign(stateRef.current,{throwCount:u.throwCount, seat:u.seat, raised:u.raised, hits:u.hits, penaltyUntil:u.penaltyUntil,
            cooldownUntil:Date.now()+((u.cooldownUntil||0)-serverTime)});
          if (u.penaltyUntil > Date.now()) muteForPenalty(u.penaltyUntil);
          playUiChime('join');
        }
        const uNameNorm = u.username?.trim().toLowerCase();
        if (u.id !== selfId && (!myNameNorm || uNameNorm !== myNameNorm)) {
          peersRef.current[u.id] = {
            ...u, x: u.x,
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
      setPeersVersion((v) => v + 1);
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
        next[key].changedAt = performance.now();
        doorsRef.current = next;
        return next;
      });
      playUiChime(isOpen?'open':'close');
      const dName = themeRef.current.doorLookup[key]?.name || key;
      showToastRef.current?.(`${changedBy || 'Member'} ${isOpen ? 'opened' : 'closed'} the ${dName} door`, isOpen ? 'success' : 'warn');
    });

    // Audio chime broadcast when someone knocks on any door
    socket.on('door-knocked', ({ doorKey, roomKey, targetRoomKey }) => {
      const key = doorKey || roomKey || targetRoomKey;
      if (!key) return;
      const amIInside = (localRoomRef.current?.doorKey || localRoomRef.current?.id) === key;
      if (amIInside) {
        playKnockSound();
      }
    });

    // Received by room occupants when a visitor knocks on their door
    socket.on('visitor-knocked', ({ doorKey, roomName: targetRoomName, visitorName, pendingKnocks }) => {
      const amIInside = (localRoomRef.current?.doorKey || localRoomRef.current?.id) === doorKey;
      if (amIInside) {
        playKnockSound();
        setPendingKnockRequests(pendingKnocks || []);
        showToastRef.current?.(`${visitorName} is knocking at the ${targetRoomName} door.`, 'alert');
      }
    });

    // Updated list of pending knocks
    socket.on('pending-knocks-updated', ({ doorKey, pendingKnocks }) => {
      const amIInside = (localRoomRef.current?.doorKey || localRoomRef.current?.id) === doorKey;
      if (amIInside) {
        setPendingKnockRequests(pendingKnocks || []);
      }
    });

    // Received by visitor regarding their knock status
    socket.on('knock-status', ({ doorKey, status, message }) => {
      const dName = themeRef.current.doorLookup[doorKey]?.name || doorKey;
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
      const dName = themeRef.current.doorLookup[doorKey]?.name || doorKey;
      showToast(`${dName}: ${reason}`, 'alert');
    });

    // Existing user gets notified of new peer
    socket.on('user-joined', ({ id, username: uname, avatarColor: ucolor, x, y, isMuted: peerMuted, penaltyRemaining=0 }) => {
      const myNameNorm = username?.trim().toLowerCase();
      const uNameNorm = uname?.trim().toLowerCase();
      if (id === socket.id || (myNameNorm && uNameNorm === myNameNorm)) {
        return;
      }
      playUiChime('join');
      peersRef.current[id] = {
        penaltyUntil: Date.now()+penaltyRemaining,
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
      setPeersVersion((v) => v + 1);
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
        setPeersVersion((v) => v + 1);
      }
    });

    // Peer leaves
    socket.on('user-left', ({ id }) => {
      playUiChime('leave');
      if (targetRef.current===id) selectTarget('pick');
      delete peersRef.current[id];
      delete peerVolumesRef.current[id];
      delete peerIntensitiesRef.current[id];
      delete peerAcousticsRef.current[id];
      webrtc.removePeer(id);
      spatialAudio.removePeerStream(id);
      setPeersVersion((v) => v + 1);
    });

    // Room chat messages
    socket.on('room:chat:message', (payload) => {
      chatMessagesRef.current = [...chatMessagesRef.current, payload].slice(-200);
      setChatMessages([...chatMessagesRef.current]);
    });

    // Private direct messages
    socket.on('private:chat:message', (payload) => {
      setPrivateMessages((prev) => [...prev, payload].slice(-250));
      if (payload.from !== socket.id) {
        showToastRef.current?.(`Private message from ${payload.username}: ${payload.message.slice(0, 35)}`, 'info');
      }
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
        if (!e.repeat) toggleMicRef.current();
        return;
      }

      // Hotkey: Spacebar (held) -> Push-To-Talk Walkie-Talkie
      if (e.key === ' ' && !e.repeat && webrtc.localStream && isMutedRef.current && !(stateRef.current.penaltyUntil>Date.now())) {
        isPttActiveRef.current = true;
        setIsPttActive(true);
        webrtc.toggleMute(roomId);
        isMutedRef.current = webrtc.isMuted;
        setIsMuted(webrtc.isMuted);
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
    const releaseInput = () => {
      stateRef.current.keys = {};
      touchRef.current = null;
      if (isPttActiveRef.current) onKeyUp({key:' '});
    };
    window.addEventListener('blur',releaseInput);

    // 60 FPS Game & Spatial Audio Loop
    let previousFrame;
    function tick(timestamp) {
      const speed = SPEED * Math.min(2,previousFrame === undefined ? 1 : (timestamp-previousFrame)/(1000/60));
      previousFrame = timestamp;
      const activeTheme = themeRef.current;
      const doorLookup = activeTheme.doorLookup;
      const s = stateRef.current;
      const k = s.keys;
      let dx = 0, dy = 0;
      if (k['ArrowUp']    || k['w'] || k['W']) dy -= speed;
      if (k['ArrowDown']  || k['s'] || k['S']) dy += speed;
      if (k['ArrowLeft']  || k['a'] || k['A']) dx -= speed;
      if (k['ArrowRight'] || k['d'] || k['D']) dx += speed;

      if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
      if (touchRef.current?.length > 8) {
        const t = touchRef.current;
        dx = speed * t.dx / t.length;
        dy = speed * t.dy / t.length;
      }

      if (s.seat) { dx = 0; dy = 0; }
      const prevX = s.x, prevY = s.y;
      if (dx && !blocked(activeTheme, s.x + dx, s.y, doorsRef.current)) s.x += dx;
      if (dy && !blocked(activeTheme, s.x, s.y + dy, doorsRef.current)) s.y += dy;
      s.moving = s.x !== prevX || s.y !== prevY;
      if (dx) s.facing = Math.sign(dx);
      if (dx || dy) s.back = dy < -Math.abs(dx)*.5;

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

      // Update spatial distance attenuation, room isolation & wall raycasting
      const { inEarshotCount: currentInEarshot, peerVolumes, peerIntensities, peerAcoustics, localRoom } =
        spatialAudio.updatePositions(s, peersRef.current, doorsRef.current, activeTheme);
      peerVolumesRef.current = peerVolumes;
      peerIntensitiesRef.current = peerIntensities || {};
      if (prevInEarshotRef.current === 0 && currentInEarshot > 0) {
        playUiChime('peer-enter');
      }
      prevInEarshotRef.current = currentInEarshot;
      setInEarshotCount((prev) => (prev !== currentInEarshot ? currentInEarshot : prev));

      if (localRoom && localRoom.id !== localRoomRef.current?.id) {
        const prevRoom = localRoomRef.current;
        localRoomRef.current = localRoom;
        setCurrentRoom(localRoom);

        // If player stepped into a room that they knocked on or were welcomed into:
        const enteredRoomKey = localRoom.doorKey || localRoom.id;
        if (enteredRoomKey && doorLookup[enteredRoomKey]) {
          setWelcomedDoors((prev) => {
            if (prev[enteredRoomKey]) {
              const next = { ...prev };
              delete next[enteredRoomKey];
              return next;
            }
            return prev;
          });
          setMyKnockStatus((prev) => (prev?.doorKey === enteredRoomKey ? null : prev));

          // Auto-close door after 3.5s when entering room to secure meeting privacy
          if (doorAutoCloseTimerRef.current) clearTimeout(doorAutoCloseTimerRef.current);
          doorAutoCloseTimerRef.current = setTimeout(() => {
            if ((localRoomRef.current?.doorKey || localRoomRef.current?.id) === enteredRoomKey && isDoorOpen(doorsRef.current, enteredRoomKey)) {
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
        for (const [key, d] of Object.entries(doorLookup)) {
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
        const targetDoor = doorLookup[myKnockStatusRef.current.doorKey];
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
      if ((s.x !== s.sentX || s.y !== s.sentY) && now - lastEmitRef.current >= MOVE_THROTTLE_MS) {
        socket.emit('move', { x: s.x, y: s.y, roomId });
        lastEmitRef.current = now;
        s.sentX = s.x; s.sentY = s.y;
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
      window.removeEventListener('blur',releaseInput);
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(rafRef.current);
      timers.forEach(clearTimeout);
      clearInterval(keepAliveTimer);
      if (doorAutoCloseTimerRef.current) clearTimeout(doorAutoCloseTimerRef.current);
      socket.disconnect();
      webrtc.closeAll();
      spatialAudio.destroy();
    };
  }, [username, avatarColor, roomId]);

  // Door Interaction Calculations
  const currentRoomId = currentRoom?.doorKey || currentRoom?.id || localRoomRef.current?.id;
  const roomDoorKey = currentRoomId && doorLookup[currentRoomId] ? currentRoomId : null;
  const isRoomDoorOpen = roomDoorKey ? isDoorOpen(doors, roomDoorKey) : false;

  const currentRoomKnocks = (pendingKnockRequests || []).filter(
    (k) => k.doorKey === currentRoomId
  );

  const isOutsideNearbyDoor = Boolean(nearbyDoor && nearbyDoor !== roomDoorKey);
  const isNearbyDoorOpen = nearbyDoor ? isDoorOpen(doors, nearbyDoor) : false;

  let nearbyDoorOccupants = 0;
  if (nearbyDoor) {
    for (const peer of Object.values(peersRef.current)) {
      const peerRoom = getRoomAt(peer.x, peer.y, activeTheme);
      if ((peerRoom?.doorKey || peerRoom?.id) === nearbyDoor) {
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
    const dName = themeRef.current.doorLookup[doorKey]?.name || doorKey;
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

  // Derived Participants List & Filter
  const peersList = Object.entries(peersRef.current).map(([id, p]) => {
    const px = p.renderX ?? p.x;
    const py = p.renderY ?? p.y;
    const dist = Math.round(Math.hypot(px - stateRef.current.x, py - stateRef.current.y));
    const pRoom = getRoomAt(px, py, activeTheme);
    return {
      id,
      ...p,
      dist,
      roomName: pRoom?.name || 'Central Collaboration Floor',
      inEarshot: (peerVolumesRef.current[id] || 0) > .04,
    };
  });

  const filteredPeers = peersList.filter((p) => {
    if (!peopleFilter.trim()) return true;
    return (p.username || '').toLowerCase().includes(peopleFilter.toLowerCase().trim());
  });

  const activeDmPeer = dmTargetPeerId ? peersRef.current[dmTargetPeerId] : null;

  const currentChatMessages = chatChannel === 'direct'
    ? privateMessages.filter((m) =>
        (m.from === socketRef.current?.id && m.to === dmTargetPeerId) ||
        (m.from === dmTargetPeerId && m.to === socketRef.current?.id)
      )
    : chatMessages;

  return (
    <div className="world-shell"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#f4edda',
        overflow: 'hidden',
        boxSizing: 'border-box',
        userSelect: 'none',
      }}
    >
      {/* ── Top Header Console Bar ────────────────────────────────────────── */}
      <header className="world-header"
        style={{
          height: '56px',
          width: '100%',
          padding: '0 16px',
          background: '#fff9e9',
          borderBottom: '1px solid #9bab99',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          zIndex: 40,
          boxSizing: 'border-box',
          gap: '12px',
        }}
      >
        {/* Left: Meeting Branding, Room ID & Invite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div className="world-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 title={roomName}
              style={{
                fontWeight: 700,
                fontSize: '15px',
                color: '#203334',
                letterSpacing: '-0.02em',
                margin: 0,
                whiteSpace: 'nowrap',
              }}
            >
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
                backgroundColor: '#eae4cc',
                color: '#475950',
                border: '1px solid #849388',
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
              color: '#55675e',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '6px',
              transition: 'background 0.12s ease',
            }}
            title="Click to copy meeting ID and invite link"
          >
            <span>ID:</span>
            <code
              style={{
                color: '#203334',
                background: '#eae4cc',
                padding: '2px 6px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '11px',
                border: '1px solid #e2dcc5',
              }}
            >
              {roomId}
            </code>
          </div>

          <button
            onClick={handleCopyInviteLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 10px',
              borderRadius: '4px',
              background: copiedLink ? '#ecfdf5' : '#fff9e9',
              border: copiedLink ? '1px solid #a7f3d0' : '1px solid #849388',
              color: copiedLink ? '#059669' : '#203334',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            title="Copy invite link to clipboard"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
              {copiedLink ? 'check' : 'link'}
            </span>
            <span>{copiedLink ? 'Copied' : 'Invite'}</span>
          </button>
        </div>

        {/* Center: Dynamic Acoustic Zone Locator */}
        {activeTheme.hasDoors && (
          <div className="world-location"
            style={{
              background: currentRoom.isIsolated ? '#e2efdf' : '#eae4cc',
              border: currentRoom.isIsolated ? '1px solid #96bda8' : '1px solid #849388',
              borderRadius: '4px',
              padding: '4px 12px',
              fontSize: '11px',
              color: currentRoom.isIsolated ? '#205e57' : '#203334',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '14px', color: currentRoom.isIsolated ? '#277970' : '#55675e' }}
            >
              {currentRoom.isIsolated ? 'lock' : 'spatial_audio'}
            </span>
            <span style={{ fontWeight: 600, color: currentRoom.isIsolated ? '#1e40af' : '#203334' }}>
              {currentRoom.name}
            </span>
            {currentRoom.isIsolated && (
              <span
                style={{
                  fontSize: '9px',
                  background: '#d0e8d9',
                  color: '#1e40af',
                  padding: '1px 5px',
                  borderRadius: '4px',
                  fontWeight: 700,
                }}
              >
                PRIVATE
              </span>
            )}
          </div>
        )}

        {/* Right: Studio Tab Toggles, Initials User Badge & Leave */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* People Tab Toggle */}
          <button
            onClick={() => {
              if (showSidePanel && activeSideTab === 'people') {
                setShowSidePanel(false);
              } else {
                setActiveSideTab('people');
                setShowSidePanel(true);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '4px',
              background: showSidePanel && activeSideTab === 'people' ? '#203334' : '#fff9e9',
              border: '1px solid ' + (showSidePanel && activeSideTab === 'people' ? '#203334' : '#849388'),
              color: showSidePanel && activeSideTab === 'people' ? '#fff9e9' : '#203334',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            title="View participants and start private chats"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>group</span>
            <span>{Object.keys(peersRef.current).length + 1} People</span>
          </button>

          {/* Chat Tab Toggle */}
          <button
            onClick={() => {
              if (showSidePanel && activeSideTab === 'chat') {
                setShowSidePanel(false);
              } else {
                setActiveSideTab('chat');
                setShowSidePanel(true);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '4px',
              background: showSidePanel && activeSideTab === 'chat' ? '#203334' : '#fff9e9',
              border: '1px solid ' + (showSidePanel && activeSideTab === 'chat' ? '#203334' : '#849388'),
              color: showSidePanel && activeSideTab === 'chat' ? '#fff9e9' : '#203334',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
              position: 'relative',
            }}
            title="Open room and private chat"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>chat</span>
            <span>Chat</span>
            {(chatMessages.length > 0 || privateMessages.length > 0) && (!showSidePanel || activeSideTab !== 'chat') && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: '1.5px solid #fff9e9',
                }}
              />
            )}
          </button>

          {/* Settings Tab Toggle */}
          <button
            onClick={() => {
              if (showSidePanel && activeSideTab === 'settings') {
                setShowSidePanel(false);
              } else {
                setActiveSideTab('settings');
                setShowSidePanel(true);
                refreshDiagnostics();
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 11px',
              borderRadius: '4px',
              background: showSidePanel && activeSideTab === 'settings' ? '#203334' : '#fff9e9',
              border: '1px solid ' + (showSidePanel && activeSideTab === 'settings' ? '#203334' : '#849388'),
              color: showSidePanel && activeSideTab === 'settings' ? '#fff9e9' : '#203334',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.12s ease',
            }}
            title="Audio hardware and hotkey settings"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>tune</span>
            <span>Settings</span>
          </button>

          {/* User Profile Badge with Avatar Initials Box */}
          <div
            style={{
              background: '#fff9e9',
              border: '1px solid #849388',
              borderRadius: '4px',
              padding: '3px 8px 3px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            title={`Signed in as ${username}`}
          >
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '6px',
                backgroundColor: avatarColor,
                color: '#fff9e9',
                fontWeight: 700,
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
              }}
            >
              <AvatarPortrait name={username} color={avatarColor} />
            </div>
            <span
              style={{
                color: '#203334',
                fontWeight: 600,
                fontSize: '12px',
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {username}
            </span>
          </div>

          {/* Leave Meeting Button */}
          <button
            onClick={handleLeaveCall}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 12px',
              borderRadius: '4px',
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
      </header>

      {/* ── Main Studio Split Workspace ──────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          width: '100%',
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Responsive world viewport */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            height: '100%',
            position: 'relative',
            background: '#233d3e',
            overflow: 'hidden',
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
                    : '#203334',
                color: '#fff9e9',
                padding: '8px 20px',
                borderRadius: '4px',
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
                top: doorToast ? '72px' : '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: '#f4edda',
                border: '1px solid #9bab99',
                borderRadius: '4px',
                padding: '14px 18px',
                boxShadow: '0 24px 60px -12px rgba(20,20,19,0.22)',
                zIndex: 30,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                minWidth: '320px',
                maxWidth: '92vw',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #EBEAE5',
                  paddingBottom: '8px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '4px',
                      background: '#fff9e9',
                      border: '1px solid #9bab99',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#203334' }}>
                      doorbell
                    </span>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '9px',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: '#55675e',
                        fontWeight: 600,
                      }}
                    >
                      Access Request
                    </div>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#203334' }}>
                      Knock at the Door
                    </span>
                  </div>
                </div>
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
                      padding: '8px 12px',
                      background: '#fff9e9',
                      borderRadius: '4px',
                      border: '1px solid #9bab99',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '12px', color: '#203334' }}>
                      {k.visitorName}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => handleWelcomeVisitor(k.doorKey, k.visitorId)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '4px',
                          border: 'none',
                          background: '#10b981',
                          color: '#fff9e9',
                          fontWeight: 600,
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Welcome In
                      </button>
                      <button
                        onClick={() => handleDeclineVisitor(k.doorKey, k.visitorId)}
                        style={{
                          padding: '5px 10px',
                          borderRadius: '4px',
                          border: '1px solid #849388',
                          background: '#eae4cc',
                          color: '#475950',
                          fontWeight: 500,
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Decline
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
                background: '#203334',
                color: '#fff9e9',
                padding: '9px 20px',
                borderRadius: '4px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>volume_up</span>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Click anywhere to enable spatial audio</span>
            </div>
          )}

          {/* Minimap Radar Floating Card (Top-Right) */}
          {showRadar && (
            <div className="world-radar"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(15, 23, 42, 0.88)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                padding: '8px 10px',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.35)',
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                pointerEvents: 'auto',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 2px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#399c92' }}>
                    radar
                  </span>
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
                  borderRadius: '4px',
                  background: '#0b0f19',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              />
            </div>
          )}

          {/* Floating Zoom & Viewport Controls HUD (Bottom-Right) */}
          <div className="world-zoom"
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(12px)',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #849388',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)',
              zIndex: 20,
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
            <div style={{ width: '1px', height: '16px', background: '#849388', margin: '0 2px' }} />
            <button
              onClick={() => setShowRadar((v) => !v)}
              style={{
                padding: '4px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: showRadar ? '#277970' : '#64748b',
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
                color: isFullscreen ? '#277970' : '#64748b',
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

          {/* Floor coordinates are also the input plane for doors and touch movement. */}
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label="Office map. Move with WASD, arrow keys, or touch and drag. Tap a door to operate it."
            onPointerDown={e => {
              draggedRef.current = false;
              if (target !== null || e.pointerType === 'mouse') return;
              e.currentTarget.setPointerCapture(e.pointerId);
              touchRef.current = {id:e.pointerId,x:e.clientX,y:e.clientY,length:0};
            }}
            onPointerMove={e => {
              const t = touchRef.current;
              if (!t || t.id !== e.pointerId) return;
              t.dx=e.clientX-t.x; t.dy=e.clientY-t.y; t.length=Math.hypot(t.dx,t.dy);
              if(t.length>8) draggedRef.current=true;
            }}
            onLostPointerCapture={() => { touchRef.current = null; }}
            onClick={(e) => {
              if(draggedRef.current) return;
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
              const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
              const z = zoomRef.current;
              const wx = (sx - canvas.width / 2) / z + cameraRef.current.x;
              const wy = (sy - canvas.height / 2) / z + cameraRef.current.y;

              if (target !== null) {
                const hit = Object.entries(peersRef.current).find(([,p]) =>
                  Math.abs(wx-p.x)<22 && wy>=p.y-65 && wy<=p.y+6);
                selectTarget(hit?.[0] || 'pick');
                return;
              }
              // Check if user clicked a door to toggle
              if (activeTheme.hasDoors) {
                for (const [key, d] of Object.entries(doorLookup)) {
                  if (d.wall) {
                    if (touchesModel(wx, wy, 12, d.wall) || touchesModel(wx+5, wy+14, 5, d.wall)) {
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
              touchAction: 'none',
              background: '#233d3e',
            }}
          />

          {removed && <div className="tomato-exit" role="alert"><div className="splash-field" aria-hidden="true">{[0,1,2,3,4,5].map(i=><i key={i} style={{left:(8+(i*33)%87)+'%',top:(10+(i*27)%80)+'%',animationDelay:i*.09+'s'}}/>)}</div><strong>You have been thrown out!</strong></div>}
          <div className="meeting-actions" role="toolbar" aria-label="Meeting interactions">
            {penalty>0 && <output>Warning {stateRef.current.hits}/3 &middot; Mic muted for {penalty}s{stateRef.current.hits===2 && ' / Next hit removes you'}</output>}
            {(chair || stateRef.current.seat) && <button onClick={()=>action(stateRef.current.seat?'stand':'sit',{seat:chair})}>{stateRef.current.seat?'Stand up':'Sit'}</button>}
            <button aria-pressed={!!stateRef.current.raised} onClick={()=>action('hand',{raised:!stateRef.current.raised})}>&#9995; {stateRef.current.raised?'Lower':'Raise'} hand</button>
            <button disabled={cooldown>0 || target==='pick'} onClick={()=>{
              if (target) action('throw',{target,sequence:(stateRef.current.throwCount||0)+1});
              else selectTarget('pick');
            }}><span aria-hidden="true">&#127813; </span>{cooldown?cooldown+'s':target==='pick'?'Select an avatar':target?'Throw at '+(peersRef.current[target]?.username||'participant'):'Throw tomato'}</button>
            {target && <button onClick={()=>selectTarget(null)}>Cancel</button>}
            <button aria-pressed={sfx} onClick={()=>{localStorage.setItem('meeting-sfx',sfx?'off':'on');setSfx(!sfx);}}>Sounds {sfx?'on':'off'}</button>
          </div>
          {/* Floating Audio Controls HUD (Bottom-Center) */}
          <div className="world-audio"
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(20px)',
              padding: '5px 8px',
              borderRadius: '4px',
              border: '1px solid #849388',
              boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.04)',
              zIndex: 20,
              whiteSpace: 'nowrap',
              boxSizing: 'border-box',
            }}
          >
            {/* Microphone Toggle Button */}
            <button disabled={penalty>0}
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
                borderRadius: '4px',
                border: isMuted ? '1px solid #fecaca' : 'none',
                background: !micActive
                  ? '#203334'
                  : isMuted
                  ? '#fef2f2'
                  : '#10b981',
                color: isMuted ? '#dc2626' : '#fff9e9',
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
                  borderRadius: '4px',
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
                  borderRadius: '4px',
                  background: '#eae4cc',
                  border: '1px solid #849388',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title="Live voice intensity level"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '13px', color: '#55675e' }}>
                  graphic_eq
                </span>
                <div style={{ width: '40px', height: '5px', background: '#e2dcc5', borderRadius: '3px', overflow: 'hidden' }}>
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
                borderRadius: '4px',
                border: '1px solid ' + (isDeafened ? '#fecaca' : '#849388'),
                background: isDeafened ? '#fef2f2' : '#eae4cc',
                color: isDeafened ? '#dc2626' : '#203334',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.12s ease',
              }}
              title={isDeafened ? 'Click to un-deafen [D]' : 'Click to mute all incoming audio [D]'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                {isDeafened ? 'headset_off' : 'headphones'}
              </span>
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
                  borderRadius: '4px',
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
                    ? `Close door to make ${doorLookup[roomDoorKey]?.name || 'room'} private`
                    : `Open door to welcome other members in`
                }
              >
                <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                  {isRoomDoorOpen ? 'lock' : 'meeting_room'}
                </span>
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
                      borderRadius: '4px',
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
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
                      {isNearbyDoorOpen ? 'lock' : 'meeting_room'}
                    </span>
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
                              borderRadius: '4px',
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
                                borderRadius: '4px',
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
                                borderRadius: '4px',
                                border: '1px solid #849388',
                                background: '#eae4cc',
                                color: '#475950',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Cancel
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
                              borderRadius: '4px',
                              border: '1px solid #849388',
                              background: '#203334',
                              color: '#fff9e9',
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
                  </>
                )}
              </>
            )}

            {/* In-Earshot Proximity Counter */}
            <div
              style={{
                height: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0 9px',
                borderRadius: '4px',
                background: '#eae4cc',
                border: '1px solid #849388',
                fontSize: '12px',
                color: '#475950',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: inEarshotCount > 0 ? '#10b981' : '#9da698',
                  flexShrink: 0,
                }}
              />
              <span style={{ color: inEarshotCount > 0 ? '#059669' : '#475950', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {inEarshotCount} nearby
              </span>
            </div>
          </div>
        </div>

        {/* ── Right: Studio Multi-Tool Docked Side Panel ────────────────── */}
        {showSidePanel && (
          <aside
            style={{
              width: '360px',
              minWidth: '320px',
              maxWidth: '400px',
              height: '100%',
              background: '#fff9e9',
              borderLeft: '1px solid #9bab99',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '-3px 0 #203334',
              zIndex: 30,
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            {/* Panel Tab Switcher Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: '1px solid #9bab99',
                background: '#f4edda',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  onClick={() => setActiveSideTab('people')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    background: activeSideTab === 'people' ? '#203334' : 'transparent',
                    color: activeSideTab === 'people' ? '#fff9e9' : '#475950',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>group</span>
                  <span>People</span>
                  <span
                    style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: activeSideTab === 'people' ? '#333333' : '#9bab99',
                      color: activeSideTab === 'people' ? '#fff9e9' : '#475950',
                    }}
                  >
                    {peersList.length + 1}
                  </span>
                </button>

                <button
                  onClick={() => setActiveSideTab('chat')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    background: activeSideTab === 'chat' ? '#203334' : 'transparent',
                    color: activeSideTab === 'chat' ? '#fff9e9' : '#475950',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>chat</span>
                  <span>Chat</span>
                  {(chatMessages.length > 0 || privateMessages.length > 0) && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        background: activeSideTab === 'chat' ? '#333333' : '#9bab99',
                        color: activeSideTab === 'chat' ? '#fff9e9' : '#475950',
                      }}
                    >
                      {chatMessages.length + privateMessages.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => {
                    setActiveSideTab('settings');
                    refreshDiagnostics();
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '4px',
                    border: 'none',
                    background: activeSideTab === 'settings' ? '#203334' : 'transparent',
                    color: activeSideTab === 'settings' ? '#fff9e9' : '#475950',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>tune</span>
                  <span>Settings</span>
                </button>
              </div>

              <button
                onClick={() => setShowSidePanel(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#55675e',
                  cursor: 'pointer',
                  width: '26px',
                  height: '26px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '6px',
                }}
                title="Close side panel"
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
              </button>
            </div>

            {/* ── Tab 1: People & Participants ── */}
            {activeSideTab === 'people' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Search bar */}
                <div style={{ padding: '10px 14px', borderBottom: '1px solid #EBEAE5' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#f4edda',
                      border: '1px solid #849388',
                      borderRadius: '4px',
                      padding: '6px 10px',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#55675e' }}>
                      search
                    </span>
                    <input
                      type="text"
                      value={peopleFilter}
                      onChange={(e) => setPeopleFilter(e.target.value)}
                      placeholder="Search participants..."
                      style={{
                        border: 'none',
                        background: 'transparent',
                        outline: 'none',
                        fontSize: '12px',
                        color: '#203334',
                        width: '100%',
                      }}
                    />
                    {peopleFilter && (
                      <button
                        onClick={() => setPeopleFilter('')}
                        style={{ border: 'none', background: 'transparent', color: '#55675e', cursor: 'pointer' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* People List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Local User Card */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: '#f4edda',
                      borderRadius: '4px',
                      border: '1px solid #9bab99',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '4px',
                          backgroundColor: avatarColor,
                          color: '#fff9e9',
                          fontWeight: 700,
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                        }}
                      >
                        <AvatarPortrait name={username} color={avatarColor} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: '#203334' }}>{username}</span>
                          <span style={{ fontSize: '10px', color: '#277970', fontWeight: 600, background: '#e2efdf', padding: '1px 5px', borderRadius: '4px' }}>
                            You
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#55675e', marginTop: '2px' }}>
                          {currentRoom.name}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '16px', color: isMuted ? '#ef4444' : '#10b981' }}
                      >
                        {isMuted ? 'mic_off' : 'mic'}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#55675e', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '8px 0 4px' }}>
                    Connected Participants ({filteredPeers.length})
                  </div>

                  {filteredPeers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 12px', color: '#55675e', fontSize: '12px' }}>
                      {peopleFilter ? 'No participants match your search.' : 'No other members in this room yet. Share the invite link to connect.'}
                    </div>
                  ) : (
                    filteredPeers.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          background: '#fff9e9',
                          borderRadius: '4px',
                          border: '1px solid #EBEAE5',
                          transition: 'border-color 0.12s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div
                            style={{
                              width: '34px',
                              height: '34px',
                              borderRadius: '4px',
                              backgroundColor: p.avatarColor || '#a855f7',
                              color: '#fff9e9',
                              fontWeight: 700,
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                            }}
                          >
                            <AvatarPortrait name={p.username} color={p.avatarColor} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '13px', color: '#203334', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.username}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', marginTop: '2px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  backgroundColor: p.inEarshot ? '#10b981' : '#9da698',
                                }}
                              />
                              <span style={{ color: p.inEarshot ? '#059669' : '#55675e' }}>
                                {p.inEarshot ? `In earshot (${p.dist}px)` : `${p.dist}px away`}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <button
                            onClick={() => handleOpenDirectChat(p.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 9px',
                              borderRadius: '4px',
                              background: '#eae4cc',
                              border: '1px solid #849388',
                              color: '#203334',
                              fontSize: '11px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.12s ease',
                            }}
                            title={`Start private direct chat with ${p.username}`}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>chat</span>
                            <span>Chat</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Tab 2: Chat & Private Direct Messages ── */}
            {activeSideTab === 'chat' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Channel Switcher */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderBottom: '1px solid #EBEAE5',
                    background: '#f4edda',
                  }}
                >
                  <button
                    onClick={() => setChatChannel('room')}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: chatChannel === 'room' ? '#203334' : 'transparent',
                      color: chatChannel === 'room' ? '#fff9e9' : '#475950',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    Room Chat
                  </button>
                  <button
                    onClick={() => setChatChannel('direct')}
                    style={{
                      flex: 1,
                      padding: '5px 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: chatChannel === 'direct' ? '#203334' : 'transparent',
                      color: chatChannel === 'direct' ? '#fff9e9' : '#475950',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                    }}
                  >
                    Direct Messages
                  </button>
                </div>

                {/* Direct Message Recipient Selector Banner */}
                {chatChannel === 'direct' && (
                  <div
                    style={{
                      padding: '8px 14px',
                      borderBottom: '1px solid #EBEAE5',
                      background: '#e2efdf',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#277970' }}>
                        lock
                      </span>
                      <span style={{ fontSize: '11px', color: '#1e40af', fontWeight: 600 }}>
                        To:
                      </span>
                      <select
                        value={dmTargetPeerId || ''}
                        onChange={(e) => setDmTargetPeerId(e.target.value || null)}
                        style={{
                          background: '#fff9e9',
                          border: '1px solid #96bda8',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          color: '#1e40af',
                          fontWeight: 600,
                          outline: 'none',
                          cursor: 'pointer',
                          maxWidth: '160px',
                        }}
                      >
                        <option value="">Select participant...</option>
                        {peersList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.username}
                          </option>
                        ))}
                      </select>
                    </div>

                    {activeDmPeer && (
                      <span style={{ fontSize: '10px', color: '#277970', fontWeight: 600 }}>
                        Private 1:1
                      </span>
                    )}
                  </div>
                )}

                {/* Messages Feed */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {currentChatMessages.length === 0 ? (
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        color: '#55675e',
                        textAlign: 'center',
                        padding: '20px',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '32px', opacity: 0.4 }}>
                        forum
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>
                        {chatChannel === 'direct'
                          ? dmTargetPeerId
                            ? `No direct messages with ${activeDmPeer?.username || 'this user'} yet`
                            : 'Select a participant to start a private conversation'
                          : 'No room messages yet'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#9da698' }}>
                        {chatChannel === 'direct'
                          ? 'Messages are private and visible only to the two of you.'
                          : 'Send a message to everyone on the meeting floor.'}
                      </span>
                    </div>
                  ) : (
                    currentChatMessages.map((msg, i) => {
                      const isSelf = msg.from === socketRef.current?.id;
                      const ts = new Date(msg.timestamp);
                      const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: isSelf ? 'flex-end' : 'flex-start',
                            gap: '3px',
                          }}
                        >
                          {!isSelf && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '5px',
                                  backgroundColor: msg.avatarColor || '#399c92',
                                  color: '#fff9e9',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <AvatarPortrait name={msg.username} color={msg.avatarColor} />
                              </div>
                              <span style={{ fontSize: '11px', fontWeight: 600, color: '#475950' }}>
                                {msg.username}
                              </span>
                              {msg.isPrivate && (
                                <span style={{ fontSize: '9px', background: '#e2efdf', color: '#277970', padding: '1px 4px', borderRadius: '4px', fontWeight: 600 }}>
                                  DM
                                </span>
                              )}
                            </div>
                          )}
                          <div
                            style={{
                              maxWidth: '260px',
                              padding: '8px 12px',
                              borderRadius: isSelf ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                              background: isSelf ? '#203334' : '#eae4cc',
                              color: isSelf ? '#fff9e9' : '#203334',
                              fontSize: '12px',
                              lineHeight: 1.45,
                              wordBreak: 'break-word',
                            }}
                          >
                            {msg.message}
                          </div>
                          <span style={{ fontSize: '10px', color: '#9da698' }}>{timeStr}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Chat Input */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderTop: '1px solid #e2dcc5',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-end',
                    flexShrink: 0,
                    background: '#fff9e9',
                  }}
                >
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendChatMessage();
                      }
                    }}
                    placeholder={
                      chatChannel === 'direct'
                        ? dmTargetPeerId
                          ? `Message ${activeDmPeer?.username || 'user'} privately...`
                          : 'Select a participant first...'
                        : 'Message everyone in room...'
                    }
                    rows={1}
                    disabled={chatChannel === 'direct' && !dmTargetPeerId}
                    style={{
                      flex: 1,
                      padding: '8px 11px',
                      borderRadius: '4px',
                      border: '1px solid #849388',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      color: '#203334',
                      background: '#f4edda',
                      resize: 'none',
                      outline: 'none',
                      lineHeight: 1.4,
                      maxHeight: '80px',
                    }}
                  />
                  <button
                    onClick={handleSendChatMessage}
                    disabled={!chatInput.trim() || (chatChannel === 'direct' && !dmTargetPeerId)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      border: 'none',
                      background: chatInput.trim() && (chatChannel === 'room' || dmTargetPeerId) ? '#203334' : '#e2dcc5',
                      color: chatInput.trim() && (chatChannel === 'room' || dmTargetPeerId) ? '#fff9e9' : '#9da698',
                      cursor: chatInput.trim() && (chatChannel === 'room' || dmTargetPeerId) ? 'pointer' : 'not-allowed',
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
            )}

            {/* ── Tab 3: Settings & Diagnostics ── */}
            {activeSideTab === 'settings' && (
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                {/* Microphone hardware picker */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#55675e',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      Audio Input Device
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          backgroundColor: micActive && !isMuted ? '#dcfce7' : micActive && isMuted ? '#fef3c7' : '#f1f5f9',
                          color: micActive && !isMuted ? '#15803d' : micActive && isMuted ? '#b45309' : '#64748b',
                          border: `1px solid ${micActive && !isMuted ? '#86efac' : micActive && isMuted ? '#fde68a' : '#cbd5e1'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span
                          style={{
                            width: '5px',
                            height: '5px',
                            borderRadius: '50%',
                            backgroundColor: micActive && !isMuted ? '#16a34a' : micActive && isMuted ? '#d97706' : '#94a3b8',
                          }}
                        />
                        {micActive && !isMuted ? 'Active' : micActive && isMuted ? 'Muted' : 'Inactive'}
                      </span>
                      <button
                        onClick={async () => {
                          await refreshAudioInputDevices();
                          showToast('Refreshed audio devices', 'info');
                        }}
                        title="Rescan audio devices"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#55675e',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          padding: '2px',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>refresh</span>
                      </button>
                    </div>
                  </div>

                  {!micActive && (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '4px',
                        background: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        marginBottom: '8px',
                        fontSize: '11px',
                        color: '#92400E',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '15px', color: '#D97706' }}>info</span>
                        <span>Microphone permission required</span>
                      </div>
                      <p style={{ margin: 0, lineHeight: 1.4, color: '#B45309' }}>
                        Browsers hide specific microphone names until microphone access is granted. Click below to enable your mic and detect all audio devices.
                      </p>
                      <button
                        onClick={handleToggleMic}
                        style={{
                          alignSelf: 'flex-start',
                          marginTop: '2px',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: '1px solid #D97706',
                          background: '#D97706',
                          color: '#fff9e9',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>mic</span>
                        <span>Enable Microphone & Unlock Devices</span>
                      </button>
                    </div>
                  )}

                  <select
                    value={selectedMicId}
                    onChange={async (e) => {
                      const devId = e.target.value;
                      setSelectedMicId(devId);
                      try {
                        const audioCtx = spatialAudio.ensureContext();
                        await webrtc.switchAudioInputDevice(devId);
                        setMicActive(true);
                        isMutedRef.current = webrtc.isMuted;
                        setIsMuted(webrtc.isMuted);
                        showToast('Switched microphone device', 'success');
                        await refreshAudioInputDevices();
                        refreshDiagnostics();
                      } catch (err) {
                        showToast(`Could not switch mic: ${err.message}`, 'alert');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      border: '1px solid #849388',
                      background: '#f4edda',
                      fontSize: '12px',
                      color: '#203334',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="">Default System Microphone</option>
                    {micDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>

                  {/* Real-time Voice Input Level Meter */}
                  <div style={{ marginTop: '8px', padding: '6px 8px', borderRadius: '6px', background: '#eae4cc', border: '1px solid #9bab99' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: 600, color: '#475950', marginBottom: '3px' }}>
                      <span>Live Mic Input Level</span>
                      <span style={{ color: micActive && !isMuted ? '#15803d' : '#55675e' }}>
                        {micActive && !isMuted ? 'Live' : 'Muted / Inactive'}
                      </span>
                    </div>
                    <div style={{ height: '6px', background: '#9bab99', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        ref={settingsVoiceMeterRef}
                        style={{
                          width: '0%',
                          height: '100%',
                          background: '#22c55e',
                          borderRadius: '3px',
                          transition: 'width 60ms ease-out',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Spatial Audio Quick Actions */}
                <div>
                  <label
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#55675e',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      display: 'block',
                      marginBottom: '6px',
                    }}
                  >
                    Audio Engine Actions
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {micActive && (
                      <button
                        onClick={handleToggleMic}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '4px',
                          border: isMuted ? '1px solid #86efac' : '1px solid #849388',
                          background: isMuted ? '#f0fdf4' : '#f4edda',
                          color: isMuted ? '#166534' : '#203334',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                          {isMuted ? 'mic' : 'mic_off'}
                        </span>
                        <span>{isMuted ? 'Unmute Microphone' : 'Mute Microphone'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        spatialAudio.resumeAll();
                        setAudioUnlocked(true);
                        refreshDiagnostics();
                        showToast('Audio playback resumed', 'success');
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #849388',
                        background: '#f4edda',
                        color: '#203334',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>volume_up</span>
                      <span>Resume / Unlock Audio</span>
                    </button>

                    <button
                      onClick={async () => {
                        try {
                          const audioCtx = spatialAudio.ensureContext();
                          await webrtc.startMicrophone(audioCtx);
                          setMicActive(true);
                          isMutedRef.current = webrtc.isMuted;
                          setIsMuted(webrtc.isMuted);
                          await refreshAudioInputDevices();
                          refreshDiagnostics();
                          showToast('Microphone re-acquired and unmuted', 'success');
                        } catch (e) {
                          showToast(`${e.message}`, 'alert');
                        }
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #a7f3d0',
                        background: '#f0fdf4',
                        color: '#166534',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>mic</span>
                      <span>Re-acquire Microphone</span>
                    </button>

                    <button
                      onClick={() => {
                        webrtc.reconnectAllPeers();
                        refreshDiagnostics();
                        showToast('Reconnecting all peer streams...', 'info');
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #849388',
                        background: '#f4edda',
                        color: '#203334',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>sync</span>
                      <span>Force Reconnect Peers</span>
                    </button>
                  </div>
                </div>

                {/* Spatial Soundstage Physics */}
                <div
                  style={{
                    background: '#f4edda',
                    borderRadius: '4px',
                    border: '1px solid #9bab99',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#203334' }}>
                    Soundstage Acoustic Engine
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Max Earshot Radius:</span>
                    <span style={{ fontWeight: 600 }}>320 px</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Solid Wall Cutoff:</span>
                    <span style={{ fontWeight: 600 }}>-14 dB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Closed Door Isolation:</span>
                    <span style={{ fontWeight: 600 }}>-18 dB</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Audio Context State:</span>
                    <span style={{ fontWeight: 600, color: diagData?.audioCtxState === 'running' ? '#059669' : '#d97706' }}>
                      {diagData?.audioCtxState || 'Active'}
                    </span>
                  </div>
                </div>

                {/* Keyboard Hotkeys */}
                <div
                  style={{
                    background: '#f4edda',
                    borderRadius: '4px',
                    border: '1px solid #9bab99',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#203334' }}>
                    Keyboard Hotkeys
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Move Avatar:</span>
                    <kbd style={{ background: '#fff9e9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #849388' }}>W, A, S, D / Arrows</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Toggle Microphone:</span>
                    <kbd style={{ background: '#fff9e9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #849388' }}>M</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Toggle Deafen:</span>
                    <kbd style={{ background: '#fff9e9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #849388' }}>D</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Push to Talk:</span>
                    <kbd style={{ background: '#fff9e9', padding: '1px 5px', borderRadius: '4px', border: '1px solid #849388' }}>Space (Hold)</kbd>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Zoom In / Out:</span>
                    <span style={{ fontWeight: 600 }}>Mouse Scroll</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#475950' }}>
                    <span>Knock / Open Door:</span>
                    <span style={{ fontWeight: 600 }}>Click Door</span>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </main>
    </div>
  );
}
