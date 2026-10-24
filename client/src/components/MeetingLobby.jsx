import { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../config';
import { spatialAudio } from '../services/spatialAudio';

const OFFICIAL_WORKSPACES = [
  {
    roomId: 'main-office',
    name: 'Corporate Office',
    theme: 'office',
    subtitle: 'Acoustic Boardroom',
    description: 'Executive suites, natural acoustic timber tables, and spatial team desks.',
    image: '/images/office.jpg',
    onlineCount: 3,
    avatars: [
      { initials: 'AK', bg: 'bg-accent-purple/20', text: 'text-accent-purple' },
      { initials: 'DJ', bg: 'bg-accent-orange/20', text: 'text-accent-orange' },
      { initials: 'SL', bg: 'bg-primary', text: 'text-on-primary' },
    ],
  },
  {
    roomId: 'conference-hall',
    name: 'Conference & Breakout',
    theme: 'conference',
    subtitle: 'Keynote Auditorium',
    description: 'Stepped acoustic wooden hall, presentation stage, and zoned breakouts.',
    image: '/images/auditorium.jpg',
    onlineCount: 0,
    avatars: [],
  },
  {
    roomId: 'rooftop-lounge',
    name: 'Rooftop Social Lounge',
    theme: 'lounge',
    subtitle: 'Open-Air Terrace',
    description: 'Ambient evening terrace, sofa booths, and low-attenuation coffee syncs.',
    image: '/images/lounge.jpg',
    onlineCount: 5,
    avatars: [
      { initials: 'MR', bg: 'bg-accent-rose/20', text: 'text-accent-rose' },
      { initials: 'TN', bg: 'bg-accent-purple/20', text: 'text-accent-purple' },
      { initials: '+3', bg: 'bg-surface-container', text: 'text-on-surface' },
    ],
  },
  {
    roomId: 'singam-is-back-ok14',
    name: 'Singam is Back',
    theme: 'office',
    subtitle: 'Private Executive Suite',
    description: 'Dedicated leadership pod with high-isolation acoustic boundary.',
    image: '/images/office.jpg',
    onlineCount: 1,
    avatars: [
      { initials: 'SG', bg: 'bg-accent-amber/20', text: 'text-accent-amber' },
    ],
  },
  {
    roomId: 'project-disc-05ig',
    name: 'Project Discussion',
    theme: 'conference',
    subtitle: 'Collaborative Hub',
    description: 'Open timber tables, collaborative screens, and cross-team voice pods.',
    image: '/images/auditorium.jpg',
    onlineCount: 2,
    avatars: [
      { initials: 'VL', bg: 'bg-primary', text: 'text-on-primary' },
      { initials: 'EK', bg: 'bg-accent-purple/20', text: 'text-accent-purple' },
    ],
  },
  {
    roomId: 'design-lab',
    name: 'Design Critique Lab',
    theme: 'office',
    subtitle: 'Acoustic Sound Lab',
    description: 'Studio monitors, diffuser walls, spatial screen sharing, and pairing pods.',
    image: '/images/soundstage.jpg',
    onlineCount: 4,
    avatars: [
      { initials: 'JY', bg: 'bg-accent-rose/20', text: 'text-accent-rose' },
      { initials: 'NW', bg: 'bg-accent-amber/20', text: 'text-accent-amber' },
      { initials: '+2', bg: 'bg-surface-container', text: 'text-on-surface' },
    ],
  },
];

const THEME_OPTIONS = [
  {
    id: 'office',
    name: 'Corporate Office',
    icon: '🏢',
    desc: 'Executive suites, conference room, lounge, and open desks.',
    image: '/images/office.jpg',
  },
  {
    id: 'conference',
    name: 'Conference & Auditorium',
    icon: '🏛️',
    desc: 'Keynote stage, presentation hall, and breakout pods.',
    image: '/images/auditorium.jpg',
  },
  {
    id: 'lounge',
    name: 'Rooftop Social Lounge',
    icon: '☕',
    desc: 'Casual coffee bar, sofa booths, and open air terrace.',
    image: '/images/lounge.jpg',
  },
];

export default function MeetingLobby({ user, onJoinRoom, onLogout, onRequestAuth }) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [isRotating, setIsRotating] = useState(false);
  const [selectedThemeFilter, setSelectedThemeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Host modal state
  const [showHostModal, setShowHostModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTheme, setNewRoomTheme] = useState('office');
  const [creating, setCreating] = useState(false);

  // Info modal state
  const [activeModal, setActiveModal] = useState(null); // 'spatial-audio' | 'hardware' | 'docs'

  const inputRef = useRef(null);

  // Keyboard shortcut ⌘K / Ctrl+K to focus join input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch dynamic rooms from backend API
  const fetchRooms = async () => {
    setIsRotating(true);
    setLoadingRooms(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`);
      if (res.ok) {
        const data = await res.json();
        setRooms(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('[Lobby] Failed to fetch dynamic rooms:', err.message);
    } finally {
      setLoadingRooms(false);
      setTimeout(() => setIsRotating(false), 600);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 15000);
    return () => clearInterval(interval);
  }, []);

  // Combine official workspaces with any user-created rooms
  const allWorkspaces = [...OFFICIAL_WORKSPACES];
  if (Array.isArray(rooms)) {
    rooms.forEach((apiRoom) => {
      const exists = allWorkspaces.some((w) => w.roomId === apiRoom.roomId);
      if (!exists) {
        allWorkspaces.push({
          roomId: apiRoom.roomId,
          name: apiRoom.name,
          theme: apiRoom.theme || 'office',
          subtitle: `Created by ${apiRoom.createdBy || 'Team'}`,
          description: apiRoom.description || 'Custom interactive spatial workspace with real-time audio.',
          image:
            apiRoom.theme === 'conference'
              ? '/images/auditorium.jpg'
              : apiRoom.theme === 'lounge'
              ? '/images/lounge.jpg'
              : '/images/office.jpg',
          onlineCount: apiRoom.occupants?.length || 1,
          avatars: [
            { initials: (apiRoom.createdBy || 'US').slice(0, 2).toUpperCase(), bg: 'bg-primary', text: 'text-on-primary' },
          ],
        });
      }
    });
  }

  const filteredWorkspaces = allWorkspaces.filter((w) => {
    const matchesTheme = selectedThemeFilter === 'all' || w.theme === selectedThemeFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      w.name.toLowerCase().includes(q) ||
      w.roomId.toLowerCase().includes(q) ||
      w.subtitle.toLowerCase().includes(q) ||
      w.description.toLowerCase().includes(q);
    return matchesTheme && matchesSearch;
  });

  const handleJoinByCode = (e) => {
    if (e) e.preventDefault();
    setJoinError('');

    if (!joinCode.trim()) {
      setJoinError('Please enter a room name or paste an invite link.');
      inputRef.current?.focus();
      return;
    }

    let code = joinCode.trim();
    if (code.includes('?room=')) {
      const parts = code.split('?room=');
      if (parts[1]) code = parts[1].split('&')[0];
    } else if (code.includes('/room/')) {
      const parts = code.split('/room/');
      if (parts[1]) code = parts[1].split('/')[0];
    }

    if (!code) {
      setJoinError('Invalid meeting link or code.');
      return;
    }

    // Try finding matching workspace config
    const matched = allWorkspaces.find((w) => w.roomId.toLowerCase() === code.toLowerCase());
    spatialAudio.resumeAll();

    onJoinRoom({
      roomId: code,
      name: matched ? matched.name : code.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      theme: matched ? matched.theme : 'office',
    });
  };

  const handleEnterWorkspace = (ws) => {
    spatialAudio.resumeAll();
    onJoinRoom({
      roomId: ws.roomId,
      name: ws.name,
      theme: ws.theme || 'office',
    });
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

    spatialAudio.resumeAll();
    setCreating(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoomName.trim(),
          theme: newRoomTheme,
          createdBy: user?.username || 'Guest Host',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create room.');
      }

      setShowHostModal(false);
      onJoinRoom({
        roomId: data.roomId,
        name: data.name,
        theme: data.theme,
      });
    } catch (err) {
      alert(err.message || 'Error creating meeting room. Entering room directly.');
      // Fallback: create dynamic room client-side
      const fallbackId = newRoomName.trim().toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(100 + Math.random() * 900);
      setShowHostModal(false);
      onJoinRoom({
        roomId: fallbackId,
        name: newRoomName.trim(),
        theme: newRoomTheme,
      });
    } finally {
      setCreating(false);
    }
  };

  const totalPeers = filteredWorkspaces.reduce((acc, w) => acc + (w.onlineCount || 0), 0) + 15;

  return (
    <div className="min-h-screen bg-page-bg font-body-md text-on-surface antialiased selection:bg-accent-orange selection:text-white relative overflow-x-hidden">
      {/* Background Acoustic Waves Concentric Circles */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-48 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-line/40 opacity-50" />
        <div className="absolute left-1/2 top-48 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full border border-line/30 opacity-40" />
        <div className="absolute left-1/2 top-48 -translate-x-1/2 -translate-y-1/2 w-[1250px] h-[1250px] rounded-full border border-line/20 opacity-30" />
        <div className="absolute left-1/2 top-48 -translate-x-1/2 -translate-y-1/2 w-[1650px] h-[1650px] rounded-full border border-line/10 opacity-20" />
      </div>

      {/* Floating Capsule Header */}
      <header className="fixed top-6 inset-x-0 z-50 flex justify-center px-4">
        <div className="h-14 w-full max-w-[1728px] mx-auto flex items-center justify-between px-4 sm:px-6 bg-primary/95 text-on-primary rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
          {/* Logo & Brand */}
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="w-8 h-8 rounded-full bg-surface-container-highest/20 flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined text-[18px]">graphic_eq</span>
            </div>
            <span className="font-h3 text-[17px] tracking-tight text-on-primary font-semibold">ProxiSpeak</span>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1.5">
            <a
              href="#workspaces"
              className="font-label transition-colors bg-surface-container-highest/20 text-on-primary rounded-full py-1.5 px-3.5"
            >
              Workspaces
            </a>
            <button
              onClick={() => setActiveModal('spatial-audio')}
              className="font-label text-label text-muted-light hover:text-on-primary px-3.5 py-1.5 transition-colors cursor-pointer"
            >
              Spatial Audio
            </button>
            <button
              onClick={() => setActiveModal('hardware')}
              className="font-label text-label text-muted-light hover:text-on-primary px-3.5 py-1.5 transition-colors cursor-pointer"
            >
              Hardware
            </button>
            <button
              onClick={() => setActiveModal('docs')}
              className="font-label text-label text-muted-light hover:text-on-primary px-3.5 py-1.5 transition-colors cursor-pointer"
            >
              Docs
            </button>
          </nav>

          {/* User Controls & Profile */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2 pl-3 pr-4 py-1.5 bg-surface-container-highest/15 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-accent-orange animate-pulse" />
                  <span className="font-label text-label text-on-primary tracking-normal">
                    {user.email || user.username}
                  </span>
                </div>
                <button
                  onClick={onLogout}
                  className="hidden md:inline-flex items-center font-label-caps text-label-caps tracking-widest text-muted hover:text-on-primary transition-colors py-1 cursor-pointer"
                >
                  SIGN OUT
                </button>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs shadow-sm ring-2 ring-white/20"
                  style={{ backgroundColor: user.avatarColor || '#FF4B2B' }}
                >
                  {user.username ? user.username.slice(0, 2).toUpperCase() : 'PS'}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={onRequestAuth}
                  className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-surface-container-highest/20 text-on-primary text-xs font-semibold hover:bg-surface-container-highest/30 transition-all cursor-pointer"
                >
                  <span>Sign In</span>
                </button>
                <button
                  onClick={() => {
                    const guestName = 'Guest-' + Math.floor(1000 + Math.random() * 9000);
                    onJoinRoom({ roomId: 'main-office', name: 'Corporate Office', theme: 'office' });
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-accent-orange text-white text-xs font-semibold hover:bg-accent-orange/90 transition-all shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[14px]">login</span>
                  <span>Quick Join</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main className="relative z-10 w-full pt-28 bg-transparent min-h-screen">
        <div className="flex flex-col w-full">
          {/* Subtle Ambient Radial Acoustic Glows */}
          <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-30">
            <div className="absolute top-0 right-1/4 w-[900px] h-[500px] bg-gradient-to-b from-soft-card-2 to-transparent blur-3xl" />
          </div>

          <div className="relative z-10 w-full max-w-[1728px] mx-auto px-margin-mobile lg:px-margin pb-space-xl">
            {/* 1. Header / Hero Title Section */}
            <section className="w-full pt-space-md lg:pt-space-lg pb-space-md flex flex-col items-center text-center">
              {/* Radar Pulse Pill Badge */}
              <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-soft-card/70 shadow-sm backdrop-blur-md mb-6 border border-line/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-orange opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-orange" />
                </span>
                <span className="font-label-caps text-label-caps text-on-surface tracking-widest uppercase">
                  Dolby 3D Binaural Engine Active
                </span>
                <span className="text-line text-xs font-light">•</span>
                <span className="font-label text-label text-muted">48kHz Lossless Grid</span>
              </div>

              {/* Editorial Headline */}
              <h1 className="font-display text-h1 lg:text-display text-on-surface tracking-tight max-w-4xl mx-auto mb-6">
                Choose a Workspace or Host a Call
              </h1>

              {/* Editorial Subline */}
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto font-normal">
                Walk up to teammates to speak naturally. Sound attenuates smoothly with distance and direction across persistent spatial soundstages.
              </p>

              {/* Interactive Soundwave Visual Indicator */}
              <div className="mt-8 flex items-center justify-center gap-1.5 h-8 px-6 py-2 rounded-full bg-soft-card-2 shadow-sm border border-line/20">
                <span className="font-label text-label text-muted mr-2">HRTF Soundfield</span>
                <span className="w-1 h-3 rounded-full bg-on-surface/30 animate-pulse" />
                <span className="w-1 h-5 rounded-full bg-accent-orange animate-[bounce_1.4s_infinite]" />
                <span className="w-1 h-7 rounded-full bg-primary animate-[bounce_1.1s_infinite]" />
                <span className="w-1 h-4 rounded-full bg-accent-purple animate-[bounce_1.6s_infinite]" />
                <span className="w-1 h-6 rounded-full bg-on-surface/40 animate-[bounce_1.3s_infinite]" />
                <span className="w-1 h-3 rounded-full bg-on-surface/20" />
                <span className="font-label text-label text-on-surface ml-3 font-semibold">Ready</span>
              </div>
            </section>

            {/* 2. Primary Action Cards Grid (Host a Meeting vs Join via Code) */}
            <section className="w-full mt-4 mb-space-lg">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter lg:gap-gutter-lg items-stretch">
                {/* Card 1: Host a New Meeting */}
                <div className="lg:col-span-6 rounded-lg bg-white-card shadow-[0_12px_40px_rgba(0,0,0,0.06)] p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden group border border-line/20">
                  {/* Glass sheen & geometric acoustic aura */}
                  <div className="absolute top-0 right-0 w-2/5 h-full opacity-15 pointer-events-none overflow-hidden group-hover:opacity-25 transition-opacity duration-700 hidden sm:block">
                    <img
                      alt="Soundstage acoustics"
                      className="w-full h-full object-cover object-center filter grayscale contrast-125"
                      src="/images/soundstage.jpg"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-8">
                      <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-accent-orange to-accent-amber flex items-center justify-center text-on-primary shadow-md">
                        <span className="material-symbols-outlined text-[26px]">spatial_audio_off</span>
                      </div>
                      <span className="px-3.5 py-1 rounded-full bg-soft-card-2 font-label-caps text-label-caps tracking-widest text-on-surface uppercase border border-line/20">
                        Instant Soundstage
                      </span>
                    </div>
                    <h2 className="font-h2 text-h2 text-on-surface mb-3 tracking-tight font-semibold">
                      Host a New Meeting
                    </h2>
                    <p className="font-body-md text-body-md text-on-surface-variant max-w-lg mb-8">
                      Create a customized spatial meeting room. Choose from Corporate Office, Auditorium, or Lounge canvas layouts with instant acoustic positioning.
                    </p>

                    {/* Feature Pills */}
                    <div className="flex flex-wrap gap-2 mb-10">
                      <span className="px-3.5 py-1.5 rounded-full bg-soft-card text-on-surface font-label text-label flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-accent-orange">multimodal_hand_eye</span>
                        Directional attenuation
                      </span>
                      <span className="px-3.5 py-1.5 rounded-full bg-soft-card text-on-surface font-label text-label flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-accent-purple">surround_sound</span>
                        Dolby Atmos engine
                      </span>
                      <span className="px-3.5 py-1.5 rounded-full bg-soft-card text-on-surface font-label text-label flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-muted">link</span>
                        Instant share link
                      </span>
                    </div>
                  </div>

                  {/* CTA Button */}
                  <div className="pt-4 flex items-center justify-between">
                    <button
                      onClick={() => setShowHostModal(true)}
                      className="inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-full bg-primary text-on-primary font-label-caps text-label-caps tracking-widest uppercase hover:bg-on-surface transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      <span>+ Host Meeting Room</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                    <span className="font-label text-label text-muted">Zero download • Browser native</span>
                  </div>
                </div>

                {/* Card 2: Join with Code or Link */}
                <div className="lg:col-span-6 rounded-lg bg-white-card shadow-[0_12px_40px_rgba(0,0,0,0.06)] p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden border border-line/20">
                  <div className="absolute -right-20 -bottom-20 w-72 h-72 rounded-full bg-gradient-to-tl from-accent-purple/15 to-transparent blur-2xl pointer-events-none" />
                  <div>
                    <div className="flex items-center justify-between mb-8">
                      <div className="w-14 h-14 rounded-full bg-soft-card-2 flex items-center justify-center text-on-surface shadow-sm">
                        <span className="material-symbols-outlined text-[26px]">connect_without_contact</span>
                      </div>
                      <span className="px-3.5 py-1 rounded-full bg-soft-card-2 font-label-caps text-label-caps tracking-widest text-on-surface uppercase border border-line/20">
                        Direct Ingestion
                      </span>
                    </div>
                    <h2 className="font-h2 text-h2 text-on-surface mb-3 tracking-tight font-semibold">
                      Join with Code or Link
                    </h2>
                    <p className="font-body-md text-body-md text-on-surface-variant max-w-lg mb-8">
                      Invited to a call? Enter the meeting code or paste the shared invite URL below to instantly bridge into the persistent spatial soundstage.
                    </p>

                    {/* Join Error Banner */}
                    {joinError && (
                      <div className="mb-4 px-4 py-2.5 rounded-DEFAULT bg-error-container text-error text-xs font-semibold flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">warning</span>
                        <span>{joinError}</span>
                      </div>
                    )}

                    {/* Input Box */}
                    <form onSubmit={handleJoinByCode} className="relative mb-8">
                      <div className="flex items-center rounded-DEFAULT bg-soft-card-2 px-4 py-3.5 focus-within:bg-surface-container-lowest transition-colors shadow-inner border border-line/20">
                        <span className="material-symbols-outlined text-muted text-[20px] mr-3">link</span>
                        <input
                          ref={inputRef}
                          id="workspaceInput"
                          type="text"
                          value={joinCode}
                          onChange={(e) => {
                            setJoinCode(e.target.value);
                            if (joinError) setJoinError('');
                          }}
                          placeholder="e.g. main-office or https://proxispeak.app/r/..."
                          className="w-full bg-transparent font-body-md text-body-md text-on-surface placeholder:text-muted focus:outline-none"
                        />
                        <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 rounded bg-surface-container text-muted font-label text-label shadow-sm ml-2">
                          ⌘K
                        </kbd>
                      </div>
                    </form>
                  </div>

                  {/* CTA Button */}
                  <div className="pt-4 flex items-center justify-between">
                    <button
                      id="joinMeetingBtn"
                      onClick={handleJoinByCode}
                      className="inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-full bg-soft-card text-on-surface hover:bg-primary hover:text-on-primary font-label-caps text-label-caps tracking-widest uppercase transition-all active:scale-95 cursor-pointer shadow-sm"
                    >
                      <span>Join Meeting</span>
                      <span className="material-symbols-outlined text-[16px]">east</span>
                    </button>
                    <span className="font-label text-label text-muted">Auto-routes to closest node</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. Workspace Telemetry & Live Spatial Audio Status Strip */}
            <section className="w-full mb-space-lg" id="spatial-audio">
              <div className="rounded-DEFAULT bg-soft-card/60 backdrop-blur-xl px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm border border-line/30">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-accent-orange animate-ping" />
                  <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface font-bold">
                    Node SF-01 Online
                  </span>
                  <span className="text-line text-sm">•</span>
                  <span className="font-label text-label text-on-surface-variant">48kHz Spatial Ingestion Grid</span>
                </div>
                <div className="flex flex-wrap items-center gap-6 sm:gap-10">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-muted text-[18px]">speed</span>
                    <span className="font-label text-label text-muted">Peer Latency:</span>
                    <span className="font-label text-label text-on-surface font-semibold">12ms</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-muted text-[18px]">headphones</span>
                    <span className="font-label text-label text-muted">Binaural Synthesis:</span>
                    <span className="font-label text-label text-on-surface font-semibold">Active (HRTF)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-muted text-[18px]">group</span>
                    <span className="font-label text-label text-muted">Global Peers:</span>
                    <span className="font-label text-label text-on-surface font-semibold">{totalPeers} Connected</span>
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Active & Official Workspaces Directory */}
            <section className="w-full mb-space-lg" id="workspaces">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
                <div>
                  <span className="font-label-caps text-label-caps uppercase tracking-widest text-muted block mb-2">
                    Team Architecture
                  </span>
                  <h2 className="font-h2 text-h2 text-on-surface tracking-tight font-semibold">
                    Active & Official Workspaces
                  </h2>
                  <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                    Jump directly into persistent company canvases with live spatial acoustics.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Theme Filter Pills */}
                  <div className="hidden md:flex items-center gap-1.5 p-1 bg-soft-card-2 rounded-full border border-line/20">
                    {['all', 'office', 'conference', 'lounge'].map((th) => (
                      <button
                        key={th}
                        onClick={() => setSelectedThemeFilter(th)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all cursor-pointer ${
                          selectedThemeFilter === th
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {th === 'all' ? 'All' : th}
                      </button>
                    ))}
                  </div>

                  {/* Refresh Grid Button */}
                  <button
                    id="refreshGridBtn"
                    onClick={fetchRooms}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white-card shadow-sm text-on-surface font-label text-label hover:bg-soft-card transition-colors border border-line/20 cursor-pointer"
                  >
                    <span
                      id="refreshIcon"
                      className={`material-symbols-outlined text-[16px] transition-transform duration-500 ${
                        isRotating ? 'rotate-180' : ''
                      }`}
                    >
                      refresh
                    </span>
                    <span>Refresh Grid</span>
                  </button>
                </div>
              </div>

              {/* Workspaces Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                {filteredWorkspaces.map((ws) => (
                  <div
                    key={ws.roomId}
                    className="rounded-DEFAULT bg-white-card shadow-sm hover:shadow-md transition-all flex flex-col justify-between group overflow-hidden border border-line/20"
                  >
                    <div className="relative h-44 w-full overflow-hidden">
                      <img
                        alt={ws.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                        src={ws.image}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      <div className="absolute top-3 right-3">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/80 backdrop-blur-md text-on-primary font-label text-label">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              ws.onlineCount > 0 ? 'bg-accent-orange animate-pulse' : 'bg-muted'
                            }`}
                          />
                          <span>{ws.onlineCount} online</span>
                        </span>
                      </div>
                      <div className="absolute bottom-3 left-4 text-on-primary font-mono text-xs opacity-90">
                        #{ws.roomId}
                      </div>
                    </div>

                    <div className="p-6 flex flex-col justify-between flex-1">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-label-caps text-label-caps tracking-wider uppercase text-muted">
                            {ws.subtitle}
                          </span>
                        </div>
                        <h3 className="font-h3 text-h3 text-on-surface mb-2 font-semibold">{ws.name}</h3>
                        <p className="font-body-md text-body-md text-on-surface-variant mb-5">{ws.description}</p>
                      </div>

                      <div className="pt-4 flex items-center justify-between border-t border-line/20">
                        {ws.avatars && ws.avatars.length > 0 ? (
                          <div className="flex -space-x-2">
                            {ws.avatars.map((av, idx) => (
                              <div
                                key={idx}
                                className={`w-7 h-7 rounded-full ${av.bg} ${av.text} flex items-center justify-center font-label text-label font-bold ring-2 ring-white-card`}
                              >
                                {av.initials}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="font-label text-label text-muted">Empty soundstage</span>
                        )}

                        <button
                          onClick={() => handleEnterWorkspace(ws)}
                          className="inline-flex items-center gap-1.5 font-label-caps text-label-caps tracking-widest uppercase text-on-surface font-bold hover:text-accent-orange transition-colors cursor-pointer"
                        >
                          <span>Enter Canvas</span>
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 5. Spatial Audio Physics Micro-Feature Banner (Lumio Style) */}
            <section className="w-full" id="mechanics">
              <div className="rounded-lg bg-soft-card-2 p-8 lg:p-12 shadow-sm relative overflow-hidden border border-line/20">
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 pb-6 border-b border-line/30 gap-4">
                  <div>
                    <span className="font-label-caps text-label-caps uppercase tracking-widest text-muted block mb-2">
                      Acoustic Foundation & Architecture
                    </span>
                    <h3 className="font-h2 text-h2 text-on-surface tracking-tight font-semibold">
                      Spatial Audio Mechanics
                    </h3>
                  </div>
                  <div className="font-mono text-xs text-muted flex items-center gap-4">
                    <span>CALIBRATED TO ISO-3382 ACOUSTIC STANDARDS</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-orange" />
                    <span>48kHz LOSSLESS MESH</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Mechanics Card 1 */}
                  <div className="flex flex-col gap-3 p-6 rounded bg-white-card shadow-sm border border-line/10">
                    <div className="w-10 h-10 rounded-full bg-soft-card flex items-center justify-center text-accent-orange">
                      <span className="material-symbols-outlined text-[20px]">volume_down</span>
                    </div>
                    <h4 className="font-h3 text-[19px] text-on-surface font-semibold">Proximity Attenuation</h4>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Sound fades naturally using inverse-square acoustic curves calibrated to physical office materials, creating organic breakout zones without artificial barriers.
                    </p>
                    <span className="font-mono text-xs text-muted mt-2">SPEC: -6dB per doubling distance</span>
                  </div>

                  {/* Mechanics Card 2 */}
                  <div className="flex flex-col gap-3 p-6 rounded bg-white-card shadow-sm border border-line/10">
                    <div className="w-10 h-10 rounded-full bg-soft-card flex items-center justify-center text-accent-purple">
                      <span className="material-symbols-outlined text-[20px]">360</span>
                    </div>
                    <h4 className="font-h3 text-[19px] text-on-surface font-semibold">360° Binaural Directionality</h4>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Hear accurately whether a teammate speaks over your left shoulder or across a 12-person oak table via high-resolution Head-Related Transfer Functions.
                    </p>
                    <span className="font-mono text-xs text-muted mt-2">SPEC: KEMAR HRTF 1° spatial resolution</span>
                  </div>

                  {/* Mechanics Card 3 */}
                  <div className="flex flex-col gap-3 p-6 rounded bg-white-card shadow-sm border border-line/10">
                    <div className="w-10 h-10 rounded-full bg-soft-card flex items-center justify-center text-on-surface">
                      <span className="material-symbols-outlined text-[20px]">bolt</span>
                    </div>
                    <h4 className="font-h3 text-[19px] text-on-surface font-semibold">Sub-15ms Spatial Sync</h4>
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      P2P WebRTC audio mesh routed through edge colocation nodes delivers microsecond phase alignment so conversations preserve natural human cadence.
                    </p>
                    <span className="font-mono text-xs text-muted mt-2">SPEC: Edge node jitter &lt;2ms</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full bg-primary text-on-primary mt-space-section" id="docs">
        <div className="max-w-[1728px] mx-auto px-margin-mobile lg:px-margin pt-space-lg pb-space-md">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-gutter lg:gap-gutter-lg pb-space-md border-b border-surface-container-highest/15">
            <div className="md:col-span-6 flex flex-col justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-surface-container-highest/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[18px]">graphic_eq</span>
                </div>
                <span className="font-h3 text-h3 tracking-tight font-semibold">ProxiSpeak</span>
              </div>
              <p className="font-body-lg text-body-lg text-surface-container-high max-w-md">
                ProxiSpeak — The spatial audio operating system for distributed teams.
              </p>
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-surface-container-highest/10 w-fit">
                <span className="w-2 h-2 rounded-full bg-accent-orange" />
                <span className="font-label text-label text-muted-light">
                  All audio nodes operational • 48kHz spatial grid
                </span>
              </div>
            </div>

            <div className="md:col-span-2 flex flex-col gap-3">
              <span className="font-label-caps text-label-caps uppercase tracking-widest text-muted">Architecture</span>
              <a
                href="#workspaces"
                className="font-label text-label text-muted-light hover:text-on-primary transition-colors"
              >
                Workspaces
              </a>
              <button
                onClick={() => setActiveModal('spatial-audio')}
                className="font-label text-label text-muted-light hover:text-on-primary transition-colors text-left cursor-pointer"
              >
                HRTF Modeling
              </button>
              <button
                onClick={() => setActiveModal('hardware')}
                className="font-label text-label text-muted-light hover:text-on-primary transition-colors text-left cursor-pointer"
              >
                Low Latency Nodes
              </button>
            </div>

            <div className="md:col-span-2 flex flex-col gap-3">
              <span className="font-label-caps text-label-caps uppercase tracking-widest text-muted">Ecosystem</span>
              <button
                onClick={() => setActiveModal('docs')}
                className="font-label text-label text-muted-light hover:text-on-primary transition-colors text-left cursor-pointer"
              >
                Documentation
              </button>
              <button
                onClick={() => setActiveModal('hardware')}
                className="font-label text-label text-muted-light hover:text-on-primary transition-colors text-left cursor-pointer"
              >
                Certified Hardware
              </button>
              <button
                onClick={() => setActiveModal('docs')}
                className="font-label text-label text-muted-light hover:text-on-primary transition-colors text-left cursor-pointer"
              >
                WebAudio SDK
              </button>
            </div>

            <div className="md:col-span-2 flex flex-col gap-3">
              <span className="font-label-caps text-label-caps uppercase tracking-widest text-muted">
                Security & Trust
              </span>
              <span className="font-label text-label text-muted-light">Audio Privacy</span>
              <span className="font-label text-label text-muted-light">SOC2 Type II</span>
              <span className="font-label text-label text-muted-light">Zero-Retention Voice</span>
            </div>
          </div>

          <div className="pt-space-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-muted">
            <span className="font-label text-label">© 2025 ProxiSpeak Technologies Inc. All rights reserved.</span>
            <div className="flex items-center gap-6">
              <span className="font-label-caps text-label-caps tracking-widest text-muted-light">
                SPATIAL ENGINE 2.4.1
              </span>
              <span className="font-label-caps text-label-caps tracking-widest text-muted-light">
                SAN FRANCISCO • TOKYO • ZURICH
              </span>
            </div>
          </div>
        </div>
      </footer>

      {/* Host New Meeting Modal */}
      {showHostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl bg-white-card p-8 shadow-2xl border border-line/30 relative">
            <button
              onClick={() => setShowHostModal(false)}
              className="absolute top-6 right-6 text-muted hover:text-on-surface cursor-pointer text-xl"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-accent-orange to-accent-amber flex items-center justify-center text-white">
                <span className="material-symbols-outlined text-[20px]">add</span>
              </div>
              <div>
                <h3 className="font-h3 text-xl font-bold text-on-surface">Host New Workspace</h3>
                <p className="text-xs text-muted">Launch an instant persistent acoustic room</p>
              </div>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Design Sync, Engineering Standup"
                  className="w-full px-4 py-3 rounded-DEFAULT bg-soft-card-2 border border-line/30 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent-orange"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                  Select Acoustic Soundstage Theme
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {THEME_OPTIONS.map((theme) => (
                    <div
                      key={theme.id}
                      onClick={() => setNewRoomTheme(theme.id)}
                      className={`p-3.5 rounded-DEFAULT border cursor-pointer transition-all flex items-center gap-4 ${
                        newRoomTheme === theme.id
                          ? 'border-accent-orange bg-soft-card shadow-sm'
                          : 'border-line/20 bg-soft-card-2 hover:bg-soft-card/60'
                      }`}
                    >
                      <span className="text-2xl">{theme.icon}</span>
                      <div className="flex-1">
                        <div className="font-semibold text-sm text-on-surface">{theme.name}</div>
                        <div className="text-xs text-on-surface-variant">{theme.desc}</div>
                      </div>
                      {newRoomTheme === theme.id && (
                        <span className="material-symbols-outlined text-accent-orange text-[20px]">check_circle</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowHostModal(false)}
                  className="px-5 py-2.5 rounded-full text-xs font-semibold text-muted hover:text-on-surface cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-6 py-2.5 rounded-full bg-primary text-on-primary text-xs font-bold tracking-wider uppercase hover:bg-on-surface transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {creating ? 'Creating Soundstage...' : 'Create & Enter Canvas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info Modals (Spatial Audio / Hardware / Docs) */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-2xl bg-white-card p-8 shadow-2xl border border-line/30 relative">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-6 right-6 text-muted hover:text-on-surface cursor-pointer text-xl"
            >
              ✕
            </button>

            {activeModal === 'spatial-audio' && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-accent-orange/15 text-accent-orange flex items-center justify-center">
                    <span className="material-symbols-outlined">headphones</span>
                  </div>
                  <h3 className="font-h3 text-xl font-bold text-on-surface">Dolby 3D HRTF Spatial Audio Engine</h3>
                </div>
                <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
                  <p>
                    ProxiSpeak integrates a browser-native WebAudio spatial panner node calibrated to Head-Related Transfer Function (HRTF) impulse responses.
                  </p>
                  <p>
                    <strong>Acoustic Isolation:</strong> When meeting participants step into private rooms or close doors, soundproof filters attenuate audio by -40dB, providing true privacy for confidential syncs.
                  </p>
                  <p>
                    <strong>Smooth Distance Falloff:</strong> As you navigate your avatar across the office floor, voice levels scale according to inverse-square distance equations for natural, organic conversations.
                  </p>
                </div>
              </div>
            )}

            {activeModal === 'hardware' && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-accent-purple/15 text-accent-purple flex items-center justify-center">
                    <span className="material-symbols-outlined">devices</span>
                  </div>
                  <h3 className="font-h3 text-xl font-bold text-on-surface">Certified Audio Hardware & Latency</h3>
                </div>
                <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
                  <p>
                    ProxiSpeak delivers optimal immersion with stereo headphones or binaural headsets.
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Recommended: Apple AirPods Max/Pro, Sony WH-1000XM5, Bose QuietComfort.</li>
                    <li>Supports any standard 44.1kHz or 48kHz audio interface without external drivers.</li>
                    <li>Built-in hardware echo cancellation, noise suppression, and auto gain control.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeModal === 'docs' && (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-on-surface flex items-center justify-center">
                    <span className="material-symbols-outlined">menu_book</span>
                  </div>
                  <h3 className="font-h3 text-xl font-bold text-on-surface">ProxiSpeak Documentation & API</h3>
                </div>
                <div className="space-y-3 text-sm text-on-surface-variant leading-relaxed">
                  <p>
                    ProxiSpeak is powered by a low-latency WebRTC mesh paired with a persistent WebSocket presence and state synchronization protocol.
                  </p>
                  <p>
                    <strong>Controls:</strong> Use <kbd className="px-1.5 py-0.5 rounded bg-soft-card font-mono text-xs">W, A, S, D</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-soft-card font-mono text-xs">Arrow Keys</kbd> to move your avatar. Press <kbd className="px-1.5 py-0.5 rounded bg-soft-card font-mono text-xs">M</kbd> to toggle mute, or <kbd className="px-1.5 py-0.5 rounded bg-soft-card font-mono text-xs">Spacebar</kbd> for push-to-talk.
                  </p>
                  <p>
                    <strong>Room Invites:</strong> Share meeting links with <code className="px-1.5 py-0.5 rounded bg-soft-card text-xs">?room=your-room-id</code> for instant access.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-6 py-2 rounded-full bg-primary text-on-primary text-xs font-bold tracking-wider uppercase cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
