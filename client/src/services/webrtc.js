/**
 * WebRTC Mesh Manager for ProxiSpeak
 * Handles peer connection lifecycle, STUN negotiation, microphone stream capture,
 * and live voice activity detection.
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
    this.iceCandidateQueues = new Map(); // peerId -> RTCIceCandidate[]
    this.isMuted = true; // default to muted
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
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await this.flushIceCandidateQueue(from, pc);
        }
      } catch (err) {
        console.error('[WebRTC] Error handling answer from', from, err);
      }
    });

    this.socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      try {
        const pc = this.peers.get(from);
        if (pc && candidate) {
          if (!pc.remoteDescription || !pc.remoteDescription.type) {
            // Queue candidate until remote description is set
            if (!this.iceCandidateQueues.has(from)) {
              this.iceCandidateQueues.set(from, []);
            }
            this.iceCandidateQueues.get(from).push(candidate);
          } else {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        }
      } catch (err) {
        console.warn('[WebRTC] Error adding ICE candidate from', from, err.message);
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
  async startMicrophone() {
    if (this.localStream) return this.localStream;

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
        const senders = pc.getSenders();
        const audioSender = senders.find((s) => !s.track || s.track.kind === 'audio');

        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack).catch((e) => {
            console.warn('[WebRTC] replaceTrack error:', e);
          });
        } else if (audioTrack) {
          pc.addTrack(audioTrack, stream);
          this.initiateOffer(peerId, pc);
        }
      });

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

    // Pre-create audio transceiver so SDP negotiates audio channel immediately
    pc.addTransceiver('audio', { direction: 'sendrecv' });

    // If local microphone already exists, attach track
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        const sender = pc.getSenders().find((s) => !s.track || s.track.kind === 'audio');
        if (sender) {
          sender.replaceTrack(audioTrack).catch(() => {});
        } else {
          pc.addTrack(audioTrack, this.localStream);
        }
      }
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
      console.log(`[WebRTC] Received remote audio track from ${peerId}`);
      const remoteStream =
        event.streams && event.streams[0]
          ? event.streams[0]
          : new MediaStream([event.track]);

      if (this.onRemoteTrackCallback) {
        this.onRemoteTrackCallback(peerId, remoteStream);
      }
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
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc-offer', { to: peerId, offer });
      console.log(`[WebRTC] Sent offer to ${peerId}`);
    } catch (err) {
      console.error(`[WebRTC] Failed to create offer to ${peerId}:`, err);
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
    this.iceCandidateQueues.delete(peerId);
  }

  /**
   * Toggles microphone mute state.
   */
  toggleMute(roomId = 'main-office') {
    this.isMuted = !this.isMuted;

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
        });
      }

      // Keep persistent reference to avoid Chrome garbage collecting the source
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;

      // Connect source to analyser
      this.sourceNode.connect(this.analyser);

      // Connect to zero-gain node -> destination to guarantee Chrome's audio engine
      // pulls data continuously without outputting any feedback loop
      this.silenceGain = this.audioContext.createGain();
      this.silenceGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.analyser.connect(this.silenceGain);
      this.silenceGain.connect(this.audioContext.destination);

      console.log('[WebRTC] VAD pipeline initialized with persistent silent sink');

      const dataArray = new Uint8Array(this.analyser.fftSize);
      let debugCount = 0;

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += Math.abs(dataArray[i] - 128);
        }
        const avg = sum / dataArray.length; // Deviation from baseline silence (128)

        if (debugCount < 60) {
          debugCount++;
          if (debugCount % 20 === 0) {
            console.log(`[WebRTC] VAD dev=${avg.toFixed(2)} ctx=${this.audioContext.state} muted=${this.isMuted}`);
          }
        }

        const speaking = !this.isMuted && avg > 3.0;

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
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += Math.abs(dataArray[i] - 128);
    }
    const avg = sum / dataArray.length;
    // Ambient silence is ~0.5-1.5. Normal speech is 5-30.
    const net = Math.max(0, avg - 1.2);
    // Exponential curve for natural volume response
    const normalized = Math.min(1, Math.max(0, net / 16));
    return Math.pow(normalized, 0.75);
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
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
    this.iceCandidateQueues.clear();
  }
}

export const webrtc = new WebRTCManager();
