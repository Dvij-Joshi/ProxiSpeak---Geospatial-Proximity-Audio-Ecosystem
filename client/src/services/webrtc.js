/**
 * WebRTC Mesh Manager for ProxiSpeak
 * Handles peer connection lifecycle, W3C Perfect Negotiation (glare-free),
 * ICE candidate queuing, dynamic STUN/TURN fallback, microphone capture,
 * and live voice activity detection.
 */

import { SERVER_URL } from '../config';

// High-availability default STUN + TURN relays for cross-NAT / mobile / hosted connectivity
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

class WebRTCManager {
  constructor() {
    this.socket = null;
    this.localStream = null;
    this.peers = new Map(); // peerId -> RTCPeerConnection
    this.peerMeta = new Map(); // peerId -> { isMakingOffer: boolean, isIgnoringOffer: boolean }
    this.iceCandidateQueues = new Map(); // peerId -> RTCIceCandidate[]
    this.isMuted = true;
    this.currentRoomId = 'main-office';
    this.iceServers = DEFAULT_ICE_SERVERS;

    this.onRemoteTrackCallback = null;
    this.onMuteStatusCallback = null;
    this.onVoiceActivityCallback = null;

    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.silenceGain = null;
    this.animFrame = null;
    this.isSpeaking = false;

    // Fetch server configured ICE servers in background
    this.fetchIceServers();
  }

  async fetchIceServers() {
    try {
      const res = await fetch(`${SERVER_URL}/api/ice-servers`);
      if (res.ok) {
        const data = await res.json();
        if (data.iceServers && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
          console.log('[WebRTC] Loaded ICE servers from backend:', this.iceServers.length);
        }
      }
    } catch (_e) {
      // Fallback already active
    }
  }

  getIceConfig() {
    return {
      iceServers: this.iceServers || DEFAULT_ICE_SERVERS,
      iceCandidatePoolSize: 2,
    };
  }

  setRoomId(roomId) {
    if (roomId) {
      this.currentRoomId = roomId;
    }
  }

  getPeerMeta(peerId) {
    if (!this.peerMeta.has(peerId)) {
      this.peerMeta.set(peerId, { isMakingOffer: false, isIgnoringOffer: false });
    }
    return this.peerMeta.get(peerId);
  }

  /**
   * Initializes WebRTC signaling on the active socket.
   */
  init(socket, { roomId, onRemoteTrack, onMuteStatus, onVoiceActivity } = {}) {
    this.socket = socket;
    if (roomId) {
      this.currentRoomId = roomId;
    }
    this.onRemoteTrackCallback = onRemoteTrack;
    this.onMuteStatusCallback = onMuteStatus;
    this.onVoiceActivityCallback = onVoiceActivity;

    this.socket.off('webrtc-offer');
    this.socket.off('webrtc-answer');
    this.socket.off('webrtc-ice-candidate');
    this.socket.off('user-mute-status');

    this.socket.on('webrtc-offer', async ({ from, offer }) => {
      try {
        console.log(`[WebRTC] Received offer from ${from}`);
        const pc = this.getOrCreatePeer(from, false);
        const meta = this.getPeerMeta(from);

        // Deterministic politeness: peer with lexicographically smaller socket ID yields
        const isPolite = Boolean(this.socket && this.socket.id > from);
        const offerCollision = meta.isMakingOffer || pc.signalingState !== 'stable';

        meta.isIgnoringOffer = !isPolite && offerCollision;
        if (meta.isIgnoringOffer) {
          console.warn(`[WebRTC] Glare detected with ${from}; impolite peer ignoring colliding offer`);
          return;
        }

        if (offerCollision && isPolite && pc.signalingState === 'have-local-offer') {
          console.log(`[WebRTC] Glare detected with ${from}; polite peer rolling back local offer`);
          try {
            await pc.setLocalDescription({ type: 'rollback' });
          } catch (rbErr) {
            console.warn('[WebRTC] Rollback error:', rbErr.message);
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Flush any queued ICE candidates that arrived before remote description
        await this.flushIceCandidateQueue(from, pc);

        // Ensure our local audio track is attached so the answer includes bidirectional audio
        if (this.localStream) {
          const audioTrack = this.localStream.getAudioTracks()[0];
          if (audioTrack) {
            const senders = pc.getSenders ? pc.getSenders() : [];
            const hasTrack = senders.some((s) => s.track && s.track.id === audioTrack.id);
            if (!hasTrack) {
              const emptySender = senders.find((s) => !s.track || s.track.kind === 'audio');
              if (emptySender) {
                await emptySender.replaceTrack(audioTrack);
              } else {
                pc.addTrack(audioTrack, this.localStream);
              }
            }
          }
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('webrtc-answer', { to: from, answer });
        console.log(`[WebRTC] Sent answer to ${from}`);
      } catch (err) {
        console.error('[WebRTC] Error handling offer from', from, err);
      }
    });

    this.socket.on('webrtc-answer', async ({ from, answer }) => {
      try {
        console.log(`[WebRTC] Received answer from ${from}`);
        const pc = this.peers.get(from);
        if (pc) {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await this.flushIceCandidateQueue(from, pc);
          } else {
            console.warn(`[WebRTC] Ignoring answer from ${from} in state ${pc.signalingState}`);
          }
        }
      } catch (err) {
        console.error('[WebRTC] Error handling answer from', from, err);
      }
    });

    this.socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      try {
        if (!candidate) return;
        const pc = this.peers.get(from);
        if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
          if (!this.iceCandidateQueues.has(from)) {
            this.iceCandidateQueues.set(from, []);
          }
          this.iceCandidateQueues.get(from).push(candidate);
          return;
        }

        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        const meta = this.getPeerMeta(from);
        if (!meta.isIgnoringOffer) {
          console.warn('[WebRTC] Error adding ICE candidate from', from, err.message);
        }
      }
    });

    this.socket.on('user-mute-status', ({ id, isMuted }) => {
      if (this.onMuteStatusCallback) {
        this.onMuteStatusCallback(id, Boolean(isMuted));
      }
    });
  }

  async flushIceCandidateQueue(peerId, pc) {
    const queue = this.iceCandidateQueues.get(peerId);
    if (queue && queue.length > 0) {
      for (const cand of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (_e) {}
      }
      this.iceCandidateQueues.delete(peerId);
    }
  }

  /**
   * Requests microphone access, attaches tracks, and immediately initiates
   * renegotiation offers to all active peers so audio transmits in real time.
   */
  async startMicrophone(sharedAudioContext = null) {
    if (sharedAudioContext && (!this.audioContext || this.audioContext.state === 'closed')) {
      this.audioContext = sharedAudioContext;
    }

    if (this.localStream) {
      this.isMuted = false;
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
      }
      if (this.socket) {
        this.socket.emit('user-mute-status', { isMuted: false, roomId: this.currentRoomId });
      }
      // Re-trigger offer to ensure all peers have our track active
      this.peers.forEach((pc, peerId) => {
        this.initiateOffer(peerId, pc);
      });
      return this.localStream;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.localStream = stream;
      this.isMuted = false;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
      }

      // Attach audio track to all active peer connections & trigger renegotiation
      this.peers.forEach((pc, peerId) => {
        const senders = pc.getSenders ? pc.getSenders() : [];
        const audioSender = senders.find((s) => s.track && s.track.kind === 'audio');

        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack).then(() => {
            console.log(`[WebRTC] Replaced track with mic for ${peerId}`);
          }).catch((e) => {
            console.warn('[WebRTC] replaceTrack error:', e);
          });
        } else if (audioTrack) {
          try {
            pc.addTrack(audioTrack, this.localStream);
          } catch (_e) {
            const emptySender = senders.find((s) => !s.track || s.track.kind === 'audio');
            if (emptySender) {
              emptySender.replaceTrack(audioTrack).catch(() => {});
            }
          }
        }

        // CRITICAL: Always initiate offer so the remote peer receives the updated SDP
        // with the active audio track, triggers ontrack, and attaches the stream!
        this.initiateOffer(peerId, pc);
      });

      // Broadcast unmuted state to room
      if (this.socket) {
        this.socket.emit('user-mute-status', { isMuted: false, roomId: this.currentRoomId });
      }

      this.setupVoiceActivityDetection(stream);
      console.log('[WebRTC] Microphone stream active, broadcasted to room:', this.currentRoomId);
      return stream;
    } catch (err) {
      console.warn('[WebRTC] Microphone error:', err.name, err.message);
      let userMsg = err.message || 'Could not access microphone';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        userMsg = 'Microphone permission was denied. Please allow microphone access in your browser site permissions.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        userMsg = 'No microphone device was detected on your system. Please connect an audio input device.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        userMsg = 'Your microphone is currently in use by another application. Please close other meeting apps.';
      }
      const customErr = new Error(userMsg);
      customErr.originalName = err.name;
      throw customErr;
    }
  }

  /**
   * Creates or gets an RTCPeerConnection for a remote peer.
   */
  getOrCreatePeer(peerId, isInitiator = false) {
    if (this.peers.has(peerId)) {
      return this.peers.get(peerId);
    }

    console.log(`[WebRTC] Creating RTCPeerConnection for ${peerId} (initiator: ${isInitiator})`);
    const pc = new RTCPeerConnection(this.getIceConfig());
    this.peers.set(peerId, pc);

    // If local microphone already exists, attach track directly with stream ID
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        pc.addTrack(audioTrack, this.localStream);
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
    } else {
      // Pre-create audio transceiver so SDP negotiates audio channel immediately
      pc.addTransceiver('audio', { direction: 'sendrecv' });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('webrtc-ice-candidate', {
          to: peerId,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote audio track from ${peerId}`, event);
      const remoteStream =
        event.streams && event.streams[0]
          ? event.streams[0]
          : new MediaStream([event.track]);

      if (this.onRemoteTrackCallback) {
        this.onRemoteTrackCallback(peerId, remoteStream);
      }

      event.track.onunmute = () => {
        console.log(`[WebRTC] Remote track unmuted for ${peerId}`);
        if (this.onRemoteTrackCallback) {
          this.onRemoteTrackCallback(peerId, remoteStream);
        }
      };

      event.track.onmute = () => {
        console.warn(`[WebRTC] Remote track muted by sender or network for ${peerId}`);
      };

      event.track.onended = () => {
        console.warn(`[WebRTC] Remote track ended for ${peerId}`);
      };
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${peerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed with ${peerId}, attempting ICE restart...`);
        try {
          pc.restartIce();
          this.initiateOffer(peerId, pc);
        } catch (_e) {}
      }
    };

    if (isInitiator) {
      this.initiateOffer(peerId, pc);
    }

    return pc;
  }

  /**
   * Initiates an SDP offer to connect with a peer.
   */
  async initiateOffer(peerId, pc) {
    const meta = this.getPeerMeta(peerId);
    try {
      meta.isMakingOffer = true;
      if (pc.signalingState !== 'stable') {
        console.warn(`[WebRTC] Cannot initiate offer to ${peerId}, signalingState is ${pc.signalingState}`);
        return;
      }
      const offer = await pc.createOffer();
      if (pc.signalingState !== 'stable') return;

      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc-offer', { to: peerId, offer });
      console.log(`[WebRTC] Sent offer to ${peerId}`);
    } catch (err) {
      console.error(`[WebRTC] Failed to create offer to ${peerId}:`, err);
    } finally {
      meta.isMakingOffer = false;
    }
  }

  /**
   * Connects to a newly discovered peer in the room.
   */
  connectToPeer(peerId) {
    this.getOrCreatePeer(peerId, true);
  }

  /**
   * Removes a disconnected peer.
   */
  removePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    this.peerMeta.delete(peerId);
    this.iceCandidateQueues.delete(peerId);
  }

  /**
   * Toggles microphone mute state.
   */
  toggleMute(roomId) {
    this.isMuted = !this.isMuted;
    const targetRoom = roomId || this.currentRoomId;
    this.currentRoomId = targetRoom;

    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.isMuted;
      }
    }

    if (this.socket) {
      this.socket.emit('user-mute-status', { isMuted: this.isMuted, roomId: targetRoom });
    }

    return this.isMuted;
  }

  /**
   * Detects speaking activity using AnalyserNode.
   */
  setupVoiceActivityDetection(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioContextClass();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          console.log('[WebRTC] AudioContext resumed, state:', this.audioContext.state);
        }).catch(() => {});
      }

      if (this.sourceNode) {
        try { this.sourceNode.disconnect(); } catch (_e) {}
      }
      if (this.analyser) {
        try { this.analyser.disconnect(); } catch (_e) {}
      }
      if (this.silenceGain) {
        try { this.silenceGain.disconnect(); } catch (_e) {}
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      this.silenceGain = this.audioContext.createGain();
      this.silenceGain.gain.setValueAtTime(0, this.audioContext.currentTime);

      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.silenceGain);
      this.silenceGain.connect(this.audioContext.destination);

      console.log('[WebRTC] VAD pipeline connected, AudioContext state:', this.audioContext.state);

      const dataArray = new Uint8Array(this.analyser.fftSize);

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += Math.abs(dataArray[i] - 128);
        }
        const avg = sum / dataArray.length;

        const speaking = !this.isMuted && avg > 1.5;

        if (speaking !== this.isSpeaking) {
          this.isSpeaking = speaking;
          if (this.onVoiceActivityCallback) {
            this.onVoiceActivityCallback(speaking);
          }
        }

        this.animFrame = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('[WebRTC] Voice activity detector initialization skipped:', e);
    }
  }

  /**
   * Returns current microphone voice intensity between 0 and 1.0.
   */
  getLocalVoiceIntensity() {
    if (!this.analyser || this.isMuted) return 0;

    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    const dataArray = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += Math.abs(dataArray[i] - 128);
    }
    const avg = sum / dataArray.length;
    const net = Math.max(0, avg - 0.4);
    const normalized = Math.min(1, Math.max(0, net / 10));
    return Math.pow(normalized, 0.7);
  }

  /**
   * Cleans up all media streams and peer connections.
   */
  closeAll() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
      this.animFrame = null;
    }
    if (this.silenceGain) {
      try { this.silenceGain.disconnect(); } catch (_e) {}
      this.silenceGain = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (_e) {}
      this.sourceNode = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (_e) {}
      this.analyser = null;
    }
    this.audioContext = null;

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.peerMeta.clear();
    this.iceCandidateQueues.clear();
  }
}

export const webrtc = new WebRTCManager();
