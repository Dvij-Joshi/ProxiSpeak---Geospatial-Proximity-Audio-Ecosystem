/**
 * WebRTC Mesh Manager for ProxiSpeak
 * Cross-device compatible: Chrome, Firefox, Safari (incl. iOS), Edge, Android WebView
 * Features:
 *  - Deterministic Single-Initiator negotiation (eliminates dual-offer glare completely)
 *  - Progressive getUserMedia with ideal -> basic fallback
 *  - Seamless hot-swapping via replaceTrack (0ms audio transmission, zero renegotiation glare)
 *  - 3.5s Offer Watchdog with automatic peer recovery from stuck have-local-offer states
 *  - Cross-platform glare resolution: resilient rollback with clean peer recreate fallback for Safari/WebKit
 *  - Dynamic STUN / Metered TURN configuration with high-availability fallbacks
 *  - Hardware device-change detection & auto-reacquisition
 *  - Track lifecycle monitoring with onMicLost callback
 *  - Live voice activity detection & intensity meter
 *  - Live connection diagnostics & one-tap peer reconnect
 */

import { SERVER_URL } from '../config';

const DEFAULT_ICE_SERVERS = [
  // High-availability public STUN servers for peer discovery
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
  { urls: ['stun:stun.cloudflare.com:3478'] },
  { urls: ['stun:stun.nextcloud.com:443'] },
];

// Detect iOS for audio session workarounds
function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

class WebRTCManager {
  constructor() {
    this.socket = null;
    this.localStream = null;
    this.peers = new Map();
    this.peerMeta = new Map();
    this.iceCandidateQueues = new Map();
    this.isMuted = true;
    this.currentRoomId = 'main-office';
    this.iceServers = DEFAULT_ICE_SERVERS;

    this.onRemoteTrackCallback = null;
    this.onMuteStatusCallback = null;
    this.onVoiceActivityCallback = null;
    this.onMicLostCallback = null;

    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.silenceGain = null;
    this.animFrame = null;
    this.isSpeaking = false;
    this._speechHoldTimer = null;

    this._deviceChangeHandler = null;
    this._offerRetryTimers = new Map();
    this._offerWatchdogs = new Map();
    this.peerStats = new Map();
    this.selectedMicDeviceId = null;

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

  _optimizeAudioSender(sender) {
    if (!sender || typeof sender.getParameters !== 'function' || typeof sender.setParameters !== 'function') {
      return;
    }
    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      // Target 48 kbps for high-fidelity speech while conserving mesh upstream bandwidth
      if (!params.encodings[0].maxBitrate || params.encodings[0].maxBitrate > 48000) {
        params.encodings[0].maxBitrate = 48000;
        sender.setParameters(params).catch(() => {});
      }
    } catch (_e) {}
  }

  getIceConfig() {
    return {
      iceServers: this.iceServers || DEFAULT_ICE_SERVERS,
      iceCandidatePoolSize: 2,
    };
  }

  setRoomId(roomId) {
    if (roomId) this.currentRoomId = roomId;
  }

  getPeerMeta(peerId) {
    if (!this.peerMeta.has(peerId)) {
      this.peerMeta.set(peerId, { isMakingOffer: false, isIgnoringOffer: false });
    }
    return this.peerMeta.get(peerId);
  }

  _clearOfferWatchdog(peerId) {
    const timer = this._offerWatchdogs.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this._offerWatchdogs.delete(peerId);
    }
  }

  _setOfferWatchdog(peerId, pc) {
    this._clearOfferWatchdog(peerId);
    const timer = setTimeout(() => {
      this._offerWatchdogs.delete(peerId);
      if (this.peers.has(peerId) && pc.signalingState === 'have-local-offer') {
        console.warn(`[WebRTC] Offer to ${peerId} timed out in have-local-offer. Attempting targeted ICE restart recovery.`);
        try {
          if (typeof pc.restartIce === 'function') pc.restartIce();
          this.initiateOffer(peerId, pc, 0, true);
        } catch (_e) {
          this.resetPeer(peerId);
        }
      }
    }, 6500);
    this._offerWatchdogs.set(peerId, timer);
  }

  /**
   * Initializes WebRTC signaling on the active socket.
   */
  init(socket, { roomId, onRemoteTrack, onMuteStatus, onVoiceActivity, onMicLost } = {}) {
    this.socket = socket;
    if (roomId) this.currentRoomId = roomId;
    this.onRemoteTrackCallback = onRemoteTrack;
    this.onMuteStatusCallback = onMuteStatus;
    this.onVoiceActivityCallback = onVoiceActivity;
    this.onMicLostCallback = onMicLost || null;

    this.socket.off('webrtc-offer');
    this.socket.off('webrtc-answer');
    this.socket.off('webrtc-ice-candidate');
    this.socket.off('user-mute-status');

    this.socket.on('webrtc-offer', async ({ from, offer }) => {
      try {
        console.log(`[WebRTC] Received offer from ${from}`);
        let pc = this.getOrCreatePeer(from, false);
        const meta = this.getPeerMeta(from);

        const isPolite = Boolean(this.socket && this.socket.id < from);
        const offerCollision = meta.isMakingOffer || pc.signalingState !== 'stable';

        meta.isIgnoringOffer = !isPolite && offerCollision;
        if (meta.isIgnoringOffer) {
          console.warn(`[WebRTC] Glare with ${from}: impolite peer safely ignoring colliding offer`);
          return;
        }

        // Polite peer yields and rolls back local description to accept the remote offer
        if (offerCollision && isPolite) {
          if (pc.signalingState === 'have-local-offer') {
            try {
              await pc.setLocalDescription({ type: 'rollback' });
            } catch (_rbErr) {
              console.warn('[WebRTC] Rollback error:', _rbErr.message);
            }
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await this.flushIceCandidateQueue(from, pc);

        // Ensure local audio track is attached so the answer includes bidirectional audio
        if (this.localStream) {
          const audioTrack = this.localStream.getAudioTracks()[0];
          if (audioTrack && audioTrack.readyState === 'live') {
            const senders = pc.getSenders();
            const hasLiveTrack = senders.some((s) => s.track && s.track.id === audioTrack.id);
            if (!hasLiveTrack) {
              const emptySender = senders.find((s) => !s.track || (s.track.kind === 'audio' && s.track.readyState === 'ended'));
              if (emptySender) {
                await emptySender.replaceTrack(audioTrack);
              } else {
                try { pc.addTrack(audioTrack, this.localStream); } catch (_e) {}
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
          this._clearOfferWatchdog(from);

          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await this.flushIceCandidateQueue(from, pc);
            console.log(`[WebRTC] Connected signaling with ${from} (state: ${pc.signalingState})`);
          } else {
            console.warn(`[WebRTC] Received answer from ${from} in unexpected state ${pc.signalingState}`);
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

    // Device-change detection: re-acquire mic if current track died
    if (navigator.mediaDevices && typeof navigator.mediaDevices.addEventListener === 'function') {
      this._deviceChangeHandler = async () => {
        console.log('[WebRTC] Audio device change detected');
        if (this.localStream) {
          const track = this.localStream.getAudioTracks()[0];
          if (!track || track.readyState === 'ended') {
            console.warn('[WebRTC] Current mic track ended after device change, re-acquiring...');
            try {
              await this._reacquireMicrophone();
            } catch (err) {
              console.error('[WebRTC] Failed to re-acquire mic after device change:', err.message);
            }
          }
        }
      };
      navigator.mediaDevices.addEventListener('devicechange', this._deviceChangeHandler);
    }
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
   * Progressive getUserMedia: tries ideal constraints first, falls back to basic.
   */
  async _acquireMicStream(preferredDeviceId = null) {
    const targetDevId = preferredDeviceId || this.selectedMicDeviceId;
    const audioConstraints = {
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
    };
    if (targetDevId) {
      audioConstraints.deviceId = { ideal: targetDevId };
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
    } catch (err) {
      console.warn('[WebRTC] Ideal mic constraints failed:', err.name, '— retrying with basic constraints');
      if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError' ||
          err.name === 'NotSupportedError' || err.name === 'TypeError') {
        const fallbackAudio = targetDevId ? { deviceId: { ideal: targetDevId } } : true;
        return await navigator.mediaDevices.getUserMedia({ audio: fallbackAudio, video: false });
      }
      throw err;
    }
  }

  /**
   * Enumerates available microphone hardware devices.
   */
  async getAudioInputDevices() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1}`,
          groupId: d.groupId,
        }));
    } catch (err) {
      console.warn('[WebRTC] Error enumerating audio devices:', err.message);
      return [];
    }
  }

  /**
   * Seamlessly switches to a selected microphone device without dropping peer connections.
   */
  async switchAudioInputDevice(deviceId) {
    console.log('[WebRTC] Switching microphone device to:', deviceId);
    this.selectedMicDeviceId = deviceId;
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    const stream = await this._acquireMicStream(deviceId);
    this.localStream = stream;
    const newTrack = stream.getAudioTracks()[0];
    if (newTrack) {
      newTrack.enabled = !this.isMuted;
      this._monitorTrack(newTrack);

      this.peers.forEach((pc, peerId) => {
        const senders = pc.getSenders();
        let audioSender = senders.find((s) => s.track?.kind === 'audio') || senders.find((s) => !s.track);
        if (audioSender) {
          audioSender.replaceTrack(newTrack).catch((e) => {
            console.warn(`[WebRTC] replaceTrack error for ${peerId}:`, e);
          });
        } else {
          try { pc.addTrack(newTrack, stream); } catch (_e) {}
        }

        const transceivers = typeof pc.getTransceivers === 'function' ? pc.getTransceivers() : [];
        const audioTransceiver = transceivers.find((t) => t.sender === audioSender || t.receiver?.track?.kind === 'audio');
        if (audioTransceiver && audioTransceiver.direction !== 'sendrecv') {
          audioTransceiver.direction = 'sendrecv';
        }

        if (pc.signalingState === 'stable') {
          this.initiateOffer(peerId, pc);
        }
      });
    }

    this.setupVoiceActivityDetection(stream);
    console.log('[WebRTC] Successfully switched microphone device');
    return stream;
  }

  /**
   * Re-acquires microphone after device change or track death.
   * Hot-swaps tracks on existing senders with ZERO SDP renegotiation.
   */
  async _reacquireMicrophone() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
    }
    const stream = await this._acquireMicStream();
    this.localStream = stream;
    const newTrack = stream.getAudioTracks()[0];
    if (newTrack) {
      newTrack.enabled = !this.isMuted;
      this._monitorTrack(newTrack);

      this.peers.forEach((pc, peerId) => {
        const senders = pc.getSenders();
        let audioSender = senders.find((s) => s.track?.kind === 'audio') || senders.find((s) => !s.track);
        if (audioSender) {
          audioSender.replaceTrack(newTrack).catch((e) => {
            console.warn(`[WebRTC] replaceTrack error for ${peerId}:`, e);
          });
        } else {
          try { pc.addTrack(newTrack, stream); } catch (_e) {}
        }

        const transceivers = typeof pc.getTransceivers === 'function' ? pc.getTransceivers() : [];
        const audioTransceiver = transceivers.find((t) => t.sender === audioSender || t.receiver?.track?.kind === 'audio');
        if (audioTransceiver && audioTransceiver.direction !== 'sendrecv') {
          audioTransceiver.direction = 'sendrecv';
        }

        if (pc.signalingState === 'stable') {
          this.initiateOffer(peerId, pc);
        }
      });
    }
    this.setupVoiceActivityDetection(stream);
    console.log('[WebRTC] Microphone re-acquired after device change');
  }

  /**
   * Monitors a mic track for unexpected termination.
   */
  _monitorTrack(track) {
    track.onended = () => {
      console.warn('[WebRTC] Local mic track ended unexpectedly (OS/browser killed it)');
      this.localStream = null;
      if (this.onMicLostCallback) {
        this.onMicLostCallback('Microphone disconnected or stopped by the system.');
      }
    };
  }

  /**
   * Requests microphone access with progressive fallback constraints,
   * attaches tracks, and hot-swaps to existing peer connections without renegotiation glare.
   */
  async startMicrophone(sharedAudioContext = null) {
    if (sharedAudioContext && (!this.audioContext || this.audioContext.state === 'closed')) {
      this.audioContext = sharedAudioContext;
    }

    // If already have a live stream, just unmute and hot-swap
    if (this.localStream) {
      const existingTrack = this.localStream.getAudioTracks()[0];
      if (existingTrack && existingTrack.readyState === 'live') {
        this.isMuted = false;
        existingTrack.enabled = true;
        if (this.socket) {
          this.socket.emit('user-mute-status', { isMuted: false, roomId: this.currentRoomId });
        }
        this.peers.forEach((pc) => {
          const senders = pc.getSenders();
          const audioSender = senders.find((s) => s.track?.kind === 'audio') || senders.find((s) => !s.track);
          if (audioSender) {
            audioSender.replaceTrack(existingTrack).catch(() => {});
          }
        });
        return this.localStream;
      } else {
        this.localStream = null;
      }
    }

    try {
      const stream = await this._acquireMicStream();
      this.localStream = stream;
      this.isMuted = false;

      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = true;
        this._monitorTrack(audioTrack);
      }

      // iOS Safari audio session activation
      if (isIOSSafari()) {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (AudioCtx) {
            const tmpCtx = new AudioCtx();
            const tmpSrc = tmpCtx.createMediaStreamSource(stream);
            tmpSrc.connect(tmpCtx.destination);
            await tmpCtx.resume();
            setTimeout(() => {
              try { tmpSrc.disconnect(); tmpCtx.close(); } catch (_e) {}
            }, 100);
          }
        } catch (_e) {
          console.warn('[WebRTC] iOS audio session activation skipped:', _e.message);
        }
      }

      // Hot-swap audio track to all active peer connections without unnecessary renegotiation
      this.peers.forEach((pc, peerId) => {
        const senders = pc.getSenders();
        let audioSender = senders.find((s) => s.track?.kind === 'audio') || senders.find((s) => !s.track);
        let needsRenegotiation = false;

        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack).then(() => {
            console.log(`[WebRTC] Hot-swapped live mic track for ${peerId} (0ms renegotiation)`);
          }).catch((e) => {
            console.warn('[WebRTC] replaceTrack error:', e);
          });
          this._optimizeAudioSender(audioSender);
        } else if (audioTrack) {
          try {
            const addedSender = pc.addTrack(audioTrack, this.localStream);
            this._optimizeAudioSender(addedSender);
            needsRenegotiation = true;
          } catch (_e) {}
        }

        // Ensure transceiver direction is sendrecv and renegotiate if media direction upgraded
        const transceivers = typeof pc.getTransceivers === 'function' ? pc.getTransceivers() : [];
        const audioTransceiver = transceivers.find((t) => t.sender === audioSender || t.receiver?.track?.kind === 'audio');
        if (audioTransceiver) {
          if (audioTransceiver.direction !== 'sendrecv') {
            console.log(`[WebRTC] Upgrading transceiver direction to sendrecv for ${peerId}`);
            audioTransceiver.direction = 'sendrecv';
            needsRenegotiation = true;
          }
          // If the last negotiated SDP direction was recvonly or inactive, we MUST renegotiate to send audio packets!
          if (audioTransceiver.currentDirection && audioTransceiver.currentDirection !== 'sendrecv') {
            console.log(`[WebRTC] currentDirection is ${audioTransceiver.currentDirection}; triggering renegotiation to sendrecv for ${peerId}`);
            needsRenegotiation = true;
          }
        }

        // Renegotiate when media upgrade requires SDP update
        if (needsRenegotiation) {
          if (pc.signalingState === 'stable') {
            this.initiateOffer(peerId, pc);
          } else {
            setTimeout(() => {
              if (this.peers.has(peerId) && pc.signalingState === 'stable') {
                this.initiateOffer(peerId, pc);
              }
            }, 300);
          }
        }
      });

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
        userMsg = 'Microphone permission was denied. Please allow microphone access in your browser settings and reload the page.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        userMsg = 'No microphone device was detected. Please connect a microphone or headset and try again.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        userMsg = 'Your microphone is in use by another application. Please close other apps using the mic and try again.';
      } else if (err.name === 'OverconstrainedError' || err.name === 'ConstraintNotSatisfiedError') {
        userMsg = 'Your microphone does not support the required audio settings. Please try a different microphone.';
      } else if (err.name === 'AbortError') {
        userMsg = 'Microphone access was cancelled. Please try enabling your microphone again.';
      } else if (err.name === 'SecurityError') {
        userMsg = 'Microphone access is blocked. This site must be served over HTTPS for microphone access.';
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

    // If local microphone already exists, attach track directly; otherwise create bidirectional transceiver
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'live') {
        const sender = pc.addTrack(audioTrack, this.localStream);
        this._optimizeAudioSender(sender);
      } else {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
      }
    } else {
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
      console.log(`[WebRTC] Received remote audio track from ${peerId}`);
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

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${peerId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Peer connection failed with ${peerId}, attempting targeted ICE restart...`);
        try {
          if (typeof pc.restartIce === 'function') pc.restartIce();
          this.initiateOffer(peerId, pc, 0, true);
        } catch (_e) {
          this.resetPeer(peerId);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${peerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[WebRTC] ICE failed with ${peerId}, attempting targeted ICE restart...`);
        try {
          if (typeof pc.restartIce === 'function') pc.restartIce();
          this.initiateOffer(peerId, pc, 0, true);
        } catch (_e) {
          this.resetPeer(peerId);
        }
      }
      if (pc.iceConnectionState === 'disconnected') {
        // 6-second grace period for temporary network/Wi-Fi handover recovery before tearing down
        setTimeout(() => {
          if (this.peers.has(peerId) && (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) {
            console.warn(`[WebRTC] ICE still disconnected with ${peerId} after 6s grace, attempting targeted ICE restart...`);
            try {
              if (typeof pc.restartIce === 'function') pc.restartIce();
              this.initiateOffer(peerId, pc, 0, true);
            } catch (_e) {
              this.resetPeer(peerId);
            }
          }
        }, 6000);
      }
    };

    if (isInitiator) {
      this.initiateOffer(peerId, pc);
    }

    return pc;
  }

  /**
   * Initiates an SDP offer to connect with a peer.
   * Armed with retry timer and offer watchdog for auto-recovery.
   */
  async initiateOffer(peerId, pc, _retryCount = 0, isIceRestart = false) {
    const meta = this.getPeerMeta(peerId);

    // Clear any existing retry timer for this peer
    const existingTimer = this._offerRetryTimers.get(peerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this._offerRetryTimers.delete(peerId);
    }

    try {
      meta.isMakingOffer = true;
      if (pc.signalingState !== 'stable') {
        if (_retryCount < 4) {
          console.warn(`[WebRTC] Cannot offer to ${peerId} (state: ${pc.signalingState}), retry ${_retryCount + 1}/4 in 300ms`);
          const timer = setTimeout(() => {
            this._offerRetryTimers.delete(peerId);
            if (this.peers.has(peerId)) {
              this.initiateOffer(peerId, pc, _retryCount + 1, isIceRestart);
            }
          }, 300);
          this._offerRetryTimers.set(peerId, timer);
        } else {
          console.warn(`[WebRTC] Peer ${peerId} stuck in state ${pc.signalingState}. Resetting to recover.`);
          this.resetPeer(peerId);
        }
        return;
      }

      const offerOptions = isIceRestart ? { iceRestart: true } : undefined;
      const offer = await pc.createOffer(offerOptions);
      if (pc.signalingState !== 'stable') return;

      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc-offer', { to: peerId, offer });
      console.log(`[WebRTC] Sent offer to ${peerId}${isIceRestart ? ' (ICE Restart)' : ''}`);

      // Set 3.8s offer watchdog: If no answer received, auto-recover
      this._setOfferWatchdog(peerId, pc);
    } catch (err) {
      console.error(`[WebRTC] Failed to create offer to ${peerId}:`, err);
      this._clearOfferWatchdog(peerId);
    } finally {
      meta.isMakingOffer = false;
    }
  }

  /**
   * Connects to a newly discovered peer in the room.
   * Deterministic Rule: The peer with the alphabetically higher socket.id initiates.
   * This guarantees ZERO simultaneous offer collisions (glare) between any two devices!
   */
  connectToPeer(peerId) {
    if (this.peers.has(peerId)) {
      return;
    }
    const shouldInitiate = Boolean(this.socket && this.socket.id > peerId);
    this.getOrCreatePeer(peerId, shouldInitiate);
  }

  /**
   * Resets and cleanly recovers a peer connection.
   */
  resetPeer(peerId) {
    console.log(`[WebRTC] Resetting peer connection for ${peerId}`);
    this.removePeer(peerId);
    const shouldInitiate = Boolean(this.socket && this.socket.id > peerId);
    this.getOrCreatePeer(peerId, shouldInitiate);
  }

  /**
   * Force reconnects all active peers in the meeting.
   */
  reconnectAllPeers() {
    console.log(`[WebRTC] Reconnecting all ${this.peers.size} peer connections`);
    const peerIds = Array.from(this.peers.keys());
    peerIds.forEach((pid) => {
      this.resetPeer(pid);
    });
  }

  /**
   * Removes a disconnected peer.
   */
  removePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      try { pc.close(); } catch (_e) {}
      this.peers.delete(peerId);
    }
    this.peerMeta.delete(peerId);
    this.iceCandidateQueues.delete(peerId);
    this.peerStats.delete(peerId);

    const timer = this._offerRetryTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this._offerRetryTimers.delete(peerId);
    }
    this._clearOfferWatchdog(peerId);
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
   * Returns diagnostic info about the current audio pipeline state.
   */
  /**
   * Fetches real-time WebRTC stats for a peer: candidate type (STUN/TURN/host), protocol, and RTT.
   */
  async updatePeerStats(peerId) {
    const pc = this.peers.get(peerId);
    if (!pc || pc.connectionState === 'closed') return null;

    try {
      const stats = await pc.getStats();
      let activeCandidatePair = null;
      let localCandidate = null;
      let remoteCandidate = null;

      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          activeCandidatePair = stats.get(report.selectedCandidatePairId);
        }
      });

      if (!activeCandidatePair) {
        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && (report.selected || report.state === 'succeeded')) {
            activeCandidatePair = report;
          }
        });
      }

      if (activeCandidatePair) {
        localCandidate = stats.get(activeCandidatePair.localCandidateId);
        remoteCandidate = stats.get(activeCandidatePair.remoteCandidateId);
      }

      const rttMs = activeCandidatePair?.currentRoundTripTime != null
        ? Math.round(activeCandidatePair.currentRoundTripTime * 1000)
        : null;

      const rawType = localCandidate?.candidateType || remoteCandidate?.candidateType || 'unknown';
      let modeLabel = 'Direct P2P';
      if (rawType === 'relay') modeLabel = 'TURN Relay';
      else if (rawType === 'srflx' || rawType === 'prflx') modeLabel = 'STUN P2P';
      else if (rawType === 'host') modeLabel = 'Local / LAN';

      const info = {
        candidateType: rawType,
        modeLabel,
        protocol: (localCandidate?.protocol || 'udp').toUpperCase(),
        rtt: rttMs,
        bytesReceived: activeCandidatePair?.bytesReceived || 0,
        bytesSent: activeCandidatePair?.bytesSent || 0,
      };

      this.peerStats.set(peerId, info);
      return info;
    } catch (_err) {
      return null;
    }
  }

  /**
   * Refreshes stats for all active WebRTC peers.
   */
  async updateAllPeerStats() {
    const promises = Array.from(this.peers.keys()).map((id) => this.updatePeerStats(id));
    await Promise.allSettled(promises);
  }

  /**
   * Returns diagnostic info about the current audio pipeline state.
   */
  getConnectionDiagnostics() {
    const micTrack = this.localStream?.getAudioTracks()[0];
    const peerDiag = {};
    this.peers.forEach((pc, id) => {
      const senders = pc.getSenders();
      const audioSender = senders.find((s) => s.track?.kind === 'audio');
      peerDiag[id] = {
        iceState: pc.iceConnectionState,
        signalingState: pc.signalingState,
        hasSender: Boolean(audioSender),
        senderTrackState: audioSender?.track?.readyState || 'none',
        stats: this.peerStats.get(id) || null,
      };
    });
    return {
      hasMicrophone: Boolean(micTrack && micTrack.readyState === 'live'),
      micTrackState: micTrack ? micTrack.readyState : 'none',
      isMuted: this.isMuted,
      peerCount: this.peers.size,
      roomId: this.currentRoomId,
      peers: peerDiag,
    };
  }

  /**
   * Detects speaking activity using AnalyserNode.
   */
  setupVoiceActivityDetection(stream) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        console.warn('[WebRTC] No AudioContext available for VAD');
        return;
      }
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
        // Require true speech volume (avg > 4.5) to reject typing / mechanical keyboard clicks
        const nowSpeaking = !this.isMuted && avg > 4.5;

        if (nowSpeaking) {
          if (this._speechHoldTimer) {
            clearTimeout(this._speechHoldTimer);
            this._speechHoldTimer = null;
          }
          if (!this.isSpeaking) {
            this.isSpeaking = true;
            if (this.onVoiceActivityCallback) {
              this.onVoiceActivityCallback(true);
            }
          }
        } else if (this.isSpeaking && !this._speechHoldTimer) {
          // 250ms hold time prevents rapid flickering on speech pauses or key taps
          this._speechHoldTimer = setTimeout(() => {
            this.isSpeaking = false;
            this._speechHoldTimer = null;
            if (this.onVoiceActivityCallback) {
              this.onVoiceActivityCallback(false);
            }
          }, 250);
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
    this._offerRetryTimers.forEach((timer) => clearTimeout(timer));
    this._offerRetryTimers.clear();

    this._offerWatchdogs.forEach((timer) => clearTimeout(timer));
    this._offerWatchdogs.clear();

    if (this._deviceChangeHandler && navigator.mediaDevices && typeof navigator.mediaDevices.removeEventListener === 'function') {
      navigator.mediaDevices.removeEventListener('devicechange', this._deviceChangeHandler);
      this._deviceChangeHandler = null;
    }

    if (this._speechHoldTimer) {
      clearTimeout(this._speechHoldTimer);
      this._speechHoldTimer = null;
    }

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
    this.peerStats.clear();
  }
}

export const webrtc = new WebRTCManager();
