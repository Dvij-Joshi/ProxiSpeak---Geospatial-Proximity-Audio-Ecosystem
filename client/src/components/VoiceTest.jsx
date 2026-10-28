import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

export default function VoiceTest({ user, onBackToLobby }) {
  // Voice server URL: defaults to localhost in dev, or custom URL
  const defaultServerUrl = import.meta.env.VITE_VOICE_SERVER_URL || 'http://localhost:5001';
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [showConfig, setShowConfig] = useState(false);

  const [username, setUsername] = useState(user?.username || `Tester-${Math.floor(100 + Math.random() * 900)}`);
  const [roomId, setRoomId] = useState('voice-test-room');

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [localVolume, setLocalVolume] = useState(0);
  const [peers, setPeers] = useState([]);
  const [serverStatus, setServerStatus] = useState('idle');
  const [copiedLink, setCopiedLink] = useState(false);

  const socketRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const isMutedRef = useRef(false);
  const animFrameRef = useRef(null);

  // Sync ref with state
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      leaveVoiceRoom();
    };
  }, []);

  // Check URL query parameters for pre-filled room (?room=xxx)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('voiceRoom');
      if (roomParam) setRoomId(roomParam.trim());
    } catch (_e) {}
  }, []);

  const joinVoiceRoom = async () => {
    if (!username.trim() || !roomId.trim()) return;

    setConnecting(true);
    setServerStatus('Connecting to dedicated voice server...');

    try {
      // 1. Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 2. Initialize Web Audio Context
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
      audioContextRef.current = audioCtx;

      // 3. Setup local voice volume analyzer
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

      // 4. Connect to Dedicated Voice Server via Socket.io
      const socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        setConnecting(false);
        setServerStatus('Connected & Transmitting');

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

      // Existing room peers
      socket.on('room-peers', ({ peers: existingPeers }) => {
        setPeers(existingPeers || []);
      });

      // New peer joined
      socket.on('peer-joined', (newPeer) => {
        setPeers((prev) => {
          if (prev.some((p) => p.socketId === newPeer.socketId)) return prev;
          return [...prev, newPeer];
        });
      });

      // Peer mute status changed
      socket.on('peer-mute-changed', ({ socketId, isMuted: peerMuted }) => {
        setPeers((prev) =>
          prev.map((p) => (p.socketId === socketId ? { ...p, isMuted: peerMuted } : p))
        );
      });

      // Peer left
      socket.on('peer-left', ({ socketId }) => {
        setPeers((prev) => prev.filter((p) => p.socketId !== socketId));
      });

      // 5. Setup Audio Chunk capture using ScriptProcessorNode for real-time PCM relay
      const bufferSize = 2048;
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !socket.connected) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Transmit float32 PCM samples directly
        socket.emit('voice-pcm-chunk', {
          pcmData: Array.from(inputData),
          sampleRate: audioCtx.sampleRate,
        });
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      // 6. Play incoming PCM chunks from remote peers
      let nextPlayTime = audioCtx.currentTime;

      socket.on('peer-pcm-chunk', ({ pcmData, sampleRate }) => {
        if (!pcmData || !audioCtx) return;

        try {
          const floatArray = new Float32Array(pcmData);
          const audioBuffer = audioCtx.createBuffer(1, floatArray.length, sampleRate || 44100);
          audioBuffer.getChannelData(0).set(floatArray);

          const playSource = audioCtx.createBufferSource();
          playSource.buffer = audioBuffer;
          playSource.connect(audioCtx.destination);

          // Schedule seamlessly without stutter
          nextPlayTime = Math.max(audioCtx.currentTime, nextPlayTime);
          playSource.start(nextPlayTime);
          nextPlayTime += audioBuffer.duration;
        } catch (err) {
          console.error('[VoiceTest] Error playing audio chunk:', err);
        }
      });
    } catch (err) {
      console.error('[VoiceTest] Initialization error:', err);
      setServerStatus(`Microphone Error: ${err.message}`);
      setConnecting(false);
      leaveVoiceRoom();
    }
  };

  const leaveVoiceRoom = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
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
    setPeers([]);
    setLocalVolume(0);
    setServerStatus('Disconnected');
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (socketRef.current) {
      socketRef.current.emit('set-mute', { isMuted: nextMuted });
    }
  };

  const copyTestLink = () => {
    const url = `${window.location.origin}/?voiceRoom=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#1c1b1b] flex flex-col font-sans">
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
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#E9E8E4] text-[#5e5f5c] uppercase">
                Render Dedicated
              </span>
            </h1>
            <p className="text-xs text-[#8C8880]">
              Direct web-based voice transfer relay with zero external metered TURN keys
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
            className="px-3.5 py-1.5 rounded-lg bg-[#1c1b1b] hover:bg-black text-white text-xs font-medium transition-colors shadow-sm flex items-center gap-1.5"
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
              placeholder="e.g. https://your-voice-service.onrender.com or http://localhost:5001"
              disabled={connected}
              className="flex-1 px-3 py-1.5 rounded-lg bg-[#F4F3EF] border border-[#D9D7D0] text-xs font-mono text-[#1c1b1b] focus:outline-none focus:ring-1 focus:ring-[#1c1b1b]"
            />
            <span className="text-[11px] text-[#8C8880]">
              {connected ? '(Disconnect to change)' : 'Paste your Render service URL here'}
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
                  <p className="text-xs text-[#8C8880] mt-0.5">{serverStatus}</p>
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
                  <span className="text-[10px] font-normal text-[#8C8880]">Render WebSocket Relay</span>
                </h3>

                <div className="space-y-2">
                  {/* Current User Card */}
                  {connected && (
                    <div className="p-3 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#1c1b1b] text-white flex items-center justify-center text-xs font-bold">
                          {username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-[#1c1b1b]">{username} (You)</span>
                          <div className="text-[10px] text-[#8C8880]">Local Audio Node</div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isMuted ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#ecfdf5] text-[#059669]'
                        }`}
                      >
                        {isMuted ? 'Muted' : 'Speaking Active'}
                      </span>
                    </div>
                  )}

                  {/* Remote Peers */}
                  {peers.map((peer) => (
                    <div
                      key={peer.socketId}
                      className="p-3 rounded-xl bg-white border border-[#D9D7D0] flex items-center justify-between shadow-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#E9E8E4] text-[#1c1b1b] flex items-center justify-center text-xs font-bold border border-[#D9D7D0]">
                          {(peer.username || 'P').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-[#1c1b1b]">{peer.username}</span>
                          <div className="text-[10px] text-[#8C8880]">Remote Peer ({peer.socketId.slice(0, 6)})</div>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          peer.isMuted ? 'bg-[#fef2f2] text-[#dc2626]' : 'bg-[#ecfdf5] text-[#059669]'
                        }`}
                      >
                        {peer.isMuted ? 'Muted' : 'Online'}
                      </span>
                    </div>
                  ))}

                  {connected && peers.length === 0 && (
                    <div className="p-4 rounded-xl border border-dashed border-[#D9D7D0] text-center text-xs text-[#8C8880]">
                      No other peers in room yet. Open this page in a second browser window or phone to test voice transfer!
                    </div>
                  )}

                  {!connected && (
                    <div className="p-4 rounded-xl border border-dashed border-[#D9D7D0] text-center text-xs text-[#8C8880]">
                      Join the room to connect your microphone and talk with peers.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Status Pill */}
            <div className="mt-6 pt-3 border-t border-[#EAE8E2] flex items-center justify-between text-[11px] text-[#8C8880]">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                <span>Audio Engine: Web Audio API (PCM Stream)</span>
              </div>
              <span>No Metered API Key required</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
