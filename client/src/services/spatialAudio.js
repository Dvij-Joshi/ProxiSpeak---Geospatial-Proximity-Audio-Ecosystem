/**
 * Spatial Audio Engine for ProxiSpeak
 * Uses Web Audio API to dynamically adjust gain (volume) and stereo panning
 * based on the 2D Euclidean distance between the local avatar and remote avatars.
 */

export const MIN_DISTANCE = 25;  // full volume when right next to each other (<=25px)
export const MAX_DISTANCE = 130; // smooth fade to 0 silence at 130px (intimate walk-up radius)

class SpatialAudioManager {
  constructor() {
    this.audioCtx = null;
    this.peers = new Map(); // peerId -> { source, gainNode, pannerNode, stream, audioEl }
    this.isDeafened = false;
  }

  /**
   * Initializes or resumes the AudioContext (must be called after user interaction).
   */
  ensureContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Attaches an incoming remote MediaStream to the Web Audio spatial pipeline.
   * Pipeline: Source -> GainNode (distance) -> StereoPannerNode (left/right) -> Destination
   */
  attachPeerStream(peerId, mediaStream) {
    const ctx = this.ensureContext();

    // Clean up any existing pipeline for this peer
    this.removePeerStream(peerId);

    try {
      // Hidden audio element to ensure the stream stays active across browser engines
      const audioEl = document.createElement('audio');
      audioEl.srcObject = mediaStream;
      audioEl.muted = true; // muted because Web Audio API handles the playback
      audioEl.autoplay = true;
      audioEl.play().catch(() => {});

      const source = ctx.createMediaStreamSource(mediaStream);
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0, ctx.currentTime); // start silent until distance is calculated

      let pannerNode = null;
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

      this.peers.set(peerId, {
        source,
        gainNode,
        pannerNode,
        stream: mediaStream,
        audioEl,
      });

      console.log(`[SpatialAudio] Attached stream for peer: ${peerId}`);
    } catch (err) {
      console.error(`[SpatialAudio] Failed to attach stream for ${peerId}:`, err);
    }
  }

  /**
   * Updates volumes and panning for all connected peers based on current positions.
   * @param {{ x: number, y: number }} localPos
   * @param {Record<string, { x: number, y: number }>} peersMap
   * @returns {{ inEarshotCount: number, peerVolumes: Record<string, number> }}
   */
  updatePositions(localPos, peersMap) {
    if (!this.audioCtx || !localPos) {
      return { inEarshotCount: 0, peerVolumes: {} };
    }

    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    let inEarshotCount = 0;
    const peerVolumes = {};

    this.peers.forEach((peer, peerId) => {
      const remotePos = peersMap[peerId];
      if (!remotePos) {
        peer.gainNode.gain.setTargetAtTime(0, now, 0.05);
        peerVolumes[peerId] = 0;
        return;
      }

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
          // Smooth linear falloff
          targetGain = 1.0 - (distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
          // Curve it slightly for natural sound perception (square root curve)
          targetGain = Math.max(0, Math.min(1, Math.pow(targetGain, 1.2)));
        }
      }

      // Smooth gain transition to avoid audio clicks
      peer.gainNode.gain.setTargetAtTime(targetGain, now, 0.05);
      peerVolumes[peerId] = targetGain;

      if (targetGain > 0.05) {
        inEarshotCount++;
      }

      // 3D Stereo panning based on relative horizontal coordinate
      if (peer.pannerNode) {
        const panValue = Math.max(-1, Math.min(1, dx / MAX_DISTANCE));
        peer.pannerNode.pan.setTargetAtTime(panValue, now, 0.05);
      }
    });

    return { inEarshotCount, peerVolumes };
  }

  /**
   * Cleans up audio nodes and hidden audio element when a peer leaves.
   */
  removePeerStream(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      peer.gainNode.disconnect();
      if (peer.pannerNode) peer.pannerNode.disconnect();
      peer.source.disconnect();
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
    if (this.audioCtx) {
      const now = this.audioCtx.currentTime;
      this.peers.forEach((peer) => {
        if (this.isDeafened) {
          peer.gainNode.gain.setTargetAtTime(0, now, 0.05);
        }
      });
    }
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
