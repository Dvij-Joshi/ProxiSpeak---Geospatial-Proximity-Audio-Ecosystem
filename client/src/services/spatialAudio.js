/**
 * Spatial Audio Engine for ProxiSpeak
 * Dynamically adjusts volume and stereo panning based on distance.
 */

export const MIN_DISTANCE = 25;  // full volume when right next to each other (<=25px)
export const MAX_DISTANCE = 130; // smooth fade to 0 silence at 130px (walk-up radius)

class SpatialAudioManager {
  constructor() {
    this.audioCtx = null;
    this.peers = new Map(); // peerId -> { source, gainNode, pannerNode, stream, audioEl }
    this.isDeafened = false;
  }

  /**
   * Initializes or resumes the AudioContext (safe to call on any user gesture).
   */
  ensureContext() {
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    } catch (e) {
      console.warn('[SpatialAudio] Could not resume audio context:', e);
    }
    return this.audioCtx;
  }

  /**
   * Attaches an incoming remote MediaStream to the audio pipeline.
   * Uses both Web Audio API for spatial panning and a direct HTMLAudioElement
   * with synchronized volume as a fallback to guarantee cross-browser playback.
   */
  attachPeerStream(peerId, mediaStream) {
    console.log(`[SpatialAudio] Attaching stream for peer ${peerId}`);
    const ctx = this.ensureContext();

    this.removePeerStream(peerId);

    try {
      // 1. Direct HTMLAudioElement for guaranteed hardware playback
      const audioEl = document.createElement('audio');
      audioEl.srcObject = mediaStream;
      audioEl.autoplay = true;
      audioEl.volume = 0; // Starts silent until distance is calculated
      audioEl.setAttribute('playsinline', 'true');
      document.body.appendChild(audioEl);

      audioEl.play().catch((err) => {
        console.warn(`[SpatialAudio] Autoplay pending user interaction for ${peerId}:`, err.message);
      });

      // 2. Web Audio API pipeline for stereo panning and filtering
      let source = null;
      let gainNode = null;
      let pannerNode = null;
      let analyser = null;

      if (ctx) {
        try {
          source = ctx.createMediaStreamSource(mediaStream);
          gainNode = ctx.createGain();
          gainNode.gain.setValueAtTime(0, ctx.currentTime);

          analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);

          if (typeof ctx.createStereoPanner === 'function') {
            pannerNode = ctx.createStereoPanner();
            pannerNode.pan.setValueAtTime(0, ctx.currentTime);
            source.connect(gainNode);
            gainNode.connect(pannerNode);
            pannerNode.connect(ctx.destination);
          } else {
            source.connect(gainNode);
            gainNode.connect(ctx.destination);
          }
        } catch (webaudioErr) {
          console.warn('[SpatialAudio] Web Audio node setup skipped, using native audio element:', webaudioErr.message);
        }
      }

      this.peers.set(peerId, {
        source,
        gainNode,
        pannerNode,
        analyser,
        stream: mediaStream,
        audioEl,
      });

      console.log(`[SpatialAudio] Successfully registered audio pipeline for ${peerId}`);
    } catch (err) {
      console.error(`[SpatialAudio] Failed to attach stream for ${peerId}:`, err);
    }
  }

  /**
   * Updates volumes and panning for all peers based on Euclidean distance.
   */
  updatePositions(localPos, peersMap) {
    if (!localPos || !peersMap) {
      return { inEarshotCount: 0, peerVolumes: {} };
    }

    const ctx = this.audioCtx;
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx ? ctx.currentTime : 0;
    let inEarshotCount = 0;
    const peerVolumes = {};
    const peerIntensities = {};

    // Calculate geometric proximity for all peers in the room
    Object.entries(peersMap).forEach(([peerId, remotePos]) => {
      if (!remotePos) return;

      const dx = remotePos.x - localPos.x;
      const dy = remotePos.y - localPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      let targetGain = 0;
      if (!this.isDeafened) {
        if (distance <= MIN_DISTANCE) {
          targetGain = 1.0;
        } else if (distance >= MAX_DISTANCE) {
          targetGain = 0.0;
        } else {
          // Smooth falloff
          const ratio = (distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
          targetGain = Math.max(0, Math.min(1, 1.0 - ratio));
        }
      }

      peerVolumes[peerId] = targetGain;

      // Count anyone within MAX_DISTANCE as in earshot
      if (distance < MAX_DISTANCE) {
        inEarshotCount++;
      }

      // Update audio output
      const peer = this.peers.get(peerId);
      if (peer) {
        // Update direct audio element volume & unpause if within earshot
        if (peer.audioEl) {
          peer.audioEl.volume = Math.max(0, Math.min(1, targetGain));
          if (targetGain > 0.05 && peer.audioEl.paused) {
            peer.audioEl.play().catch(() => {});
          }
        }

        // Update Web Audio API nodes if active
        if (peer.gainNode && ctx) {
          peer.gainNode.gain.setTargetAtTime(targetGain, now, 0.05);
        }
        if (peer.pannerNode && ctx) {
          const panValue = Math.max(-1, Math.min(1, dx / MAX_DISTANCE));
          peer.pannerNode.pan.setTargetAtTime(panValue, now, 0.05);
        }

        // Measure live voice intensity from remote stream using time-domain amplitude
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

    return { inEarshotCount, peerVolumes, peerIntensities };
  }

  /**
   * Cleans up audio nodes and hidden audio element when a peer leaves.
   */
  removePeerStream(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      if (peer.gainNode) peer.gainNode.disconnect();
      if (peer.pannerNode) peer.pannerNode.disconnect();
      if (peer.source) peer.source.disconnect();
      if (peer.audioEl) {
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
          peer.gainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.05);
        }
      }
    });
    return this.isDeafened;
  }

  /**
   * Disposes the entire audio context and all peer connections.
   */
  destroy() {
    this.peers.forEach((_, peerId) => this.removePeerStream(peerId));
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}

export const spatialAudio = new SpatialAudioManager();
