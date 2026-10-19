/**
 * WebRTC Mesh Manager for ProxiSpeak
 * Handles peer connection lifecycle, W3C Perfect Negotiation (glare-free),
 * ICE candidate queuing, microphone capture, and live voice activity detection.
 */

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

class WebRTCManager {
  constructor() {
    this.socket = null;
    this.localStream = null;
    this.peers = new Map(); // peerId -> RTCPeerConnection
    this.peerMeta = new Map(); // peerId -> { isMakingOffer: boolean, isIgnoringOffer: boolean }
    this.iceCandidateQueues = new Map(); // peerId -> RTCIceCandidate[]
    this.isMuted = true; // default to muted
    this.currentRoomId = 'main-office';

    this.onRemoteTrackCallback = null;
    this.onMuteStatusCallback = null;
    this.onVoiceActivityCallback = null;

    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.silenceGain = null;
    this.animFrame = null;
    this.isSpeaking = false;
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
  init(socket, { onRemoteTrack, onMuteStatus, onVoiceActivity }) {
    this.socket = socket;
    this.onRemoteTrackCallback = onRemoteTrack;
    this.onMuteStatusCallback = onMuteStatus;
    this.onVoiceActivityCallback = onVoiceActivity;

    this.socket.on('webrtc-offer', async ({ from, offer }) => {
      try {
        console.log(`[WebRTC] Received offer from ${from}`);
        const pc = this.getOrCreatePeer(from, false);
        const meta = this.getPeerMeta(from);

        // Deterministic politeness: peer with lexicographically smaller socket ID yields
        const isPolite = this.socket && this.socket.id > from;
        const offerCollision = meta.isMakingOffer || pc.signalingState !== 'stable';

        meta.isIgnoringOffer = !isPolite && offerCollision;
        if (meta.isIgnoringOffer) {
          console.warn(`[WebRTC] Glare detected with ${from}; impolite peer ignoring colliding offer`);
          return;
        }

        if (offerCollision && isPolite) {
          console.log(`[WebRTC] Glare detected with ${from}; polite peer rolling back local offer`);
          await pc.setLocalDescription({ type: 'rollback' });
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Flush any queued ICE candidates that arrived before remote description
        await this.flushIceCandidateQueue(from, pc);

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
          // Queue candidate until peer connection and remote description exist
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
        this.onMuteStatusCallback(id, isMuted);
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
   * Requests microphone access and sends audio tracks to all peers.
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

      // Attach audio track to all active peer connections
      this.peers.forEach((pc, peerId) => {
        const senders = pc.getSenders ? pc.getSenders() : [];
        const audioSender = senders.find((s) => !s.track || s.track.kind === 'audio');

        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack).then(() => {
            console.log(`[WebRTC] Replaced track with mic for ${peerId}`);
          }).catch((e) => {
            console.warn('[WebRTC] replaceTrack error:', e);
          });

          // Only initiate offer if transceiver was not already sendrecv
          const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
          const audioTransceiver = transceivers.find((t) => t.sender === audioSender || t.receiver?.track?.kind === 'audio');
          if (audioTransceiver && audioTransceiver.direction !== 'sendrecv') {
            audioTransceiver.direction = 'sendrecv';
            this.initiateOffer(peerId, pc);
          }
        } else if (audioTrack) {
          pc.addTrack(audioTrack, this.localStream);
          this.initiateOffer(peerId, pc);
        }
      });

      // Broadcast unmuted state to room
      if (this.socket) {
        this.socket.emit('user-mute-status', { isMuted: false, roomId: this.currentRoomId });
      }

      this.setupVoiceActivityDetection(stream);
      console.log('[WebRTC] Microphone stream active');
      return stream;
    } catch (err) {
      console.warn('[WebRTC] Microphone error:', err.message);
      throw err;
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
    const pc = new RTCPeerConnection(ICE_CONFIG);
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

      // When track un-mutes in Chromium, re-trigger callback to ensure active audio pipeline
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
  toggleMute(roomId = 'main-office') {
    this.isMuted = !this.isMuted;
    this.currentRoomId = roomId;

    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.isMuted;
      }
    }

    if (this.socket) {
      this.socket.emit('user-mute-status', { isMuted: this.isMuted, roomId });
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

      // Resume context if suspended
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          console.log('[WebRTC] AudioContext resumed, state:', this.audioContext.state);
        }).catch(() => {});
      }

      // Disconnect existing nodes if re-initializing
      if (this.sourceNode) {
        try { this.sourceNode.disconnect(); } catch (_e) {}
      }
      if (this.analyser) {
        try { this.analyser.disconnect(); } catch (_e) {}
      }
      if (this.silenceGain) {
        try { this.silenceGain.disconnect(); } catch (_e) {}
      }

      // Keep persistent reference to avoid garbage collection
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
        const avg = sum / dataArray.length; // Deviation from baseline silence (128)

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
    // Ambient silence is ~0.1-0.4. Soft speech is 1.2-4. Normal speech is 5-25.
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
    // Do not close shared AudioContext, only release reference
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
