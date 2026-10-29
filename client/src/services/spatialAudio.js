/**
 * Spatial Audio & Acoustic Environment Engine for ProxiSpeak
 * Features:
 *  - 3D Euclidean distance attenuation with natural logarithmic falloff
 *  - Multi-theme acoustic mapping (Corporate Office, Conference Auditorium, Rooftop Lounge)
 *  - Interactive Room Doors (Open to welcome members, Close for private soundproof meetings)
 *  - Wall & Obstacle Raycasting Occlusion & Low-pass acoustic muffling
 *  - Resilient Dual-Engine Playback (Web Audio API 3D Panning + HTML5 Audio Element Fallback)
 *  - Comprehensive Browser Autoplay Recovery & Audio Unlock
 */

export const MIN_DISTANCE = 30;
export const MAX_DISTANCE = 420; // 420px hearing range on 1200px canvas for clear pod-to-pod voice

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
    isIsolated: true,
    maxDistance: 360,
  },
  {
    id: 'manager-office',
    name: "Manager's Office",
    bounds: { x1: 350, y1: 18, x2: 590, y2: 235 },
    isIsolated: true,
    maxDistance: 320,
  },
  {
    id: 'tech-server',
    name: 'Tech / Server',
    bounds: { x1: 860, y1: 18, x2: 1182, y2: 245 },
    isIsolated: false,
    maxDistance: 320,
  },
  {
    id: 'lounge-break',
    name: 'Lounge & Break',
    bounds: { x1: 18, y1: 485, x2: 300, y2: 670 },
    isIsolated: false,
    maxDistance: 320,
  },
  {
    id: 'print-copy',
    name: 'Print / Copy',
    bounds: { x1: 935, y1: 480, x2: 1182, y2: 670 },
    isIsolated: false,
    maxDistance: 300,
  },
];

export function getRoomAt(x, y, theme = 'office') {
  if (theme === 'conference') {
    if (x >= 280 && x <= 920 && y <= 170) {
      return { id: 'keynote-stage', name: 'Keynote Stage (PA Broadcast)', isIsolated: false, isStage: true, maxDistance: 900 };
    }
    if (x >= 280 && x <= 920 && y > 170 && y <= 495) {
      return { id: 'auditorium-hall', name: 'Auditorium Hall', isIsolated: false, maxDistance: 450 };
    }
    if (x < 280 && y <= 495) {
      return { id: 'breakout-a', name: 'Breakout Pod A', isIsolated: true, maxDistance: 320 };
    }
    if (x > 915 && y <= 495) {
      return { id: 'breakout-b', name: 'Breakout Pod B', isIsolated: true, maxDistance: 320 };
    }
    return { id: 'conf-foyer', name: 'Networking Foyer', isIsolated: false, maxDistance: 350 };
  }

  if (theme === 'lounge') {
    if (x < 295 && y <= 475) {
      return { id: 'vip-booths', name: 'VIP Fireside Booths', isIsolated: true, maxDistance: 320 };
    }
    if (x > 895 && y <= 475) {
      return { id: 'games-rec', name: 'Games & Rec Room', isIsolated: true, maxDistance: 320 };
    }
    if (y > 475) {
      return { id: 'sunset-terrace', name: 'Sunset Open-Air Terrace', isIsolated: false, maxDistance: 380 };
    }
    return { id: 'cocktail-bar', name: 'Central Espresso Bar', isIsolated: false, maxDistance: 380 };
  }

  // Office default
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
  return { id: 'open-workspace', name: 'Open Workspace', isIsolated: false, maxDistance: MAX_DISTANCE };
}

function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-9) return false;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function isDoorOpen(doorStates, doorKey) {
  if (!doorStates || !doorKey) return true;
  const d = doorStates[doorKey];
  if (typeof d === 'boolean') return d;
  if (typeof d?.isOpen === 'boolean') return d.isOpen;
  return true;
}

export function countWallIntersections(x1, y1, x2, y2, doorStates = {}) {
  let count = 0;
  for (const w of WALLS) {
    if (w.w === W - 20 || w.h === H - 20) continue;

    const hit =
      lineSegmentsIntersect(x1, y1, x2, y2, w.x, w.y, w.x + w.w, w.y) ||
      lineSegmentsIntersect(x1, y1, x2, y2, w.x, w.y + w.h, w.x + w.w, w.y + w.h) ||
      lineSegmentsIntersect(x1, y1, x2, y2, w.x, w.y, w.x, w.y + w.h) ||
      lineSegmentsIntersect(x1, y1, x2, y2, w.x + w.w, w.y, w.x + w.w, w.y + w.h);

    if (hit) count++;
  }

  Object.entries(DOORS).forEach(([key, door]) => {
    const isOpen = isDoorOpen(doorStates, key);
    if (!isOpen && door.wall) {
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

export function calculateAcoustics(localPos, remotePos, doorStates = {}, theme = 'office') {
  const dx = remotePos.x - localPos.x;
  const dy = remotePos.y - localPos.y;
  const distance = Math.hypot(dx, dy);

  const localRoom = getRoomAt(localPos.x, localPos.y, theme);
  const remoteRoom = getRoomAt(remotePos.x, remotePos.y, theme);

  let targetGain = 0;
  let filterFreq = 20000;
  let status = 'clear';

  // Special Conference Stage PA System broadcast:
  if (theme === 'conference' && remoteRoom.isStage) {
    if (localRoom.id === 'auditorium-hall' || localRoom.isStage) {
      targetGain = 1.0;
      filterFreq = 20000;
      status = 'stage-broadcast';
      return { distance, wallHits: 0, localRoom, remoteRoom, targetGain, filterFreq, status, dx, dy };
    }
  }

  // Same enclosed room
  const sameRoom = localRoom.id === remoteRoom.id && localRoom.id !== 'open-workspace';
  if (sameRoom) {
    const maxD = localRoom.maxDistance || 360;
    if (distance <= MIN_DISTANCE) {
      targetGain = 1.0;
    } else if (distance >= maxD) {
      targetGain = 0.0;
    } else {
      const ratio = (distance - MIN_DISTANCE) / (maxD - MIN_DISTANCE);
      targetGain = Math.max(0.25, Math.pow(1 - ratio, 1.15));
    }
    filterFreq = 20000;
    status = 'in-room';
    return { distance, wallHits: 0, localRoom, remoteRoom, targetGain, filterFreq, status, dx, dy };
  }

  // Office layout acoustic raycasting with doors
  if (theme === 'office') {
    const wallHits = countWallIntersections(localPos.x, localPos.y, remotePos.x, remotePos.y, doorStates);

    if ((localRoom.isIsolated || remoteRoom.isIsolated) && localRoom.id !== remoteRoom.id) {
      const isolatedRoom = localRoom.isIsolated ? localRoom : remoteRoom;
      const isDoorClosed = !isDoorOpen(doorStates, isolatedRoom.id);

      if (isDoorClosed || wallHits > 0) {
        targetGain = 0.0;
        filterFreq = 300;
        status = isDoorClosed ? 'door-closed' : 'blocked-wall';
      } else {
        const doorwayMaxD = 220;
        if (distance < doorwayMaxD) {
          const ratio = distance / doorwayMaxD;
          targetGain = Math.pow(1 - ratio, 1.25) * 0.75;
          filterFreq = 2200;
          status = 'doorway';
        } else {
          targetGain = 0.0;
          status = 'blocked-wall';
        }
      }
    } else if (wallHits > 0) {
      const maxD = MAX_DISTANCE;
      if (distance < maxD) {
        const baseGain = Math.pow(1 - distance / maxD, 1.2);
        targetGain = baseGain * Math.pow(0.35, wallHits);
        filterFreq = Math.max(450, Math.round(20000 / Math.pow(3.5, wallHits)));
        status = 'occluded';
      } else {
        targetGain = 0.0;
        status = 'clear';
      }
    } else {
      const maxD = MAX_DISTANCE;
      if (distance <= MIN_DISTANCE) {
        targetGain = 1.0;
      } else if (distance >= maxD) {
        targetGain = 0.0;
      } else {
        // Natural gradual falloff curve: maintains solid audible volume (60-90%) at normal desk distances
        const ratio = (distance - MIN_DISTANCE) / (maxD - MIN_DISTANCE);
        targetGain = Math.max(0.04, Math.pow(1 - ratio, 0.75));
      }
      filterFreq = 20000;
      status = 'clear';
    }

    return { distance, wallHits, localRoom, remoteRoom, targetGain, filterFreq, status, dx, dy };
  }

  // Conference & Lounge general spaces
  const maxD = localRoom.maxDistance || MAX_DISTANCE;
  if (distance <= MIN_DISTANCE) {
    targetGain = 1.0;
  } else if (distance >= maxD) {
    targetGain = 0.0;
  } else {
    const ratio = (distance - MIN_DISTANCE) / (maxD - MIN_DISTANCE);
    targetGain = Math.max(0.04, Math.pow(1 - ratio, 0.75));
  }
  filterFreq = 20000;
  status = 'clear';

  return { distance, wallHits: 0, localRoom, remoteRoom, targetGain, filterFreq, status, dx, dy };
}

export function playKnockSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + i * 35, now + i * 0.14);
      osc.frequency.exponentialRampToValueAtTime(80, now + i * 0.14 + 0.07);

      gain.gain.setValueAtTime(0.45, now + i * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.14);
      osc.stop(now + i * 0.14 + 0.1);
    }
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch (_e) {}
}

export function playUiChime(type) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === 'mute') {
      // Soft downward two-tone beep (mute)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.12);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'unmute') {
      // Crisp upward chime (unmute)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'deafen') {
      // Low dual frequency tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(150, now + 0.18);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'undeafen') {
      // Gentle twin bell chime
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i === 0 ? 440 : 660, now + i * 0.08);
        gain.gain.setValueAtTime(0.16, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.16);
      }
    } else if (type === 'peer-enter') {
      // Welcoming bell ping when a peer enters earshot
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    }

    setTimeout(() => ctx.close().catch(() => {}), 450);
  } catch (_e) {}
}

class SpatialAudioManager {
  constructor() {
    this.audioCtx = null;
    this.peers = new Map();
    this.isDeafened = false;
    this.keepAliveOsc = null;
    this.keepAliveGain = null;
    // iOS Safari treats audioEl.volume < 1.0 as silent and won't decode RTP audio
    this._isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  startKeepAlive(ctx) {
    if (this.keepAliveOsc || !ctx || ctx.state === 'closed') return;
    try {
      this.keepAliveOsc = ctx.createOscillator();
      this.keepAliveOsc.type = 'sine';
      this.keepAliveOsc.frequency.value = 100;

      this.keepAliveGain = ctx.createGain();
      this.keepAliveGain.gain.setValueAtTime(0.00001, ctx.currentTime);

      this.keepAliveOsc.connect(this.keepAliveGain);
      this.keepAliveGain.connect(ctx.destination);
      this.keepAliveOsc.start();
      console.log('[SpatialAudio] Silent keep-alive oscillator active');
    } catch (e) {
      console.warn('[SpatialAudio] Keepalive oscillator error:', e);
    }
  }

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
        this.audioCtx.resume().catch(() => {});
      }
      if (this.audioCtx && this.audioCtx.state === 'running') {
        this.startKeepAlive(this.audioCtx);
      }
    } catch (e) {
      console.warn('[SpatialAudio] Could not initialize audio context:', e);
    }
    return this.audioCtx;
  }

  isAudioUnlocked() {
    return Boolean(this.audioCtx && this.audioCtx.state === 'running');
  }

  /**
   * Resumes AudioContext and triggers play() on all peer audio elements.
   * MUST be invoked directly from user gestures (click/keydown/tap).
   */
  resumeAll() {
    // Ensure context exists (critical for Safari where it may not be created yet)
    this.ensureContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().then(() => {
        console.log('[SpatialAudio] AudioContext resumed via user gesture');
      }).catch(() => {});
    }
    this.peers.forEach((peer) => {
      if (peer.audioEl) {
        if (peer.audioEl.paused && !peer._playPending) {
          peer._playPending = true;
          peer.audioEl.play().catch(() => {}).finally(() => { peer._playPending = false; });
        }
        // On iOS, ensure audio element is not stuck muted
        if (this._isIOS && !peer.usingWebAudio) {
          peer.audioEl.muted = false;
        }
      }
    });
  }

  /**
   * Attaches an incoming remote MediaStream to the audio pipeline.
   * Supports resilient dual-engine playback with iOS-specific handling:
   *   1. Web Audio API with stereo panning & acoustic filter
   *   2. Direct HTMLAudioElement fallback (primary on iOS when Web Audio unavailable)
   */
  attachPeerStream(peerId, mediaStream) {
    console.log(`[SpatialAudio] Attaching stream for peer ${peerId}`);
    const ctx = this.ensureContext();

    const existing = this.peers.get(peerId);
    if (existing && existing.stream) {
      const existingTrack = existing.stream.getAudioTracks()[0];
      const newTrack = mediaStream.getAudioTracks()[0];
      if (existingTrack && newTrack && existingTrack.id === newTrack.id && existingTrack.readyState === 'live') {
        console.log(`[SpatialAudio] Track ${newTrack.id} already active for ${peerId}`);
        if (existing.audioEl && existing.audioEl.paused) {
          existing.audioEl.play().catch(() => {});
        }
        return;
      }
    }

    this.removePeerStream(peerId);

    try {
      // Detect iOS for audio element volume workarounds
      // iOS Safari ignores volume values < 1.0 and treats near-zero as silent
      const isiOS = this._isIOS;

      // 1. HTMLAudioElement — keeps Chromium RTP decoder active; primary output on iOS
      const audioEl = document.createElement('audio');
      audioEl.srcObject = mediaStream;
      audioEl.autoplay = true;
      audioEl.playsInline = true;
      audioEl.setAttribute('playsinline', 'true');
      audioEl.muted = false;
      // iOS: must set volume=1.0 so the audio element actually decodes & plays.
      // Non-iOS: 0.0001 keeps the decoder alive without audible echo while Web Audio handles output.
      audioEl.volume = isiOS ? 1.0 : 0.0001;
      document.body.appendChild(audioEl);

      audioEl.play().catch((err) => {
        console.warn(`[SpatialAudio] Autoplay pending user interaction for ${peerId}:`, err.message);
      });

      // 2. Web Audio API pipeline (spatial panning, distance attenuation, wall muffling)
      let source = null;
      let filterNode = null;
      let gainNode = null;
      let pannerNode = null;
      let analyser = null;
      let usingWebAudio = false;

      if (ctx && ctx.state !== 'closed') {
        try {
          source = ctx.createMediaStreamSource(mediaStream);

          filterNode = ctx.createBiquadFilter();
          filterNode.type = 'lowpass';
          filterNode.frequency.setValueAtTime(20000, ctx.currentTime);
          filterNode.Q.setValueAtTime(1.0, ctx.currentTime);

          gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0, ctx.currentTime);

          analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          source.connect(filterNode);
          filterNode.connect(gainNode);

          if (typeof ctx.createStereoPanner === 'function') {
            pannerNode = ctx.createStereoPanner();
            pannerNode.pan.setValueAtTime(0, ctx.currentTime);
            gainNode.connect(pannerNode);
            // On iOS Safari, Web Audio API output is muted by the hardware silent switch
            // and WebKit createMediaStreamSource often outputs silence.
            // Therefore, on iOS, HTMLAudioElement is the primary audible output.
            if (!isiOS) {
              pannerNode.connect(ctx.destination);
            }
          } else {
            if (!isiOS) {
              gainNode.connect(ctx.destination);
            }
          }

          usingWebAudio = !isiOS;

          // On iOS, keep audioEl UNMUTED as primary audio engine
          if (isiOS) {
            audioEl.muted = false;
            audioEl.volume = 1.0;
          }
        } catch (webaudioErr) {
          console.warn('[SpatialAudio] Web Audio setup skipped, using native audio fallback:', webaudioErr.message);
          usingWebAudio = false;
          // Restore iOS audio element to full volume for direct playback
          if (isiOS) {
            audioEl.muted = false;
            audioEl.volume = 1.0;
          }
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

      console.log(`[SpatialAudio] Audio pipeline active for ${peerId} (WebAudio: ${usingWebAudio}, iOS: ${isiOS})`);
    } catch (err) {
      console.error(`[SpatialAudio] Failed to attach stream for ${peerId}:`, err);
    }
  }

  /**
   * Updates volumes, low-pass filters, and panning for all peers based on Euclidean distance,
   * active canvas theme, and interactive door states.
   */
  updatePositions(localPos, peersMap, doorStates = {}, theme = 'office') {
    if (!localPos || !peersMap) {
      return { inEarshotCount: 0, peerVolumes: {}, peerIntensities: {}, peerAcoustics: {}, localRoom: getRoomAt(0, 0, theme) };
    }

    const ctx = this.audioCtx;
    const now = ctx ? ctx.currentTime : 0;
    const isWebAudioLive = Boolean(ctx && ctx.state === 'running');

    let inEarshotCount = 0;
    const peerVolumes = {};
    const peerIntensities = {};
    const peerAcoustics = {};

    const localRoom = getRoomAt(localPos.x, localPos.y, theme);

    Object.entries(peersMap).forEach(([peerId, remotePos]) => {
      if (!remotePos) return;

      const acoustic = calculateAcoustics(localPos, remotePos, doorStates, theme);
      let targetGain = this.isDeafened ? 0 : acoustic.targetGain;
      const targetFilterFreq = this.isDeafened ? 350 : acoustic.filterFreq;

      peerVolumes[peerId] = targetGain;
      peerAcoustics[peerId] = {
        ...acoustic,
        effectiveGain: targetGain,
      };

      if (targetGain > 0.04) {
        inEarshotCount++;
      }

      const peer = this.peers.get(peerId);
      if (peer) {
        if (peer.usingWebAudio && peer.gainNode && isWebAudioLive) {
          peer.gainNode.gain.setTargetAtTime(targetGain, now, 0.03);

          if (peer.filterNode) {
            peer.filterNode.frequency.setTargetAtTime(targetFilterFreq, now, 0.03);
          }

          if (peer.pannerNode) {
            const panValue = Math.max(-1, Math.min(1, acoustic.dx / (MAX_DISTANCE * 0.75)));
            peer.pannerNode.pan.setTargetAtTime(panValue, now, 0.03);
          }

          // In Web Audio mode, audioEl keeps decoder alive
          if (peer.audioEl) {
            if (this._isIOS) {
              // iOS: audioEl is the primary playback device! Control muted status by distance
              peer.audioEl.volume = 1.0;
              peer.audioEl.muted = this.isDeafened || targetGain < 0.04;
            } else {
              peer.audioEl.muted = false;
              peer.audioEl.volume = targetGain > 0.04 ? 0.0001 : 0;
            }
            if (peer.audioEl.paused && targetGain > 0.04 && !peer._playPending) {
              peer._playPending = true;
              peer.audioEl.play().catch(() => {}).finally(() => { peer._playPending = false; });
            }
          }
        } else if (peer.audioEl) {
          // Direct audio element fallback if Web Audio is suspended/unsupported
          peer.audioEl.muted = this.isDeafened;
          if (this._isIOS) {
            // iOS ignores fractional volume; use muted property for on/off control
            peer.audioEl.volume = 1.0;
            peer.audioEl.muted = this.isDeafened || targetGain < 0.04;
          } else {
            peer.audioEl.volume = this.isDeafened ? 0 : Math.max(0, Math.min(1, targetGain));
          }
          if (targetGain > 0.04 && peer.audioEl.paused && !peer._playPending) {
            peer._playPending = true;
            peer.audioEl.play().catch(() => {}).finally(() => { peer._playPending = false; });
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
    } catch (_e) {}

    this.peers.delete(peerId);
    console.log(`[SpatialAudio] Cleaned up peer audio: ${peerId}`);
  }

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

