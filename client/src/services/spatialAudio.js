/**
 * Spatial Audio & Acoustic Environment Engine for ProxiSpeak
 * Features:
 *  - 3D Euclidean distance attenuation with natural logarithmic falloff
 *  - Stereo panning (left/right ear binaural positioning)
 *  - Wall & Obstacle Raycasting Occlusion
 *  - Interactive Room Doors (Open to welcome members, Close for private soundproof meetings)
 *  - Doorway acoustic diffraction (sound enters/exits through open doorways)
 *  - BiquadFilterNode low-pass acoustic muffling through partitions
 *  - Chromium WebRTC audio keep-alive without decoder mute
 */

export const MIN_DISTANCE = 25;
export const MAX_DISTANCE = 130;

const W = 1200;
const H = 680;

export const WALLS = [
  { x: 10,     y: 10,     w: W - 20, h: 8      },
  { x: 10,     y: 10,     w: 8,      h: H - 20 },
  { x: W - 18, y: 10,     w: 8,      h: H - 20 },
  { x: 10,     y: H - 18, w: W - 20, h: 8      },
  { x: 313,    y: 18,     w: 8,      h: 188    },
  { x: 18,     y: 261,    w: 258,    h: 8      },
  { x: 353,    y: 18,     w: 8,      h: 215    },
  { x: 583,    y: 18,     w: 8,      h: 215    },
  { x: 361,    y: 228,    w: 182,    h: 8      },
  { x: 863,    y: 18,     w: 8,      h: 137    },
  { x: 871,    y: 238,    w: 311,    h: 8      },
  { x: 18,     y: 487,    w: 222,    h: 8      },
  { x: 291,    y: 487,    w: 8,      h: H - 505 },
  { x: 937,    y: 490,    w: 8,      h: 80     },
  { x: 945,    y: 485,    w: 237,    h: 8      },
  { x: 863,    y: 155,    w: 8,      h: 8      },
];

export const DOORS = {
  'meeting-room': {
    roomKey: 'meeting-room',
    name: 'Meeting Room',
    wall: { x: 276, y: 261, w: 42, h: 8 },
    arc: [276, 261, 40, -Math.PI / 2, 0],
    isIsolated: true,
  },
  'manager-office': {
    roomKey: 'manager-office',
    name: "Manager's Office",
    wall: { x: 543, y: 228, w: 43, h: 8 },
    arc: [543, 228, 43, -Math.PI / 2, 0],
    isIsolated: true,
  },
  'lounge-break': {
    roomKey: 'lounge-break',
    name: 'Lounge & Break',
    wall: { x: 240, y: 487, w: 56, h: 8 },
    arc: [240, 487, 56, Math.PI, Math.PI * 1.5],
    isIsolated: false,
  },
  'tech-server': {
    roomKey: 'tech-server',
    name: 'Tech / Server',
    wall: { x: 863, y: 155, w: 8, h: 70 },
    arc: [863, 155, 70, 0, Math.PI / 2],
    isIsolated: false,
  },
  'print-copy': {
    roomKey: 'print-copy',
    name: 'Print / Copy',
    wall: { x: 937, y: 570, w: 8, h: 65 },
    arc: [937, 570, 65, 0, Math.PI / 2],
    isIsolated: false,
  },
};

export const ROOMS = [
  {
    id: 'meeting-room',
    name: 'Meeting Room',
    bounds: { x1: 18, y1: 18, x2: 320, y2: 268 },
    isIsolated: true, // Meeting room has soundproof walls
    maxDistance: 270,  // Everyone in meeting room hears clearly across table
  },
  {
    id: 'manager-office',
    name: "Manager's Office",
    bounds: { x1: 350, y1: 18, x2: 590, y2: 235 },
    isIsolated: true,
    maxDistance: 230,
  },
  {
    id: 'tech-server',
    name: 'Tech / Server',
    bounds: { x1: 860, y1: 18, x2: 1182, y2: 245 },
    isIsolated: false,
    maxDistance: 240,
  },
  {
    id: 'lounge-break',
    name: 'Lounge & Break',
    bounds: { x1: 18, y1: 485, x2: 300, y2: 670 },
    isIsolated: false,
    maxDistance: 220,
  },
  {
    id: 'print-copy',
    name: 'Print / Copy',
    bounds: { x1: 935, y1: 480, x2: 1182, y2: 670 },
    isIsolated: false,
    maxDistance: 200,
  },
];

export function getRoomAt(x, y) {
  for (const room of ROOMS) {
    if (
      x >= room.bounds.x1 &&
      x <= room.bounds.x2 &&
      y >= room.bounds.y1 &&
      y <= room.bounds.y2
    ) {
      return room;
    }
  }
  return { id: 'open-workspace', name: 'Open Workspace', isIsolated: false, maxDistance: 130 };
}

function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return false;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/**
 * Determines if a room door is open.
 * Defaults to true (accessible/open) for all rooms if never accessed or unconfigured.
 */
export function isDoorOpen(doorStates, doorKey) {
  if (!doorStates || !doorKey) return true;
  const d = doorStates[doorKey];
  if (typeof d === 'boolean') return d;
  if (typeof d?.isOpen === 'boolean') return d.isOpen;
  return true; // Default open for first-time access and empty rooms
}

export function countWallIntersections(x1, y1, x2, y2, doorStates = {}) {
  let count = 0;
  for (const w of WALLS) {
    // Only check interior walls (ignore outer boundary walls)
    if (w.w === W - 20 || w.h === H - 20) continue;

    const hit =
      lineSegmentsIntersect(x1, y1, x2, y2, w.x, w.y, w.x + w.w, w.y) ||
      lineSegmentsIntersect(x1, y1, x2, y2, w.x, w.y + w.h, w.x + w.w, w.y + w.h) ||
      lineSegmentsIntersect(x1, y1, x2, y2, w.x, w.y, w.x, w.y + w.h) ||
      lineSegmentsIntersect(x1, y1, x2, y2, w.x + w.w, w.y, w.x + w.w, w.y + w.h);

    if (hit) count++;
  }

  // Closed door barriers act as solid acoustic walls
  Object.entries(DOORS).forEach(([roomKey, door]) => {
    const isClosed = !isDoorOpen(doorStates, roomKey);
    if (isClosed) {
      const dw = door.wall;
      const hit =
        lineSegmentsIntersect(x1, y1, x2, y2, dw.x, dw.y, dw.x + dw.w, dw.y) ||
        lineSegmentsIntersect(x1, y1, x2, y2, dw.x, dw.y + dw.h, dw.x + dw.w, dw.y + dw.h) ||
        lineSegmentsIntersect(x1, y1, x2, y2, dw.x, dw.y, dw.x, dw.y + dw.h) ||
        lineSegmentsIntersect(x1, y1, x2, y2, dw.x + dw.w, dw.y, dw.x + dw.w, dw.y + dw.h);

      if (hit) count++;
    }
  });

  return count;
}

export function calculateAcoustics(localPos, remotePos, doorStates = {}) {
  const dx = remotePos.x - localPos.x;
  const dy = remotePos.y - localPos.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  const localRoom = getRoomAt(localPos.x, localPos.y);
  const remoteRoom = getRoomAt(remotePos.x, remotePos.y);
  const wallHits = countWallIntersections(localPos.x, localPos.y, remotePos.x, remotePos.y, doorStates);

  let targetGain = 0;
  let filterFreq = 20000;
  let status = 'clear';

  const sameRoom = localRoom.id === remoteRoom.id && localRoom.id !== 'open-workspace';

  if (sameRoom) {
    // 1. Both participants in the same enclosed room
    const maxD = localRoom.maxDistance;
    if (distance <= MIN_DISTANCE) {
      targetGain = 1.0;
    } else if (distance >= maxD) {
      targetGain = 0.0;
    } else {
      const ratio = (distance - MIN_DISTANCE) / (maxD - MIN_DISTANCE);
      // High intelligibility within room with natural acoustic presence
      targetGain = Math.max(0.18, Math.pow(1 - ratio, 1.25));
    }
    filterFreq = 20000;
    status = 'in-room';
  } else if ((localRoom.isIsolated || remoteRoom.isIsolated) && localRoom.id !== remoteRoom.id) {
    // 2. One person is inside an isolated room (Meeting Room / Manager's Office), the other is outside
    const isolatedRoom = localRoom.isIsolated ? localRoom : remoteRoom;
    const isDoorClosed = !isDoorOpen(doorStates, isolatedRoom.id);

    if (isDoorClosed || wallHits > 0) {
      // Soundproof wall or closed door blocks speech transmission completely
      targetGain = 0.0;
      filterFreq = 300;
      status = isDoorClosed ? 'door-closed' : 'blocked-wall';
    } else {
      // Line of sight passes through the open doorway
      const doorwayMaxD = 145;
      if (distance < doorwayMaxD) {
        const ratio = distance / doorwayMaxD;
        targetGain = Math.pow(1 - ratio, 1.4) * 0.65; // Doorway acoustic diffraction
        filterFreq = 1800; // Mild doorway diffraction
        status = 'doorway';
      } else {
        targetGain = 0.0;
        status = 'blocked-wall';
      }
    }
  } else if (wallHits > 0) {
    // 3. Non-isolated partition or interior obstacles
    const maxD = 130;
    if (distance < maxD) {
      const baseGain = Math.pow(1 - distance / maxD, 1.4);
      // Heavy wall absorption & muffled low-pass filter
      targetGain = baseGain * Math.pow(0.18, wallHits);
      filterFreq = Math.max(350, Math.round(20000 / Math.pow(4.5, wallHits)));
      status = 'occluded';
    } else {
      targetGain = 0.0;
      status = 'clear';
    }
  } else {
    // 4. Open workspace direct line of sight
    const maxD = 130;
    if (distance <= MIN_DISTANCE) {
      targetGain = 1.0;
    } else if (distance >= maxD) {
      targetGain = 0.0;
    } else {
      const ratio = (distance - MIN_DISTANCE) / (maxD - MIN_DISTANCE);
      targetGain = Math.pow(1 - ratio, 1.35);
    }
    filterFreq = 20000;
    status = 'clear';
  }

  return {
    distance,
    wallHits,
    localRoom,
    remoteRoom,
    targetGain,
    filterFreq,
    status,
    dx,
    dy,
  };
}

class SpatialAudioManager {
  constructor() {
    this.audioCtx = null;
    this.peers = new Map(); // peerId -> { source, filterNode, gainNode, pannerNode, analyser, stream, audioEl, usingWebAudio }
    this.isDeafened = false;
    this.keepAliveOsc = null;
    this.keepAliveGain = null;
  }

  /**
   * Starts a silent oscillator keep-alive to prevent the browser from putting AudioContext to sleep.
   */
  startKeepAlive(ctx) {
    if (this.keepAliveOsc || !ctx || ctx.state === 'closed') return;
    try {
      this.keepAliveOsc = ctx.createOscillator();
      this.keepAliveOsc.type = 'sine';
      this.keepAliveOsc.frequency.value = 100;

      this.keepAliveGain = ctx.createGain();
      // Tiny inaudible signal keeps Web Audio hardware pipeline alive forever
      this.keepAliveGain.gain.setValueAtTime(0.00001, ctx.currentTime);

      this.keepAliveOsc.connect(this.keepAliveGain);
      this.keepAliveGain.connect(ctx.destination);
      this.keepAliveOsc.start();
      console.log('[SpatialAudio] Silent keep-alive oscillator active (prevents AudioContext sleep/suspend)');
    } catch (e) {
      console.warn('[SpatialAudio] Keepalive oscillator error:', e);
    }
  }

  /**
   * Initializes or resumes the AudioContext (safe to call on any user gesture).
   */
  ensureContext() {
    try {
      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
          this.audioCtx.addEventListener('statechange', () => {
            console.log('[SpatialAudio] AudioContext state changed:', this.audioCtx?.state);
            if (this.audioCtx?.state === 'suspended') {
              this.audioCtx.resume().catch(() => {});
            }
          });
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch((err) => {
          console.warn('[SpatialAudio] Could not resume audio context:', err);
        });
      }
      if (this.audioCtx && this.audioCtx.state === 'running') {
        this.startKeepAlive(this.audioCtx);
      }
    } catch (e) {
      console.warn('[SpatialAudio] Could not initialize audio context:', e);
    }
    return this.audioCtx;
  }

  /**
   * Attaches an incoming remote MediaStream to the audio pipeline.
   * Web Audio API handles:
   *   source -> BiquadFilterNode (occlusion/muffle) -> GainNode (distance) -> StereoPannerNode (3D) -> destination
   */
  attachPeerStream(peerId, mediaStream) {
    console.log(`[SpatialAudio] Attaching stream for peer ${peerId}`);
    const ctx = this.ensureContext();

    // Avoid tearing down and recreating active audio graphs on subsequent track events
    const existing = this.peers.get(peerId);
    if (existing && existing.source && existing.stream) {
      const existingTrack = existing.stream.getAudioTracks()[0];
      const newTrack = mediaStream.getAudioTracks()[0];
      if (existingTrack && newTrack && existingTrack.id === newTrack.id) {
        console.log(`[SpatialAudio] Track ${newTrack.id} already active for ${peerId}, preserving pipeline.`);
        if (existing.audioEl && existing.audioEl.paused) {
          existing.audioEl.play().catch(() => {});
        }
        return;
      }
    }

    this.removePeerStream(peerId);

    try {
      // 1. Direct HTMLAudioElement (keeps Chromium RTP decoder active without echo)
      const audioEl = document.createElement('audio');
      audioEl.srcObject = mediaStream;
      audioEl.autoplay = true;
      audioEl.muted = false; // MUST be false so Chromium does not hardware-mute the WebRTC decoder!
      audioEl.volume = 0.0001; // Tiny volume keeps Chrome's media clock ticking
      audioEl.setAttribute('playsinline', 'true');
      document.body.appendChild(audioEl);

      audioEl.play().catch((err) => {
        console.warn(`[SpatialAudio] Autoplay pending user interaction for ${peerId}:`, err.message);
      });

      // 2. Web Audio API pipeline with acoustic filter
      let source = null;
      let filterNode = null;
      let gainNode = null;
      let pannerNode = null;
      let analyser = null;
      let usingWebAudio = false;

      if (ctx && ctx.state !== 'closed') {
        try {
          source = ctx.createMediaStreamSource(mediaStream);

          // Acoustic Low-pass Filter Node for wall muffling
          filterNode = ctx.createBiquadFilter();
          filterNode.type = 'lowpass';
          filterNode.frequency.setValueAtTime(20000, ctx.currentTime);
          filterNode.Q.setValueAtTime(1.0, ctx.currentTime);

          // Distance Attenuation Gain Node
          gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0, ctx.currentTime);

          // Voice Intensity Analyser Node (connected to raw source)
          analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          // Connect source -> filterNode -> gainNode
          source.connect(filterNode);
          filterNode.connect(gainNode);

          // 3D Stereo Panning
          if (typeof ctx.createStereoPanner === 'function') {
            pannerNode = ctx.createStereoPanner();
            pannerNode.pan.setValueAtTime(0, ctx.currentTime);
            gainNode.connect(pannerNode);
            pannerNode.connect(ctx.destination);
          } else {
            gainNode.connect(ctx.destination);
          }

          usingWebAudio = true;
        } catch (webaudioErr) {
          console.warn('[SpatialAudio] Web Audio node setup skipped, using native audio fallback:', webaudioErr.message);
          usingWebAudio = false;
        }
      }

      this.peers.set(peerId, {
        source,
        filterNode,
        gainNode,
        pannerNode,
        analyser,
        stream: mediaStream,
        audioEl,
        usingWebAudio,
      });

      console.log(`[SpatialAudio] Audio pipeline active for ${peerId} (WebAudio: ${usingWebAudio})`);
    } catch (err) {
      console.error(`[SpatialAudio] Failed to attach stream for ${peerId}:`, err);
    }
  }

  /**
   * Updates volumes, low-pass filters, and panning for all peers based on Euclidean distance,
   * room/wall acoustic raycasting, and interactive door states.
   */
  updatePositions(localPos, peersMap, doorStates = {}) {
    if (!localPos || !peersMap) {
      return { inEarshotCount: 0, peerVolumes: {}, peerIntensities: {}, peerAcoustics: {}, localRoom: getRoomAt(0, 0) };
    }

    const ctx = this.audioCtx;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx ? ctx.currentTime : 0;
    let inEarshotCount = 0;
    const peerVolumes = {};
    const peerIntensities = {};
    const peerAcoustics = {};

    const localRoom = getRoomAt(localPos.x, localPos.y);

    Object.entries(peersMap).forEach(([peerId, remotePos]) => {
      if (!remotePos) return;

      const acoustic = calculateAcoustics(localPos, remotePos, doorStates);
      let targetGain = this.isDeafened ? 0 : acoustic.targetGain;
      const targetFilterFreq = this.isDeafened ? 350 : acoustic.filterFreq;

      peerVolumes[peerId] = targetGain;
      peerAcoustics[peerId] = {
        ...acoustic,
        effectiveGain: targetGain,
      };

      // In earshot if audible
      if (targetGain > 0.04) {
        inEarshotCount++;
      }

      // Update Web Audio pipeline
      const peer = this.peers.get(peerId);
      if (peer) {
        if (peer.usingWebAudio && peer.gainNode && ctx && ctx.state === 'running') {
          // Smooth volume ramp
          peer.gainNode.gain.setTargetAtTime(targetGain, now, 0.03);

          // Smooth lowpass filter ramp (muffles sound through walls)
          if (peer.filterNode) {
            peer.filterNode.frequency.setTargetAtTime(targetFilterFreq, now, 0.03);
          }

          // 3D Stereo panning
          if (peer.pannerNode) {
            const panValue = Math.max(-1, Math.min(1, acoustic.dx / 130));
            peer.pannerNode.pan.setTargetAtTime(panValue, now, 0.03);
          }

          // Keep audio element active with tiny non-zero volume so Chrome never considers it inaudible
          if (peer.audioEl) {
            peer.audioEl.muted = false;
            peer.audioEl.volume = targetGain > 0.04 ? 0.0001 : 0;
            if (peer.audioEl.paused) {
              peer.audioEl.play().catch(() => {});
            }
          }
        } else if (peer.audioEl) {
          // Direct audio element fail-safe (if Web Audio is suspended or unavailable)
          peer.audioEl.muted = this.isDeafened;
          peer.audioEl.volume = this.isDeafened ? 0 : Math.max(0, Math.min(1, targetGain));
          if (targetGain > 0.04 && peer.audioEl.paused) {
            peer.audioEl.play().catch(() => {});
          }
        }

        // Live voice intensity measurement
        if (peer.analyser) {
          const data = new Uint8Array(peer.analyser.fftSize);
          peer.analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += Math.abs(data[i] - 128);
          const avg = sum / data.length;
          const net = Math.max(0, avg - 0.4);
          const normalized = Math.min(1, Math.max(0, net / 10));
          peerIntensities[peerId] = Math.pow(normalized, 0.7);
        } else {
          peerIntensities[peerId] = 0;
        }
      } else {
        peerIntensities[peerId] = 0;
      }
    });

    return { inEarshotCount, peerVolumes, peerIntensities, peerAcoustics, localRoom };
  }

  /**
   * Cleans up audio nodes and hidden audio element when a peer leaves.
   */
  removePeerStream(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      if (peer.filterNode) peer.filterNode.disconnect();
      if (peer.gainNode) peer.gainNode.disconnect();
      if (peer.pannerNode) peer.pannerNode.disconnect();
      if (peer.source) peer.source.disconnect();
      if (peer.analyser) peer.analyser.disconnect();
      if (peer.audioEl) {
        peer.audioEl.pause();
        peer.audioEl.srcObject = null;
        peer.audioEl.remove();
      }
    } catch (_e) {
      // already disconnected
    }

    this.peers.delete(peerId);
    console.log(`[SpatialAudio] Cleaned up peer audio: ${peerId}`);
  }

  /**
   * Toggles deafen state (muting all incoming peer audio).
   */
  setDeafened(deafened) {
    this.isDeafened = Boolean(deafened);
    this.peers.forEach((peer) => {
      if (this.isDeafened) {
        if (peer.audioEl) peer.audioEl.volume = 0;
        if (peer.gainNode && this.audioCtx) {
          peer.gainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.04);
        }
      }
    });
    return this.isDeafened;
  }

  /**
   * Disposes the entire audio context and all peer connections.
   */
  destroy() {
    if (this.keepAliveOsc) {
      try {
        this.keepAliveOsc.stop();
        this.keepAliveOsc.disconnect();
      } catch (_e) {}
      this.keepAliveOsc = null;
    }
    if (this.keepAliveGain) {
      try {
        this.keepAliveGain.disconnect();
      } catch (_e) {}
      this.keepAliveGain = null;
    }
    this.peers.forEach((_, peerId) => this.removePeerStream(peerId));
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

export const spatialAudio = new SpatialAudioManager();

/**
 * Synthesizes a realistic double wooden door knock sound using Web Audio API.
 * Completely self-contained without external audio assets.
 */
export function playKnockSound() {
  try {
    const ctx = spatialAudio.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const now = ctx.currentTime;
    [0, 0.13].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now + offset);
      osc.frequency.exponentialRampToValueAtTime(38, now + offset + 0.08);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(450, now + offset);
      filter.Q.setValueAtTime(3.0, now + offset);

      gain.gain.setValueAtTime(0.4, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + offset);
      osc.stop(now + offset + 0.09);
    });
  } catch (e) {
    console.warn('[KnockSound] AudioContext error:', e);
  }
}
