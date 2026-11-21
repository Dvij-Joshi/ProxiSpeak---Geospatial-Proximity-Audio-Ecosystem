import { useState, useEffect, useRef, useMemo } from 'react';
import { SERVER_URL } from '../config';
import { playUiChime } from '../services/meetingSounds';
import { spatialAudio } from '../services/spatialAudio';
import { webrtc } from '../services/webrtc';
import { isCompanyEmail, classifyUserAccount } from '../utils/userType';

const OFFICIAL_SPACES = [
  {
    roomId: 'main-office',
    name: 'Corporate Headquarters',
    theme: 'office',
    badge: 'Acoustic Boardroom',
    description: 'Executive suites, acoustic timber tables, and spatial team desks.',
    icon: 'corporate_fare',
    accentColor: '#277970',
    occupants: 3,
  },
  {
    roomId: 'conference-hall',
    name: 'Townhall & Keynote Auditorium',
    theme: 'conference',
    badge: 'Keynote Stage',
    description: 'High-gain presentation stage, auditorium rows, and acoustic wings.',
    icon: 'account_balance',
    accentColor: '#7c3aed',
    occupants: 0,
  },
  {
    roomId: 'rooftop-lounge',
    name: 'Executive Sky Rooftop Lounge',
    theme: 'rooftop',
    badge: 'Ambient Terrace',
    description: 'Fireside sofa clusters, espresso bar, and relaxed social drop-off.',
    icon: 'deck',
    accentColor: '#059669',
    occupants: 5,
  },
  {
    roomId: 'design-lab',
    name: 'Design Critique & Pairing Lab',
    theme: 'office',
    badge: 'Pairing Pods',
    description: 'Studio monitors, acoustic diffusers, and screen sharing tables.',
    icon: 'draw',
    accentColor: '#e18239',
    occupants: 2,
  },
];

export default function Dashboard({
  user,
  activeOrg,
  onJoinRoom,
  onOpenDesigner,
  onOpenOrgHub,
  onBackToLobby,
  onLogout,
  onRequestAuth,
}) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewModeOverride, setViewModeOverride] = useState('auto'); // 'auto' | 'organization' | 'personal'
  const [instantRoomName, setInstantRoomName] = useState('');
  const [instantTheme, setInstantTheme] = useState('office');
  const [quickCode, setQuickCode] = useState('');
  const [audioTesting, setAudioTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micActive, setMicActive] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const micStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);

  // Compute initials for squircle avatar
  const initials = useMemo(() => {
    if (!user?.username) return 'PS';
    const parts = user.username.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return user.username.slice(0, 2).toUpperCase();
  }, [user?.username]);

  // Determine email domain
  const emailDomain = useMemo(() => {
    if (!user?.email || !user.email.includes('@')) return '';
    return user.email.split('@')[1]?.toLowerCase().trim();
  }, [user?.email]);

  const hasCompanyEmail = useMemo(() => isCompanyEmail(user?.email), [user?.email]);

  // Fetch server dashboard summary
  useEffect(() => {
    const token = localStorage.getItem('proxispeak_token');
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`${SERVER_URL}/api/user/dashboard-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setSummary(data);
        }
      })
      .catch((err) => {
        console.warn('[Dashboard] Could not fetch summary:', err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Compute effective user type
  const effectiveType = useMemo(() => {
    if (viewModeOverride === 'organization') return 'organization';
    if (viewModeOverride === 'personal') return 'personal';

    if (summary?.accountType) return summary.accountType;
    if (activeOrg || hasCompanyEmail) return 'organization';
    return 'personal';
  }, [viewModeOverride, summary?.accountType, activeOrg, hasCompanyEmail]);

  // Clean up mic test when unmounting
  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const handleTestAudioChime = () => {
    setAudioTesting(true);
    playUiChime('join');
    setTimeout(() => {
      playUiChime('mention');
      setAudioTesting(false);
    }, 450);
  };

  const handleToggleMicTest = async () => {
    if (micActive) {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      setMicActive(false);
      setMicLevel(0);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicActive(true);

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        if (!micStreamRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        setMicLevel(normalized);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
    } catch (err) {
      alert('Microphone access denied or unavailable: ' + err.message);
      setMicActive(false);
    }
  };

  const handleLaunchInstantRoom = (e) => {
    e.preventDefault();
    const name = instantRoomName.trim() || `${user?.username || 'Guest'}'s Workspace`;
    const roomId = name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Math.floor(100 + Math.random() * 900);
    spatialAudio.resumeAll();
    onJoinRoom({
      roomId,
      name,
      theme: instantTheme,
    });
  };

  const handleQuickJoin = (e) => {
    e.preventDefault();
    if (!quickCode.trim()) return;
    let code = quickCode.trim();
    if (code.includes('?room=')) {
      code = code.split('?room=')[1].split('&')[0];
    }
    spatialAudio.resumeAll();
    onJoinRoom({
      roomId: code,
      name: code.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      theme: 'office',
    });
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const org = summary?.primaryOrg || activeOrg;
  const isOwner = org && org.owner?.toLowerCase() === user?.username?.toLowerCase();
  const isAdmin = isOwner || summary?.userRole === 'admin' || summary?.userRole === 'owner';

  return (
    <div className="min-h-screen bg-[#FAF9F5] text-[#203334] font-sans antialiased selection:bg-[#3b82f6] selection:text-white">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 bg-[#203334] text-[#f4edda] border-b border-[#203334]/20 shadow-md">
        <div className="max-w-[1440px] mx-auto h-16 px-4 sm:px-8 flex items-center justify-between">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-6">
            <div
              onClick={onBackToLobby}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <div className="w-8 h-8 rounded-full bg-[#399c92]/20 flex items-center justify-center text-[#74c4b9]">
                <span className="material-symbols-outlined text-[19px]">graphic_eq</span>
              </div>
              <span className="text-lg font-bold tracking-tight text-white">ProxiSpeak</span>
            </div>

            {/* View Switcher Pills */}
            <nav className="hidden sm:flex items-center gap-1.5 bg-[#142324] p-1 rounded-full border border-white/10 text-xs">
              <button
                onClick={onBackToLobby}
                className="px-3.5 py-1.5 rounded-full text-white/70 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">meeting_room</span>
                <span>Workspaces</span>
              </button>
              <button
                className="px-3.5 py-1.5 rounded-full bg-[#203334] text-white font-semibold shadow-xs flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">dashboard</span>
                <span>My Dashboard</span>
              </button>
              <button
                onClick={onOpenOrgHub}
                className="px-3.5 py-1.5 rounded-full text-white/70 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">corporate_fare</span>
                <span>Organizations</span>
              </button>
              <button
                onClick={() => onOpenDesigner?.(org)}
                className="px-3.5 py-1.5 rounded-full text-white/70 hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">design_services</span>
                <span>Designer</span>
              </button>
            </nav>
          </div>

          {/* User Controls & View Mode Simulator */}
          <div className="flex items-center gap-3">
            {/* View Type Toggle (for testing and evaluating different user states) */}
            <div className="hidden md:flex items-center gap-1 bg-[#142324] px-2.5 py-1 rounded-lg border border-white/10 text-[11px]">
              <span className="text-white/50 text-[10px] uppercase font-mono tracking-wider mr-1">Preview:</span>
              <button
                onClick={() => setViewModeOverride('auto')}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  viewModeOverride === 'auto' ? 'bg-[#399c92] text-white font-bold' : 'text-white/60 hover:text-white'
                }`}
                title="Automatically detect based on user email and organization membership"
              >
                Auto
              </button>
              <button
                onClick={() => setViewModeOverride('personal')}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  viewModeOverride === 'personal' ? 'bg-[#399c92] text-white font-bold' : 'text-white/60 hover:text-white'
                }`}
                title="Force Personal User Dashboard view"
              >
                Personal
              </button>
              <button
                onClick={() => setViewModeOverride('organization')}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                  viewModeOverride === 'organization' ? 'bg-[#399c92] text-white font-bold' : 'text-white/60 hover:text-white'
                }`}
                title="Force Organization User Dashboard view"
              >
                Enterprise
              </button>
            </div>

            {/* User Profile Badge */}
            <div className="flex items-center gap-2 pl-2 border-l border-white/10">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white shadow-xs"
                style={{ backgroundColor: user?.avatarColor || '#3b82f6' }}
              >
                {initials}
              </div>
              <div className="hidden lg:block text-left leading-tight">
                <div className="text-xs font-bold text-white truncate max-w-[120px]">{user?.username || 'Guest'}</div>
                <div className="text-[10px] text-white/60 truncate max-w-[120px]">{user?.email || 'Not signed in'}</div>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 text-white/60 hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/10 ml-1"
                title="Log out"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Dashboard Container */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Banner Alert Toast */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 bg-[#203334] text-white px-5 py-3 rounded-xl shadow-xl border border-white/20 text-xs font-semibold flex items-center gap-2 animate-fade-in">
            <span className="material-symbols-outlined text-green-400 text-sm">check_circle</span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────────────────── */}
        {/* VIEW 1: ENTERPRISE / ORGANIZATION DASHBOARD                               */}
        {/* ───────────────────────────────────────────────────────────────────────── */}
        {effectiveType === 'organization' ? (
          <div className="space-y-8">
            {/* Enterprise Hero Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#203334] via-[#243e3f] to-[#1c3031] text-white p-6 sm:p-8 shadow-xl border border-[#203334]/30">
              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="px-3 py-1 rounded-full text-[11px] font-mono uppercase font-bold tracking-wider bg-[#399c92] text-white">
                      Enterprise Workspace
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-mono uppercase font-bold tracking-wider bg-white/10 text-white/90 border border-white/15">
                      {isAdmin ? 'Administrator' : 'Team Member'}
                    </span>
                    {emailDomain && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-mono tracking-wider bg-white/5 text-white/80 border border-white/10">
                        @{emailDomain}
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                    {org ? org.name : `${emailDomain ? emailDomain.split('.')[0].toUpperCase() : 'Company'} Headquarters`}
                  </h1>
                  <p className="text-xs sm:text-sm text-white/80 max-w-2xl leading-relaxed">
                    Dedicated corporate spatial campus with soundproof meeting suites, team calendar sync, and interactive 2D floor plans.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      spatialAudio.resumeAll();
                      onJoinRoom({
                        roomId: org ? `${org.slug}-hq` : 'main-office',
                        name: org ? `${org.name} Headquarters` : 'Corporate Headquarters',
                        theme: 'office',
                      });
                    }}
                    className="px-5 py-3 rounded-xl bg-white text-[#203334] hover:bg-[#f4edda] text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px] text-[#277970]">rocket_launch</span>
                    <span>Enter Headquarters</span>
                  </button>
                  <button
                    onClick={onOpenOrgHub}
                    className="px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-all border border-white/20 flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[17px]">settings</span>
                    <span>Manage Hub</span>
                  </button>
                </div>
              </div>

              {/* Decorative Background Grid Pattern */}
              <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
            </div>

            {/* Metric Counters Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-[#E5E4DE] shadow-xs">
                <div className="flex items-center justify-between text-[#55675e] text-xs mb-1">
                  <span>Colleagues & Members</span>
                  <span className="material-symbols-outlined text-[18px]">group</span>
                </div>
                <div className="text-2xl font-bold text-[#203334] font-mono">
                  {summary?.stats?.totalColleagues || org?.members?.length || 1}
                </div>
                <div className="text-[11px] text-[#277970] mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#277970]"></span>
                  <span>Active team roster</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#E5E4DE] shadow-xs">
                <div className="flex items-center justify-between text-[#55675e] text-xs mb-1">
                  <span>Upcoming Calls</span>
                  <span className="material-symbols-outlined text-[18px]">calendar_month</span>
                </div>
                <div className="text-2xl font-bold text-[#203334] font-mono">
                  {summary?.meetings?.upcoming?.length || 0}
                </div>
                <div className="text-[11px] text-[#55675e] mt-1 flex items-center gap-1">
                  <span>Scheduled on calendar</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#E5E4DE] shadow-xs">
                <div className="flex items-center justify-between text-[#55675e] text-xs mb-1">
                  <span>Custom Office Layouts</span>
                  <span className="material-symbols-outlined text-[18px]">floor</span>
                </div>
                <div className="text-2xl font-bold text-[#203334] font-mono">
                  {summary?.layouts?.length || 1}
                </div>
                <div className="text-[11px] text-[#277970] mt-1 flex items-center gap-1">
                  <span>Architectural presets</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-[#E5E4DE] shadow-xs">
                <div className="flex items-center justify-between text-[#55675e] text-xs mb-1">
                  <span>Acoustic Privacy Level</span>
                  <span className="material-symbols-outlined text-[18px]">shield</span>
                </div>
                <div className="text-2xl font-bold text-[#203334] font-mono">-18 dB</div>
                <div className="text-[11px] text-[#55675e] mt-1 flex items-center gap-1">
                  <span>Soundproof door isolation</span>
                </div>
              </div>
            </div>

            {/* Split Layout: Calendar / Meetings vs Team Directory */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Organization Headquarters & Scheduled Meetings (2 cols) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Headquarters Office Suites */}
                <div className="bg-white p-6 rounded-2xl border border-[#E5E4DE] shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-[#203334]">Company Spatial Suites</h2>
                      <p className="text-xs text-[#55675e]">Direct access to high-fidelity audio zones and team suites</p>
                    </div>
                    <button
                      onClick={() => onOpenDesigner?.(org)}
                      className="px-3 py-1.5 rounded-lg border border-[#9bab99] hover:bg-[#f4edda] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      <span>Edit Floor Plan</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-[#E5E4DE] bg-[#FAF9F5] hover:border-[#277970] transition-colors flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#e2efdf] text-[#277970]">
                            Main Campus
                          </span>
                          <span className="text-xs text-[#55675e] flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Live</span>
                          </span>
                        </div>
                        <h3 className="font-bold text-sm text-[#203334]">Executive Boardroom Suite</h3>
                        <p className="text-xs text-[#55675e] mt-1">
                          Private meeting room with Knock-to-Enter protocol, 850px hearing radius, and wall attenuation.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          spatialAudio.resumeAll();
                          onJoinRoom({
                            roomId: org ? `${org.slug}-hq` : 'main-office',
                            name: `${org?.name || 'Company'} Boardroom`,
                            theme: 'office',
                          });
                        }}
                        className="mt-4 w-full py-2 bg-[#203334] text-white hover:bg-[#2c4748] rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[15px]">login</span>
                        <span>Join Boardroom</span>
                      </button>
                    </div>

                    <div className="p-4 rounded-xl border border-[#E5E4DE] bg-[#FAF9F5] hover:border-[#7c3aed] transition-colors flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-50 text-purple-700">
                            Townhall Stage
                          </span>
                          <span className="text-xs text-[#55675e]">Capacity 100</span>
                        </div>
                        <h3 className="font-bold text-sm text-[#203334]">All-Hands Keynote Auditorium</h3>
                        <p className="text-xs text-[#55675e] mt-1">
                          Stage PA broadcast mode allowing speakers to be heard clearly across the entire auditorium hall.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          spatialAudio.resumeAll();
                          onJoinRoom({
                            roomId: org ? `${org.slug}-allhands` : 'conference-hall',
                            name: `${org?.name || 'Company'} All-Hands`,
                            theme: 'conference',
                          });
                        }}
                        className="mt-4 w-full py-2 bg-[#203334] text-white hover:bg-[#2c4748] rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-[15px]">podium</span>
                        <span>Join Auditorium</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scheduled Team Syncs */}
                <div className="bg-white p-6 rounded-2xl border border-[#E5E4DE] shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-[#203334]">Scheduled Team Meetings</h2>
                      <p className="text-xs text-[#55675e]">Upcoming calls and collaborative voice syncs</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={onOpenOrgHub}
                        className="px-3 py-1.5 rounded-lg bg-[#277970] text-white hover:bg-[#1f635c] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        <span>Schedule Meeting</span>
                      </button>
                    )}
                  </div>

                  {summary?.meetings?.upcoming && summary.meetings.upcoming.length > 0 ? (
                    <div className="divide-y divide-[#E5E4DE]">
                      {summary.meetings.upcoming.map((m) => (
                        <div key={m.meetingId || m._id} className="py-3.5 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#e2efdf] text-[#277970] flex items-center justify-center">
                              <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                            </div>
                            <div>
                              <div className="text-xs font-bold text-[#203334]">{m.title}</div>
                              <div className="text-[11px] text-[#55675e]">
                                Host: {m.host} · {m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : 'Soon'}
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              spatialAudio.resumeAll();
                              onJoinRoom({
                                roomId: m.meetingId,
                                name: m.title,
                                theme: m.template || 'office',
                              });
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#203334] text-white text-xs font-semibold hover:bg-[#2c4748] transition-colors cursor-pointer"
                          >
                            Join
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 bg-[#FAF9F5] rounded-xl border border-dashed border-[#9bab99]/40">
                      <span className="material-symbols-outlined text-3xl text-[#55675e] mb-1">event_available</span>
                      <p className="text-xs font-semibold text-[#203334]">No upcoming meetings scheduled</p>
                      <p className="text-[11px] text-[#55675e] mt-0.5">
                        {isAdmin
                          ? 'Click Schedule Meeting to add your first calendar sync.'
                          : 'Your team administrators have not posted any upcoming meetings.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Colleague Directory & Team Settings */}
              <div className="space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-[#E5E4DE] shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-[#203334]">Colleagues Directory</h2>
                      <p className="text-xs text-[#55675e]">Official organization roster</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={onOpenOrgHub}
                        className="text-xs text-[#277970] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">person_add</span>
                        <span>Manage</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {org?.members && org.members.length > 0 ? (
                      org.members.map((m, idx) => (
                        <div
                          key={m.email || idx}
                          className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#FAF9F5] transition-colors border border-transparent hover:border-[#E5E4DE]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white shrink-0"
                              style={{ backgroundColor: m.avatarColor || '#2563eb' }}
                            >
                              {(m.displayName || m.username || 'U').slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#203334] truncate">
                                {m.displayName || m.username}
                              </div>
                              <div className="text-[10px] text-[#55675e] font-mono truncate">{m.email}</div>
                            </div>
                          </div>
                          <span
                            className={`text-[9px] font-mono uppercase font-bold px-2 py-0.5 rounded-full shrink-0 ${
                              m.role === 'owner' || m.role === 'admin'
                                ? 'bg-[#203334] text-[#f4edda]'
                                : 'bg-[#e2efdf] text-[#277970]'
                            }`}
                          >
                            {m.role || 'member'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 bg-[#FAF9F5] rounded-xl text-xs text-[#55675e] text-center">
                        <div>You are logged in as {user?.username}</div>
                        <div className="font-mono text-[10px] text-[#277970] mt-1">{user?.email}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Organization Soundstage Telemetry */}
                <div className="bg-[#203334] text-white p-6 rounded-2xl border border-white/10 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#74c4b9]">
                    <span className="material-symbols-outlined text-[17px]">spatial_audio</span>
                    <span>Corporate Audio Engine</span>
                  </div>
                  <div className="space-y-2 text-[11px] text-white/80">
                    <div className="flex justify-between border-b border-white/10 pb-1.5">
                      <span>Transport Protocol</span>
                      <span className="font-mono text-white">Opus 48 kHz / WebRTC P2P</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1.5">
                      <span>STUN / TURN Relays</span>
                      <span className="font-mono text-emerald-400">High Availability Active</span>
                    </div>
                    <div className="flex justify-between border-b border-white/10 pb-1.5">
                      <span>Closed Door Isolation</span>
                      <span className="font-mono text-white">Full Soundproof (-18 dB)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Audio Spatial Falloff</span>
                      <span className="font-mono text-white">Power 0.75 Natural Curve</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ───────────────────────────────────────────────────────────────────────── */
          /* VIEW 2: NORMAL / PERSONAL USER DASHBOARD                                  */
          /* ───────────────────────────────────────────────────────────────────────── */
          <div className="space-y-8">
            {/* Personal User Hero Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-white border border-[#E5E4DE] p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-[11px] font-mono uppercase font-bold tracking-wider bg-[#e2efdf] text-[#277970]">
                      Personal Tier
                    </span>
                    <span className="px-3 py-1 rounded-full text-[11px] font-mono tracking-wider bg-gray-100 text-gray-700">
                      Standard Audio Presence
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#203334]">
                    Welcome to ProxiSpeak, {user?.username || 'Explorer'}
                  </h1>
                  <p className="text-xs sm:text-sm text-[#55675e] max-w-2xl leading-relaxed">
                    Step into spatial audio workspaces where human presence is natural. Walk closer to talk, step away for silence, and knock on doors for private discussions.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => {
                      spatialAudio.resumeAll();
                      onJoinRoom({ roomId: 'main-office', name: 'Corporate Office', theme: 'office' });
                    }}
                    className="px-5 py-3 rounded-xl bg-[#203334] text-white hover:bg-[#2c4748] text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">explore</span>
                    <span>Enter Main Office</span>
                  </button>
                  <button
                    onClick={onOpenOrgHub}
                    className="px-4 py-3 rounded-xl bg-[#277970] text-white hover:bg-[#1f635c] text-xs font-semibold transition-all shadow-xs flex items-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[17px]">corporate_fare</span>
                    <span>Create Team HQ</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Live Audio Diagnostic & Testing Console */}
            <div className="bg-white p-6 rounded-2xl border border-[#E5E4DE] shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-bold text-[#203334] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#277970] text-[20px]">tune</span>
                    <span>Audio & Hardware Setup</span>
                  </h2>
                  <p className="text-xs text-[#55675e]">Verify your microphone and headphones before stepping into a room</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestAudioChime}
                    disabled={audioTesting}
                    className="px-3.5 py-2 rounded-xl bg-[#FAF9F5] border border-[#9bab99] hover:bg-[#f4edda] text-xs font-semibold text-[#203334] flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#277970]">volume_up</span>
                    <span>{audioTesting ? 'Playing Chime...' : 'Test Speaker Audio'}</span>
                  </button>
                  <button
                    onClick={handleToggleMicTest}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      micActive
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : 'bg-[#203334] text-white hover:bg-[#2c4748]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {micActive ? 'mic_off' : 'mic'}
                    </span>
                    <span>{micActive ? 'Stop Mic Test' : 'Test Microphone'}</span>
                  </button>
                </div>
              </div>

              {/* Live Input Level Visualizer Bar */}
              <div className="bg-[#FAF9F5] p-4 rounded-xl border border-[#E5E4DE] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#55675e] font-medium">Live Microphone Input Level:</span>
                  <span className="font-mono text-xs font-bold text-[#203334]">{micLevel}%</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-[#399c92] to-[#277970] transition-all duration-75"
                    style={{ width: `${micLevel}%` }}
                  ></div>
                </div>
                <div className="text-[11px] text-[#55675e] flex items-center justify-between">
                  <span>Speak into your microphone to verify vocal pickup</span>
                  <span className="font-mono">Opus 48 kHz AGC & Noise Suppression Enabled</span>
                </div>
              </div>
            </div>

            {/* Split Content: Quick Actions & Instant Room vs Official Workspaces */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Quick Actions (1 col) */}
              <div className="space-y-6">
                {/* Instant Room Creator */}
                <div className="bg-white p-6 rounded-2xl border border-[#E5E4DE] shadow-xs space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-[#203334]">Start Instant Personal Space</h3>
                    <p className="text-xs text-[#55675e]">Generate a temporary spatial audio room for quick voice calls</p>
                  </div>

                  <form onSubmit={handleLaunchInstantRoom} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-[#55675e] mb-1">Room Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Quick Chat with Alex"
                        value={instantRoomName}
                        onChange={(e) => setInstantRoomName(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#FAF9F5] border border-[#9bab99] text-[#203334] focus:outline-none focus:border-[#203334]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#55675e] mb-1">Acoustic Theme</label>
                      <select
                        value={instantTheme}
                        onChange={(e) => setInstantTheme(e.target.value)}
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#FAF9F5] border border-[#9bab99] text-[#203334] focus:outline-none focus:border-[#203334]"
                      >
                        <option value="office">Corporate Office (320px / Boardroom)</option>
                        <option value="conference">Townhall & Auditorium (Stage PA)</option>
                        <option value="rooftop">Sky Rooftop Lounge (Ambient)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2.5 bg-[#203334] text-white hover:bg-[#2c4748] rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">add_circle</span>
                      <span>Launch Personal Space</span>
                    </button>
                  </form>
                </div>

                {/* Quick Join by Code / URL */}
                <div className="bg-white p-6 rounded-2xl border border-[#E5E4DE] shadow-xs space-y-3">
                  <h3 className="text-sm font-bold text-[#203334]">Join via Code or Link</h3>
                  <form onSubmit={handleQuickJoin} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste room code or link..."
                      value={quickCode}
                      onChange={(e) => setQuickCode(e.target.value)}
                      className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-[#FAF9F5] border border-[#9bab99] text-[#203334] focus:outline-none focus:border-[#203334]"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-[#203334] text-white hover:bg-[#2c4748] rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Join
                    </button>
                  </form>
                </div>
              </div>

              {/* Official Spatial Workspaces Directory (2 cols) */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-[#E5E4DE] shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-[#203334]">Featured Spatial Workspaces</h2>
                      <p className="text-xs text-[#55675e]">Step into always-open collaborative public offices</p>
                    </div>
                    <button
                      onClick={onBackToLobby}
                      className="text-xs text-[#277970] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>View All in Lobby</span>
                      <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {OFFICIAL_SPACES.map((space) => (
                      <div
                        key={space.roomId}
                        className="p-5 rounded-xl border border-[#E5E4DE] bg-[#FAF9F5] hover:border-[#203334] transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded"
                              style={{ backgroundColor: `${space.accentColor}15`, color: space.accentColor }}
                            >
                              {space.badge}
                            </span>
                            <span className="text-[11px] text-[#55675e] flex items-center gap-1 font-mono">
                              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                              <span>{space.occupants} online</span>
                            </span>
                          </div>
                          <h3 className="font-bold text-sm text-[#203334] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]" style={{ color: space.accentColor }}>
                              {space.icon}
                            </span>
                            <span>{space.name}</span>
                          </h3>
                          <p className="text-xs text-[#55675e] mt-1.5 leading-relaxed">{space.description}</p>
                        </div>

                        <button
                          onClick={() => {
                            spatialAudio.resumeAll();
                            onJoinRoom({
                              roomId: space.roomId,
                              name: space.name,
                              theme: space.theme,
                            });
                          }}
                          className="mt-4 w-full py-2 bg-[#203334] text-white hover:bg-[#2c4748] rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[15px]">meeting_room</span>
                          <span>Enter Space</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Organization Invitation & Upgrade Card */}
                <div className="rounded-2xl p-6 bg-gradient-to-r from-[#e2efdf] to-[#d6ebd3] border border-[#277970]/30 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-[#277970] uppercase font-mono tracking-wider">
                      <span className="material-symbols-outlined text-[17px]">corporate_fare</span>
                      <span>Need a Dedicated Team Workspace?</span>
                    </div>
                    <h3 className="text-lg font-bold text-[#203334]">Create an Organization Headquarters</h3>
                    <p className="text-xs text-[#55675e] max-w-xl">
                      Host scheduled team meetings, generate official company domain logins (@yourcompany.com), design custom floor plans, and enforce soundproof boardroom privacy.
                    </p>
                  </div>
                  <button
                    onClick={onOpenOrgHub}
                    className="px-5 py-3 rounded-xl bg-[#203334] text-white hover:bg-[#2c4748] text-xs font-bold transition-all shadow-md shrink-0 cursor-pointer flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[17px]">add_business</span>
                    <span>Set Up Organization</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
