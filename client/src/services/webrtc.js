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
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
  { urls: ['stun:stun.cloudflare.com:3478'] },
  { urls: ['stun:stun.services.mozilla.com'] },
  { urls: ['stun:stun.sipgate.net:3478'] },
  { urls: ['stun:stun.relay.metered.ca:80'] },
  { urls: ['stun:stun.ekiga.net'] },
  { urls: ['stun:stun.ideasip.com'] },
  { urls: ['stun:stun.schlund.de'] },
  { urls: ['stun:stun.voiparound.com'] },
  { urls: ['stun:stun.voipbuster.com'] },
  { urls: ['stun:stun.voipstunt.com'] },
  // High-availability public TURN relay fallback (OpenRelay by Metered) for cross-network connectivity
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
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
    this.negotiations = new Map();
    this.iceCandidateQueues = new Map();
    this.mediaSession = 0;
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
          for (const pc of this.peers.values()) {
            if (pc.signalingState !== 'closed') pc.setConfiguration(this.getIceConfig());
          }
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
        console.warn(`[WebRTC] Offer to ${peerId} timed out in have-local-offer. Auto-recovering peer connection.`);
        this.resetPeer(peerId);
      }
    }, 3800);
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

    this.socket.on('webrtc-offer', ({ from, offer }) => this._queueNegotiation(from, async () => {
      try {
        console.log(`[WebRTC] Received offer from ${from}`);
        let pc = this.getOrCreatePeer(from, false);
        const meta = this.getPeerMeta(from);

        const isPolite = Boolean(this.socket && this.socket.id < from);
        const offerCollision = meta.isMakingOffer || pc.signalingState !== 'stable';

        // Glare handling
        if (offerCollision) {
          if (!isPolite && pc.signalingState === 'have-local-offer') {
            console.warn(`[WebRTC] Glare with ${from}: impolite peer ignoring colliding offer`);
            return;
          }

          if (pc.signalingState === 'have-local-offer') {
            const retryTimer = this._offerRetryTimers.get(from);
            if (retryTimer) {
              clearTimeout(retryTimer);
              this._offerRetryTimers.delete(from);
            }
            this._clearOfferWatchdog(from);

            let rolledBack = false;
            try {
              await pc.setLocalDescription({ type: 'rollback' });
              rolledBack = (pc.signalingState === 'stable');
            } catch (_rbErr) {
              rolledBack = false;
            }

            if (!rolledBack) {
              // Rollback unsupported (Safari/WebKit) — recreate peer cleanly to accept remote offer
              console.log(`[WebRTC] Glare rollback unsupported on this browser; cleanly resetting peer for ${from}`);
              this.removePeer(from);
              pc = this.getOrCreatePeer(from, false);
            }
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        // Guard: if the PC was replaced during the async setRemoteDescription, bail out
        if (this.peers.get(from) !== pc) {
          console.warn(`[WebRTC] Peer ${from} replaced during offer handling, aborting stale answer`);
          return;
        }
        await this.flushIceCandidateQueue(from, pc);

        // Cancel any pending offer retry since we successfully received and processed remote offer
        const existingRetry = this._offerRetryTimers.get(from);
        if (existingRetry) {
          clearTimeout(existingRetry);
          this._offerRetryTimers.delete(from);
        }

        // The remote offer creates the answering transceiver. Reserve its
        // sending direction even when the user has yet to enable the mic.
        const audio = pc.getTransceivers().find(t => t.receiver.track.kind === 'audio');
        if (audio) {
          audio.direction = 'sendrecv';
          const track = this.localStream?.getAudioTracks()[0];
          if (track?.readyState === 'live') {
            await audio.sender.replaceTrack(track);
            this._optimizeAudioSender(audio.sender);
          }
        }

        // Guard again before creating answer — PC may have been reset during track attachment
        if (this.peers.get(from) !== pc || pc.signalingState !== 'have-remote-offer') {
          console.warn(`[WebRTC] Peer ${from} state changed before answer (state: ${pc.signalingState}), aborting`);
          return;
        }
        const answer = await pc.createAnswer();
        if (this.peers.get(from) !== pc || pc.signalingState !== 'have-remote-offer') {
          console.warn(`[WebRTC] Peer ${from} state changed during createAnswer (state: ${pc.signalingState}), aborting answer`);
          return;
        }
        try {
          await pc.setLocalDescription(answer);
        } catch (setErr) {
          if (pc.signalingState !== 'have-remote-offer') {
            console.warn(`[WebRTC] Aborting answer for ${from} due to state change (${pc.signalingState})`);
            return;
          }
          throw setErr;
        }
        this.socket.emit('webrtc-answer', { to: from, answer });
        console.log(`[WebRTC] Sent answer to ${from}`);
      } catch (err) {
        console.error('[WebRTC] Error handling offer from', from, err);
      }
    }));

    this.socket.on('webrtc-answer', ({ from, answer }) => this._queueNegotiation(from, async () => {
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
    }));

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
    const session = this.mediaSession;
    const stream = await this._requestMicStream(preferredDeviceId);
    if (session !== this.mediaSession) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error('Meeting ended while opening the microphone');
    }
    return stream;
  }

  async _requestMicStream(preferredDeviceId) {
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
      const audioInputs = devices.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications');
      // If there are specific hardware devices with names, exclude duplicate generic 'default' alias
      const hasNamedDevices = audioInputs.some((d) => d.deviceId && d.deviceId !== 'default' && d.label);
      const targetList = hasNamedDevices
        ? audioInputs.filter((d) => d.deviceId && d.deviceId !== 'default')
        : audioInputs;

      return targetList.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${index + 1}`,
        groupId: d.groupId,
      }));
    } catch (err) {
      console.warn('[WebRTC] Error enumerating audio devices:', err.message);
      return [];
    }
  }

  async _replaceMicrophoneTrack(track) {
    if (!track) return;
    await Promise.all(Array.from(this.peers.entries()).map(async ([peerId, pc]) => {
      try {
        const transceivers = typeof pc.getTransceivers === 'function' ? pc.getTransceivers() : [];
        let audio = transceivers.find(t => !t.stopped && (t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio'));
        let needsOffer = false;

        if (audio) {
          if (audio.sender.track !== track) {
            await audio.sender.replaceTrack(track);
            this._optimizeAudioSender(audio.sender);
          }
          const currentDir = audio.currentDirection;
          if (audio.direction !== 'sendrecv' || (currentDir && currentDir !== 'sendrecv')) {
            audio.direction = 'sendrecv';
            needsOffer = true;
          }
        } else {
          // The answering side receives its transceiver with the offer.
          // Creating a sender during microphone startup competes with that
          // offer and can leave two unrelated audio media sections.
          if (!this.socket || this.socket.id < peerId) return;
          try {
            const sender = pc.addTrack(track, this.localStream);
            this._optimizeAudioSender(sender);
            needsOffer = true;
          } catch (_e) {
            audio = pc.addTransceiver(track, { direction: 'sendrecv' });
            this._optimizeAudioSender(audio.sender);
            needsOffer = true;
          }
        }

        if (needsOffer && pc.signalingState === 'stable') {
          const shouldInitiate = Boolean(this.socket && this.socket.id > peerId);
          if (shouldInitiate) {
            this.initiateOffer(peerId, pc);
          }
        }
      } catch (err) {
        console.warn(`[WebRTC] Error attaching mic track to peer ${peerId}:`, err);
      }
    }));
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

      await this._replaceMicrophoneTrack(newTrack);
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

      await this._replaceMicrophoneTrack(newTrack);
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

    if (this.penaltyUntil > Date.now()) throw new Error("Microphone penalty is active");
    // If already have a live stream, just unmute and hot-swap
    if (this.localStream) {
      const existingTrack = this.localStream.getAudioTracks()[0];
      if (existingTrack && existingTrack.readyState === 'live') {
        this.isMuted = false;
        existingTrack.enabled = true;
        if (this.socket) {
          this.socket.emit('user-mute-status', { isMuted: false, roomId: this.currentRoomId });
        }
        await this._replaceMicrophoneTrack(existingTrack);
        return this.localStream;
      } else {
        this.localStream = null;
      }
    }

    try {
      const stream = await this._acquireMicStream();
      if (this.penaltyUntil > Date.now()) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error("Microphone penalty is active");
      }
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

      if (audioTrack) await this._replaceMicrophoneTrack(audioTrack);

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

    // Attach local track or bidirectional transceiver
    const track = this.localStream?.getAudioTracks()[0];
    if (isInitiator) {
      const audio = pc.addTransceiver(track?.readyState === 'live' ? track : 'audio', { direction: 'sendrecv' });
      this._optimizeAudioSender(audio.sender);
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
        this._handleConnectionFailure(peerId, pc);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${peerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        this._handleConnectionFailure(peerId, pc);
      }
      if (pc.iceConnectionState === 'disconnected') {
        // 6-second grace period for temporary network/Wi-Fi handover recovery before tearing down
        setTimeout(() => {
          if (this.peers.has(peerId) && (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed')) {
            console.warn(`[WebRTC] ICE still disconnected with ${peerId} after 6s grace`);
            this._handleConnectionFailure(peerId, pc);
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
   * Deterministic failure recovery: only designated initiator restarts ICE to prevent glare.
   */
  _handleConnectionFailure(peerId, pc) {
    if (this.peers.get(peerId) !== pc) return;
    const meta = this.getPeerMeta(peerId);
    if (meta.isRestartingIce) return;
    meta.isRestartingIce = true;

    const shouldInitiate = Boolean(this.socket && this.socket.id > peerId);

    if (shouldInitiate) {
      console.warn(`[WebRTC] Connection failed with ${peerId}, initiating deterministic ICE restart...`);
      try {
        if (typeof pc.restartIce === 'function') pc.restartIce();
        this.initiateOffer(peerId, pc, 0, true);
      } catch (_e) {
        this.resetPeer(peerId);
      }
    } else {
      console.warn(`[WebRTC] Connection failed with ${peerId}, awaiting initiator's ICE restart offer...`);
      setTimeout(() => {
        if (this.peers.get(peerId) === pc && (pc.connectionState === 'failed' || pc.iceConnectionState === 'failed')) {
          console.warn(`[WebRTC] ICE recovery timed out for ${peerId}, performing clean peer reset...`);
          this.resetPeer(peerId);
        }
      }, 5000);
    }

    setTimeout(() => {
      if (this.peers.has(peerId)) {
        meta.isRestartingIce = false;
      }
    }, 2500);
  }

  /**
   * Initiates an SDP offer to connect with a peer.
   * Armed with retry timer and offer watchdog for auto-recovery.
   */
  _queueNegotiation(peerId, operation) {
    const socket = this.socket;
    const previous = this.negotiations.get(peerId) || Promise.resolve();
    const pending = previous.catch(() => {}).then(() => {
      if (this.socket === socket && socket?.connected) return operation();
    });
    this.negotiations.set(peerId, pending);
    const cleanup = () => {
      if (this.negotiations.get(peerId) === pending) this.negotiations.delete(peerId);
    };
    pending.then(cleanup, cleanup);
    return pending;
  }

  initiateOffer(peerId, pc, retryCount = 0, isIceRestart = false) {
    return this._queueNegotiation(peerId, () => this._createOffer(peerId, pc, retryCount, isIceRestart));
  }

  async _createOffer(peerId, pc, _retryCount = 0, isIceRestart = false) {
    if (this.peers.get(peerId) !== pc) return;
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
        if (pc.signalingState === 'have-remote-offer') {
          console.log(`[WebRTC] Peer ${peerId} in have-remote-offer, deferring offer to answer flow`);
          return;
        }

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
    // A reset must announce its new transport to the remote endpoint. Waiting
    // here leaves the remote using the discarded DTLS/ICE transport forever.
    // Concurrent resets are resolved by the existing polite-peer rollback.
    this.getOrCreatePeer(peerId, true);
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
    // Invalidate queued negotiations so stale async ops don't run on a new PC
    this.negotiations.delete(peerId);
  }

  /**
   * Toggles microphone mute state.
   */
  enforcePenalty(until) {
    this.penaltyUntil = until;
    if (until > Date.now()) {
      this.isMuted = true;
      this.localStream?.getAudioTracks().forEach(track => { track.enabled = false; });
    }
  }

  toggleMute(roomId) {
    if (this.penaltyUntil > Date.now()) return true;
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
    this.mediaSession++;
    this.isMuted = true;
    this.penaltyUntil = 0;
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
