import WorkspaceDashboard from './WorkspaceDashboard';
import OfficeDiorama from './OfficeDiorama';
import './landing.css';
import { WorkspaceArt } from './WorkspaceArt';
import { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../config';
import { spatialAudio } from '../services/spatialAudio';

const OFFICIAL_WORKSPACES = [
  {roomId:'main-office',name:'Corporate Office',theme:'office',description:'Shared desks, private offices and a boardroom.'},
  {roomId:'conference-hall',name:'Conference & Breakout',theme:'conference',description:'A keynote stage with space for smaller discussions.'},
  {roomId:'rooftop-lounge',name:'Rooftop Social Lounge',theme:'lounge',description:'Coffee, lounge seating and an open-air terrace.'},
];

const THEME_OPTIONS = [
  {
    id: 'office',
    name: 'Corporate Office',
    icon: 'domain',
    desc: 'Executive suites, conference room, lounge, and open desks.',
  },
  {
    id: 'conference',
    name: 'Conference & Auditorium',
    icon: 'account_balance',
    desc: 'Keynote stage, presentation hall, and breakout pods.',
  },
  {
    id: 'lounge',
    name: 'Rooftop Social Lounge',
    icon: 'deck',
    desc: 'Casual coffee bar, sofa booths, and open air terrace.',
  },
];

export default function MeetingLobby({
  user,
  onJoinRoom,
  onLogout,
  onRequestAuth,
  onOpenDesigner,
  onResumeDraft, onSelectOrg, onDashboardHub,
  onOpenOrgHub,
  activeOrg,
}) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

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

  const [refresh,setRefresh] = useState(0);
  const [directoryOffline,setDirectoryOffline] = useState(false);
  useEffect(() => {
    let stopped=false, controller, timer;
    async function load() {
      controller=new AbortController();
      const deadline=setTimeout(()=>controller.abort(),10000);
      setLoadingRooms(true);
      let next = 15000;
      try {
        const res = await fetch(SERVER_URL+'/api/rooms',{signal:controller.signal});
        if (!res.ok) throw Error();
        const data = await res.json();
        if (!Array.isArray(data)) throw Error();
        if (!stopped) { setRooms(data); setDirectoryOffline(false); }
      } catch {
        if (!stopped) setDirectoryOffline(true);
        next = 5000;
      } finally {
        clearTimeout(deadline);
        if (!stopped) {
          setLoadingRooms(false);
          timer = setTimeout(load,next);
        }
      }
    }
    load();
    return ()=>{stopped=true;controller.abort();clearTimeout(timer);};
  },[refresh]);
  const directory = new Map(OFFICIAL_WORKSPACES.map(room=>[room.roomId,room]));
  for (const room of rooms) {
    if (!room?.roomId || !room.name) continue;
    const base = directory.get(room.roomId);
    directory.set(room.roomId,{...base,...room,theme:room.theme || base?.theme || 'office',
      description:room.description || base?.description || 'A shared team workspace.'});
  }
  const allWorkspaces = [...directory.values()];

  const filteredWorkspaces = allWorkspaces.filter((w) => {
    const matchesTheme = selectedThemeFilter === 'all' || w.theme === selectedThemeFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      w.name.toLowerCase().includes(q) ||
      w.roomId.toLowerCase().includes(q) ||
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
    if (!user) {
      onRequestAuth?.();
      return;
    }
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
          createdBy: user.username,
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

  const host=()=>user?setShowHostModal(true):onRequestAuth();
  return (
    <div className="landing" id="top">
      <header className="landing-nav wrap">
        <a href="#top" className="wordmark"><img src="/favicon.svg" alt="" width="34" height="34"/>ProxiSpeak</a>
        <nav aria-label="Main navigation"><button onClick={()=>setActiveModal('spatial-audio')}>Spatial audio</button><a href="#workspaces">Workspaces</a><button onClick={onOpenOrgHub}>Organizations</button></nav>
        <button className="nav-account" onClick={user?onLogout:onRequestAuth}>{user?'Sign out':'Sign in'} <span aria-hidden="true">&#8599;</span></button>
      </header>
      <main>
        <div className="wrap dashboard-wrap"><WorkspaceDashboard key={user?.id || user?.username || 'guest'} user={user} activeOrg={activeOrg} onSelectOrg={onSelectOrg}
          onOpenHub={onDashboardHub} onDesign={onOpenDesigner} onResume={onResumeDraft} onHost={host} onJoinCode={()=>inputRef.current?.focus()}/></div>
        <section className="arrival"><div className="wrap arrival-grid"><div><h2>Have an invite?</h2><p>Enter a room code or paste your meeting link.</p></div>
          <form onSubmit={handleJoinByCode}><label className="sr-only" htmlFor="lobby-code">Meeting code or invite link</label>
            <input ref={inputRef} id="lobby-code" value={joinCode} onChange={e=>{setJoinCode(e.target.value);setJoinError('');}} placeholder="Room code or invite link" aria-invalid={!!joinError}/>
            <button>Join room <span aria-hidden="true">&#8594;</span></button>{joinError&&<small role="alert">{joinError}</small>}
          </form></div></section>
        <section className="directory" id="workspaces"><div className="wrap">
          <div className="directory-heading"><div><div className="section-label"><i/> Workspace directory</div><h2>Choose your space.</h2></div><button className="solid-action" onClick={host}>+ Host a meeting</button></div>
          <div className="directory-tools"><div role="group" aria-label="Filter workspaces">{['all','office','conference','lounge'].map(key=><button key={key} aria-pressed={selectedThemeFilter===key} onClick={()=>setSelectedThemeFilter(key)}>{key==='all'?'All spaces':key}</button>)}</div>
            <input type="search" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} aria-label="Search workspaces" placeholder="Search workspaces"/><button aria-label="Refresh directory" onClick={()=>setRefresh(v=>v+1)}>&#8635;</button>
          </div>
          {directoryOffline&&<p role="status">Live room updates are temporarily unavailable.</p>}
          <div className="room-gallery">{filteredWorkspaces.map(ws=><article className="room-card" key={ws.roomId}>
            <div className={'room-art room-'+ws.theme}><OfficeDiorama theme={ws.theme}/></div>
            <div className="room-info"><h3>{ws.name}</h3><p>{ws.description}</p><div><small>{Number.isFinite(ws.activeUsers)&&!directoryOffline?ws.activeUsers+' online':ws.theme+' workspace'}</small><button aria-label={'Enter '+ws.name} onClick={()=>handleEnterWorkspace(ws)}>Enter &#8599;</button></div></div>
          </article>)}</div>
          {!filteredWorkspaces.length&&<p role="status">{loadingRooms?'Loading directory…':'No workspaces match your search.'}</p>}
        </div></section>
        <section className="design-invite wrap"><div><h2>Build your own floor.</h2><p>Place desks, set up meeting rooms and create a layout for the way your team works.</p></div>
          <button className="line-action" onClick={()=>onOpenDesigner(activeOrg)}>Open layout designer &#8599;</button></section>
      </main>
      <footer className="landing-foot"><div className="wrap"><a href="#top" className="wordmark"><img src="/favicon.svg" width="28" height="28" alt=""/>ProxiSpeak</a><nav aria-label="Resources">
        <button onClick={onOpenOrgHub}>Organizations</button><button onClick={()=>setActiveModal('hardware')}>Audio setup</button><button onClick={()=>setActiveModal('docs')}>Documentation</button></nav></div></footer>
      {/* Host New Meeting Modal */}
      {showHostModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
          onClick={() => setShowHostModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-[26px] bg-[#f4edda] p-6 sm:p-7 shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] border border-[#9bab99] relative text-[#203334] flex flex-col gap-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-[#EBEAE5]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#9bab99] shadow-2xs text-[#203334] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">add_circle</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#55675e]">Soundstage Deployment</span>
                  </div>
                  <h3 className="font-bold text-base text-[#203334] tracking-tight">Host Workspace</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHostModal(false)}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Close modal"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              {/* Workspace Name */}
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-[#475950] mb-1.5 font-semibold">
                  Workspace Name
                </label>
                <input
                  type="text"
                  required
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Design Sync, Engineering Standup"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#9bab99] text-xs text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                  autoFocus
                />
              </div>

              {/* Environment Layout */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] font-semibold">
                    Environment Layout
                  </label>
                  <span className="text-[10px] font-mono text-[#55675e]">Acoustic Template</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = newRoomTheme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setNewRoomTheme(theme.id)}
                        className={`group text-left rounded-lg p-2.5 border transition-all flex flex-col cursor-pointer ${
                          isSelected
                            ? 'border-[#203334] bg-white ring-2 ring-[#203334]/10 shadow-sm'
                            : 'border-[#9bab99] bg-white/60 hover:border-[#D0CFC8] hover:bg-white'
                        }`}
                      >
                        <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-neutral-100 mb-2 relative border border-[#9bab99]">
                          <WorkspaceArt theme={theme.id} />
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#203334] text-[#f4edda] flex items-center justify-center shadow">
                              <span className="material-symbols-outlined text-[11px] leading-none">check</span>
                            </div>
                          )}
                        </div>
                        <span className="font-semibold text-xs text-[#203334] truncate w-full">
                          {theme.name}
                        </span>
                        <span className="text-[10px] text-[#55675e] font-mono mt-0.5 line-clamp-1">
                          {theme.id === 'office' && 'Desks & pods'}
                          {theme.id === 'conference' && 'Auditorium'}
                          {theme.id === 'lounge' && 'Open terrace'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="pt-4 border-t border-[#EBEAE5] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowHostModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#475950] hover:text-[#203334] hover:bg-[#f4edda] border border-[#9bab99] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2.5 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold transition-all shadow-sm active:scale-[0.99] cursor-pointer disabled:opacity-40 flex items-center gap-2"
                >
                  {creating ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-[#f4edda]" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Workspace</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Info Modals (Spatial Audio / Hardware / Docs) */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="w-full max-w-lg rounded-[26px] bg-[#f4edda] p-6 sm:p-7 shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] border border-[#9bab99] relative text-[#203334] flex flex-col gap-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-[#EBEAE5]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#9bab99] shadow-2xs text-[#203334] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">
                    {activeModal === 'spatial-audio' && 'graphic_eq'}
                    {activeModal === 'hardware' && 'headphones'}
                    {activeModal === 'docs' && 'menu_book'}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#55675e]">Technical Specification</span>
                  </div>
                  <h3 className="font-bold text-base text-[#203334] tracking-tight">
                    {activeModal === 'spatial-audio' && 'Spatial Audio Architecture'}
                    {activeModal === 'hardware' && 'Audio Hardware & Latency'}
                    {activeModal === 'docs' && 'ProxiSpeak Documentation'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                aria-label="Close modal"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="mt-1">
              {activeModal === 'spatial-audio' && (
                <div className="space-y-3 text-xs text-[#475950] leading-relaxed">
                  <div className="p-3.5 rounded-lg bg-white border border-[#9bab99] shadow-2xs">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#55675e] mb-1 font-semibold">WebAudio HRTF Engine</div>
                    <p className="text-[#203334]">
                      ProxiSpeak integrates a browser-native WebAudio spatial panner node calibrated to Head-Related Transfer Function (HRTF) impulse responses.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-white border border-[#9bab99] shadow-2xs">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#55675e] mb-1 font-semibold">Acoustic Isolation</div>
                    <p className="text-[#203334]">
                      When meeting participants step into private rooms or close doors, soundproof filters attenuate audio by -40dB, providing true privacy for confidential syncs.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-white border border-[#9bab99] shadow-2xs">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#55675e] mb-1 font-semibold">Inverse-Square Attenuation</div>
                    <p className="text-[#203334]">
                      As you navigate your avatar across the office floor, voice levels scale according to inverse-square distance equations for natural, organic conversations.
                    </p>
                  </div>
                </div>
              )}

              {activeModal === 'hardware' && (
                <div className="space-y-3 text-xs text-[#475950] leading-relaxed">
                  <p className="text-[#203334]">
                    ProxiSpeak delivers optimal spatial immersion with stereo headphones or binaural headsets.
                  </p>
                  <div className="p-4 rounded-lg bg-white border border-[#9bab99] shadow-2xs space-y-2 text-[#203334]">
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#203334] mt-0.5">verified</span>
                      <span><strong>Recommended:</strong> Apple AirPods Max/Pro, Sony WH-1000XM5, Bose QuietComfort.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#203334] mt-0.5">check_circle</span>
                      <span>Supports standard 44.1kHz or 48kHz audio interfaces without external drivers.</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-[16px] text-[#203334] mt-0.5">check_circle</span>
                      <span>Built-in hardware echo cancellation, noise suppression, and auto gain control.</span>
                    </div>
                  </div>
                </div>
              )}

              {activeModal === 'docs' && (
                <div className="space-y-3 text-xs text-[#475950] leading-relaxed">
                  <p className="text-[#203334]">
                    ProxiSpeak is powered by a low-latency WebRTC mesh paired with a persistent WebSocket presence and state synchronization protocol.
                  </p>
                  <div className="p-4 rounded-lg bg-white border border-[#9bab99] shadow-2xs space-y-2.5">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[#55675e] mb-1 font-semibold">Controls</div>
                      <p className="text-[#203334]">
                        Use <kbd className="px-2 py-0.5 rounded-lg bg-[#f4edda] border border-[#9bab99] font-mono text-[11px] text-[#203334]">W, A, S, D</kbd> or <kbd className="px-2 py-0.5 rounded-lg bg-[#f4edda] border border-[#9bab99] font-mono text-[11px] text-[#203334]">Arrow Keys</kbd> to move your avatar. Press <kbd className="px-2 py-0.5 rounded-lg bg-[#f4edda] border border-[#9bab99] font-mono text-[11px] text-[#203334]">M</kbd> to toggle mute, or <kbd className="px-2 py-0.5 rounded-lg bg-[#f4edda] border border-[#9bab99] font-mono text-[11px] text-[#203334]">Spacebar</kbd> for push-to-talk.
                      </p>
                    </div>
                    <div className="pt-2 border-t border-[#EBEAE5]">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-[#55675e] mb-1 font-semibold">Room Invites</div>
                      <p className="text-[#203334]">
                        Share meeting links with <code className="px-2 py-0.5 rounded-lg bg-[#f4edda] border border-[#9bab99] text-[11px] font-mono text-[#203334]">?room=your-room-id</code> for instant access.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#EBEAE5] flex justify-end">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-5 py-2.5 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.99]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
