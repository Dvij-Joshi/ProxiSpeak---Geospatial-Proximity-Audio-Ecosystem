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
    this.isMuted = true; // start muted by default for privacy
    this.onRemoteTrackCallback = null;
    this.onMuteStatusCallback = null;
    this.onVoiceActivityCallback = null;

    // Audio analyser for detecting local speaking activity
    this.audioContext = null;
    this.analyser = null;
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
        const pc = this.getOrCreatePeer(from, false);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('webrtc-answer', { to: from, answer });
      } catch (err) {
        console.error('[WebRTC] Error handling offer from', from, err);
      }
    });

    this.socket.on('webrtc-answer', async ({ from, answer }) => {
      try {
        const pc = this.peers.get(from);
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch (err) {
        console.error('[WebRTC] Error handling answer from', from, err);
      }
    });

    this.socket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      try {
        const pc = this.peers.get(from);
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('[WebRTC] Error adding ICE candidate from', from, err);
      }
    });

    this.socket.on('user-mute-status', ({ id, isMuted }) => {
      if (this.onMuteStatusCallback) {
        this.onMuteStatusCallback(id, isMuted);
      }
    });
  }

  /**
   * Requests microphone access from the user and initializes the audio stream.
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

      // Apply initial mute setting
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !this.isMuted;
      }

      // Add local audio track to all existing peer connections
      this.peers.forEach((pc) => {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      });

      this.setupVoiceActivityDetection(stream);

      console.log('[WebRTC] Microphone stream acquired successfully');
      return stream;
    } catch (err) {
      console.warn('[WebRTC] Microphone access denied or unavailable:', err.message);
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

    const pc = new RTCPeerConnection(ICE_CONFIG);
    this.peers.set(peerId, pc);

    // If microphone is already active, attach tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream);
      });
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
      console.log(`[WebRTC] Received remote track from peer: ${peerId}`);
      if (event.streams && event.streams[0] && this.onRemoteTrackCallback) {
        this.onRemoteTrackCallback(peerId, event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        console.log(`[WebRTC] Connection state ${pc.connectionState} for peer: ${peerId}`);
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
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc-offer', { to: peerId, offer });
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

    // Broadcast updated mute state to everyone in the room
    if (this.socket) {
      this.socket.emit('user-mute-status', { isMuted: this.isMuted, roomId });
    }

    return this.isMuted;
  }

  /**
   * Detects when user is speaking via Web Audio AnalyserNode.
   */
  setupVoiceActivityDetection(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!this.analyser) return;
        this.analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const speaking = !this.isMuted && average > 14;

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
      console.warn('[WebRTC] Voice activity analyser not supported', e);
    }
  }

  /**
   * Cleans up all media streams, connections, and audio nodes.
   */
  closeAll() {
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame);
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.peers.forEach((pc) => pc.close());
    this.peers.clear();
  }
}

export const webrtc = new WebRTCManager();
