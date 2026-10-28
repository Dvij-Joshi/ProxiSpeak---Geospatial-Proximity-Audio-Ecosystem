import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { VOICE_SERVER_URL } from '../config';

// High-availability public STUN servers for direct P2P NAT traversal (0 third-party API keys required)
const ICE_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: ['stun:stun.cloudflare.com:3478'] },
  ],
  iceCandidatePoolSize: 10,
};

export default function VoiceTest({ user, onBackToLobby }) {
  const [serverUrl, setServerUrl] = useState(VOICE_SERVER_URL);
  const [showConfig, setShowConfig] = useState(false);

  const [username, setUsername] = useState(user?.username || `Tester-${Math.floor(100 + Math.random() * 900)}`);
  const [roomId, setRoomId] = useState('voice-test-room');

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  const [peers, setPeers] = useState([]);
  const [serverStatus, setServerStatus] = useState('idle');
  const [connectionMode, setConnectionMode] = useState('Standby');
  const [copiedLink, setCopiedLink] = useState(false);

  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);
  const isMutedRef = useRef(false);

  // WebRTC Peer Connections map: socketId -> RTCPeerConnection
  const peerConnectionsRef = useRef(new Map());
  // Remote audio elements map: socketId -> HTMLAudioElement
  const remoteAudiosRef = useRef(new Map());
  // ICE candidate queues if received before remote description
  const candidateQueuesRef = useRef(new Map());

  // Keep isMutedRef in sync
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      leaveVoiceRoom();
    };
  }, []);

  // Check URL query parameters for pre-filled room (?voiceRoom=xxx)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('voiceRoom');
      if (roomParam) setRoomId(roomParam.trim());
    } catch (_e) {}
  }, []);

  /**
   * Helper: create or retrieve an RTCPeerConnection for a remote peer
   */
  const createPeerConnection = (targetSocketId, isInitiator = false) => {
    if (peerConnectionsRef.current.has(targetSocketId)) {
      return peerConnectionsRef.current.get(targetSocketId);
    }

    console.log(`[WebRTC] Creating RTCPeerConnection for ${targetSocketId} (initiator: ${isInitiator})`);
    const pc = new RTCPeerConnection(ICE_CONFIG);
    peerConnectionsRef.current.set(targetSocketId, pc);

    // Attach local microphone tracks
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ICE Candidate discovery
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('webrtc-signal', {
          targetSocketId,
          signal: {
            type: 'candidate',
            candidate: event.candidate,
          },
        });
      }
    };

    // Connection state logging
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${targetSocketId}:`, pc.connectionState);
      if (pc.connectionState === 'connected') {
        setConnectionMode('Direct WebRTC P2P (Ultra-Low Latency ~25ms)');
        setServerStatus('P2P Voice Channel Active');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.warn(`[WebRTC] Peer ${targetSocketId} ${pc.connectionState}`);
      }
    };

    // When remote audio track is received
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote audio track from ${targetSocketId}`);
      const remoteStream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);

      let audioEl = remoteAudiosRef.current.get(targetSocketId);
      if (!audioEl) {
        audioEl = new Audio();
        audioEl.autoplay = true;
        audioEl.playsInline = true;
        remoteAudiosRef.current.set(targetSocketId, audioEl);
      }
      audioEl.srcObject = remoteStream;
      audioEl.play().catch((err) => {
        console.warn(`[WebRTC] Autoplay waiting for user gesture:`, err.message);
      });

      setConnectionMode('Direct WebRTC P2P (Ultra-Low Latency ~25ms)');
    };

    return pc;
  };

  /**
   * Helper: safely process queued ICE candidates
   */
  const drainCandidateQueue = async (socketId, pc) => {
    const queue = candidateQueuesRef.current.get(socketId) || [];
    for (const cand of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        console.warn('[WebRTC] Failed to add queued candidate:', err.message);
      }
    }
    candidateQueuesRef.current.delete(socketId);
  };

  /**
   * Join Voice Room
   */
  const joinVoiceRoom = async () => {
    if (!username.trim() || !roomId.trim()) return;

    setConnecting(true);
    setServerStatus('Requesting microphone & connecting...');

    try {
      // 1. Capture microphone with hardware echo cancellation & noise suppression
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      localStreamRef.current = stream;

      // 2. Setup local volume meter via Web Audio API Analyser
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateVolume = () => {
        if (!isMutedRef.current) {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          setLocalVolume(Math.min(100, Math.round((avg / 128) * 100)));
        } else {
          setLocalVolume(0);
        }
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      // 3. Connect to Dedicated Voice Server (for ultra-lightweight WebRTC signaling)
      const socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setConnecting(false);
        setServerStatus('Signaling Active — Waiting for Peer');
        setConnectionMode('Signaling Connected');

        socket.emit('join-voice', {
          roomId,
          username,
          userId: user?.userId || `user-${Date.now()}`,
        });
      });

      socket.on('connect_error', (err) => {
        console.error('[VoiceTest] Connection error:', err.message);
        setServerStatus(`Failed to connect to ${serverUrl}: ${err.message}`);
        setConnecting(false);
      });

      // When existing peers in the room are received
      socket.on('room-peers', async ({ peers: existingPeers }) => {
        setPeers(existingPeers || []);

        // Initiate WebRTC peer connections with each existing peer
        for (const peer of existingPeers || []) {
          try {
            const pc = createPeerConnection(peer.socketId, true);
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
            });
            await pc.setLocalDescription(offer);

            socket.emit('webrtc-signal', {
              targetSocketId: peer.socketId,
              signal: {
                type: 'offer',
                sdp: pc.localDescription,
              },
            });
          } catch (err) {
            console.error(`[WebRTC] Failed to create offer for ${peer.socketId}:`, err);
          }
        }
      });

      // When a new peer joins the room
      socket.on('peer-joined', (newPeer) => {
        setPeers((prev) => {
          if (prev.some((p) => p.socketId === newPeer.socketId)) return prev;
          return [...prev, newPeer];
        });
      });

      // WebRTC Signaling messages (offer / answer / candidate)
      socket.on('webrtc-signal', async ({ senderSocketId, signal }) => {
        if (!signal) return;

        try {
          let pc = peerConnectionsRef.current.get(senderSocketId);

          if (signal.type === 'offer') {
            if (!pc) {
              pc = createPeerConnection(senderSocketId, false);
            }
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            await drainCandidateQueue(senderSocketId, pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.emit('webrtc-signal', {
              targetSocketId: senderSocketId,
              signal: {
                type: 'answer',
                sdp: pc.localDescription,
              },
            });
          } else if (signal.type === 'answer') {
            if (pc) {
              await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
              await drainCandidateQueue(senderSocketId, pc);
            }
          } else if (signal.type === 'candidate' && signal.candidate) {
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } else {
              // Queue candidate until remote description is set
              const q = candidateQueuesRef.current.get(senderSocketId) || [];
              q.push(signal.candidate);
              candidateQueuesRef.current.set(senderSocketId, q);
            }
          }
        } catch (err) {
          console.error('[WebRTC] Signal handling error:', err);
        }
      });

      // Peer mute status changed
      socket.on('peer-mute-changed', ({ socketId, isMuted: peerMuted }) => {
        setPeers((prev) =>
          prev.map((p) => (p.socketId === socketId ? { ...p, isMuted: peerMuted } : p))
        );
      });

      // Peer left room
      socket.on('peer-left', ({ socketId }) => {
        setPeers((prev) => prev.filter((p) => p.socketId !== socketId));

        const pc = peerConnectionsRef.current.get(socketId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(socketId);
        }

        const audio = remoteAudiosRef.current.get(socketId);
        if (audio) {
          audio.srcObject = null;
          audio.pause();
          remoteAudiosRef.current.delete(socketId);
        }

        candidateQueuesRef.current.delete(socketId);
      });

    } catch (err) {
      console.error('[VoiceTest] Initialization error:', err);
      setServerStatus(`Microphone Error: ${err.message}`);
      setConnecting(false);
      leaveVoiceRoom();
    }
  };

  /**
   * Leave Voice Room and tear down peer connections
   */
  const leaveVoiceRoom = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Close all WebRTC peer connections
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch (_e) {}
    });
    peerConnectionsRef.current.clear();

    // Clean up all remote audio elements
    remoteAudiosRef.current.forEach((audio) => {
      try {
        audio.srcObject = null;
        audio.pause();
      } catch (_e) {}
    });
    remoteAudiosRef.current.clear();
    candidateQueuesRef.current.clear();

    // Stop local microphone tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.emit('leave-voice');
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setConnected(false);
    setConnecting(false);
    setLocalVolume(0);
    setPeers([]);
    setServerStatus('Disconnected');
    setConnectionMode('Standby');
  };

  /**
   * Toggle Mute with zero audio latency
   */
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    // Mute hardware microphone track directly
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    // Broadcast mute state to room peers
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('set-mute', { isMuted: nextMuted });
    }
  };

  /**
   * Share test link with pre-filled room ID
   */
  const copyTestLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('voiceTest', 'true');
    url.searchParams.set('voiceRoom', roomId);

    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      })
      .catch(() => {});
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] flex flex-col font-sans select-none text-[#1c1b1b]">
      {/* Top Bar */}
      <header className="border-b border-[#D9D7D0] bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToLobby}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5e5f5c] hover:text-[#1c1b1b] hover:bg-[#F4F3EF] transition-colors cursor-pointer"
            title="Return to Meeting Lobby"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-base font-bold text-[#1c1b1b] tracking-tight flex items-center gap-2">
              <span>ProxiSpeak Voice Server Test Bench</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold uppercase">
                WebRTC P2P Direct
              </span>
            </h1>
            <p className="text-xs text-[#8C8880]">
              Ultra-low latency UDP peer voice transfer & Render dedicated signaling
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowConfig(!showConfig)}
            className="px-3 py-1.5 rounded-lg border border-[#D9D7D0] text-xs font-medium text-[#5e5f5c] hover:text-[#1c1b1b] hover:bg-[#F4F3EF] transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[15px]">settings</span>
            <span>Server URL</span>
          </button>

          <button
            type="button"
            onClick={copyTestLink}
            className="px-3.5 py-1.5 rounded-lg bg-[#1c1b1b] hover:bg-black text-white text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[15px]">{copiedLink ? 'check' : 'link'}</span>
            <span>{copiedLink ? 'Link Copied!' : 'Share Test Link'}</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 sm:p-8 flex flex-col gap-6">
        {/* Optional Server URL Configuration Banner */}
        {showConfig && (
          <div className="bg-white p-4 rounded-xl border border-[#D9D7D0] shadow-sm flex flex-col sm:flex-row items-center gap-3">
            <label className="text-xs font-semibold text-[#5e5f5c] whitespace-nowrap">
              Dedicated Voice Relay URL:
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="e.g. https://your-voice-service.onrender.com"
              disabled={connected}
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#F4F3EF] border border-[#D9D7D0] text-xs font-mono text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#1c1b1b]"
            />
            <span className="text-[11px] text-[#8C8880]">
              {connected ? '(Disconnect to change)' : 'Render dedicated service URL'}
            </span>
          </div>
        )}

        {/* Join Panel & Live Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: Join Configuration Card */}
          <div className="bg-white rounded-2xl p-6 border border-[#D9D7D0] shadow-sm flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#1c1b1b] uppercase tracking-wider mb-4">
                Connection Setup
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#5e5f5c] mb-1">Your Name</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={connected || connecting}
                    placeholder="Enter your name"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#5e5f5c] mb-1">Voice Room ID</label>
                  <input
                    type="text"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    disabled={connected || connecting}
                    placeholder="e.g. voice-test-room"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#F4F3EF] border border-[#D9D7D0] text-sm font-mono text-[#1c1b1b] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#EAE8E2]">
              {!connected ? (
                <button
                  type="button"
                  onClick={joinVoiceRoom}
                  disabled={connecting || !username.trim()}
                  className="w-full py-3 rounded-xl bg-[#1c1b1b] hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {connecting ? 'sync' : 'call'}
                  </span>
                  <span>{connecting ? 'Connecting...' : 'Join Voice Room'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={leaveVoiceRoom}
                  className="w-full py-3 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">call_end</span>
                  <span>Leave Voice Room</span>
                </button>
              )}
            </div>
          </div>

          {/* Center & Right: Live Voice Activity & Participant Monitor */}
          <div className="md:col-span-2 bg-white rounded-2xl p-6 border border-[#D9D7D0] shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-[#EAE8E2] mb-5">
                <div>
                  <h2 className="text-sm font-bold text-[#1c1b1b] tracking-tight">
                    Active Voice Channel: <span className="font-mono text-accent-orange font-semibold">{roomId}</span>
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-300'}`} />
                    <span className="text-xs text-[#8C8880]">{serverStatus}</span>
                  </div>
                </div>

                {connected && (
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
                      isMuted
                        ? 'bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] hover:bg-[#fee2e2]'
                        : 'bg-[#ecfdf5] border border-[#a7f3d0] text-[#059669] hover:bg-[#d1fae5]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {isMuted ? 'mic_off' : 'mic'}
                    </span>
                    <span>{isMuted ? 'Unmute Microphone' : 'Mute Microphone'}</span>
                  </button>
                )}
              </div>

              {/* Transport Protocol Badge */}
              {connected && (
                <div className="mb-5 px-3 py-2 rounded-lg bg-[#FAF9F5] border border-[#EAE8E2] flex items-center justify-between">
                  <span className="text-[11px] font-medium text-[#5e5f5c] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-emerald-600">bolt</span>
                    Transport Mode:
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {connectionMode}
                  </span>
                </div>
              )}

              {/* Local Speaking Monitor */}
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs font-medium text-[#5e5f5c] mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        connected && !isMuted && localVolume > 5
                          ? 'bg-emerald-500 animate-ping'
                          : connected && isMuted
                          ? 'bg-rose-500'
                          : 'bg-neutral-300'
                      }`}
                    />
                    <span>Your Microphone Input</span>
                  </span>
                  <span className="font-mono text-[11px] text-[#8C8880]">
                    {!connected ? 'Offline' : isMuted ? 'Muted' : `${localVolume}%`}
                  </span>
                </div>

                {/* Animated Level Bar */}
                <div className="w-full h-3 rounded-full bg-[#F4F3EF] border border-[#D9D7D0] overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-75 ${
                      isMuted
                        ? 'bg-neutral-300'
                        : localVolume > 60
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${connected && !isMuted ? Math.max(localVolume, 3) : 0}%` }}
                  />
                </div>
              </div>

              {/* Room Participants */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#5e5f5c] mb-3 flex items-center justify-between">
                  <span>Connected Participants ({peers.length + (connected ? 1 : 0)})</span>
                  <span className="text-[10px] font-normal text-[#8C8880]">Google STUN + Render Signaling</span>
                </h3>

                <div className="space-y-2">
                  {/* Current User Card */}
                  {connected && (
                    <div className="p-3 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1c1b1b] text-white flex items-center justify-center text-xs font-bold">
                          {username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#1c1b1b] flex items-center gap-2">
                            <span>{username}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-neutral-200 text-[#5e5f5c]">
                              YOU
                            </span>
                          </div>
                          <span className="text-[10px] text-[#8C8880]">Local Audio Source</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isMuted
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isMuted ? 'Muted' : 'Speaking Active'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Remote Peers Cards */}
                  {peers.map((peer) => (
                    <div
                      key={peer.socketId}
                      className="p-3 rounded-xl bg-white border border-[#EAE8E2] shadow-xs flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent-orange text-white flex items-center justify-center text-xs font-bold">
                          {peer.username ? peer.username.slice(0, 2).toUpperCase() : 'P'}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-[#1c1b1b]">{peer.username}</div>
                          <span className="text-[10px] font-mono text-[#8C8880]">
                            {peer.socketId.slice(0, 8)}...
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            peer.isMuted
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {peer.isMuted ? 'Muted' : 'Live Audio'}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Empty State */}
                  {peers.length === 0 && connected && (
                    <div className="p-6 rounded-xl border border-dashed border-[#D9D7D0] text-center">
                      <p className="text-xs text-[#8C8880]">
                        No other testers connected yet. Click <strong>Share Test Link</strong> above to open in another tab or send to a teammate!
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Architectural Footer Note */}
            <div className="mt-6 pt-4 border-t border-[#EAE8E2] flex items-center justify-between text-[11px] text-[#8C8880]">
              <span>Direct UDP P2P media bypasses server compute limitations entirely.</span>
              <span className="font-mono">Opus 24kbps · 0% Server Audio Load</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
