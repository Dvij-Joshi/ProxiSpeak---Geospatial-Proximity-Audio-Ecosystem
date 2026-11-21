import WorkspaceDashboard from './WorkspaceDashboard';
import OfficeDiorama from './OfficeDiorama';
import dashboardStyles from './dashboardShell.css?inline';
import Account from '../dashboard/Account';
import Help from '../dashboard/Help';
import Dialog from '../dashboard/Dialog';
import { AvatarPortrait } from './WorkspaceArt';
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
  const views={overview:'Overview',workspaces:'Room directory',drafts:'Layout drafts',account:'Account',help:'Help'};
  const readView=()=>Object.hasOwn(views,location.hash.slice(1))?location.hash.slice(1):'overview';
  const [view,setView]=useState(readView);
  const [joinOpen,setJoinOpen]=useState(false);
  const [createError,setCreateError]=useState('');
  useEffect(()=>{
    const navigate=()=>{setView(readView());window.scrollTo(0,0);};
    window.addEventListener('hashchange',navigate);
    return ()=>window.removeEventListener('hashchange',navigate);
  },[]);
  const inputRef = useRef(null);

  // Keyboard shortcut ⌘K / Ctrl+K to focus join input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!document.querySelector('dialog[open],.org-panel')) setJoinOpen(true);
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
    if (code.includes('://') || code.includes('?room=') || code.includes('/room/')) {
      try {
        const link=new URL(code,window.location.origin);
        code=link.searchParams.get('room') || decodeURIComponent(link.pathname.match(/\/room\/([^/]+)/)?.[1] || '');
      } catch {code='';}
    }
    if (!code || /[?#/]/.test(code)) {
      setJoinError('Enter a room code or an invitation containing a room ID.');
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
      setCreateError(err.message || 'Room creation failed. Try again.');
    } finally {
      setCreating(false);
    }
  };

  const host=()=>{setCreateError('');setShowHostModal(true);};
  const join=()=>{setJoinError('');setJoinOpen(true);};
  return <div className="desk-app"><style>{dashboardStyles}</style>
    <header className="hub-bar"><a className="hub-brand" href="#overview"><img src="/favicon.svg" alt=""/>ProxiSpeak</a>
      <nav aria-label="Dashboard pages">{['overview','workspaces','drafts'].map(key=><a key={key} aria-current={view===key?'page':undefined} href={'#'+key}>{views[key]}</a>)}
        <button onClick={onOpenOrgHub}>Organizations</button></nav>
      <div className="hub-user"><a aria-label="Workspace guide" href="#help">?</a><a href="#account" aria-label={'Account for '+user.username}><AvatarPortrait name={user.username} color={user.avatarColor}/></a></div>
    </header>
    <main className="desk-main">
    {(view==='overview'||view==='drafts')&&<WorkspaceDashboard user={user} view={view} activeOrg={activeOrg} onSelectOrg={onSelectOrg}
      onOpenHub={onDashboardHub} onDesign={onOpenDesigner} onResume={onResumeDraft} onHost={host} onJoinCode={join}/>}
    {view==='workspaces' && <>        <section className="directory" aria-label="Room directory"><div className="wrap">
          <div className="directory-heading"><div><h1>Room directory</h1></div><button className="solid-action" onClick={host}>+ Host a meeting</button></div>
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

</>}
    {view==='account' && <Account user={user} onLogout={onLogout}/>}
    {view==='help' && <Help/>}
    </main>
    {joinOpen && <Dialog title="Join a meeting" onClose={()=>setJoinOpen(false)}><form onSubmit={handleJoinByCode}>
      <label htmlFor="lobby-code">Room code or invite link</label><input autoFocus ref={inputRef} id="lobby-code" value={joinCode} onChange={e=>{setJoinCode(e.target.value);setJoinError('');}} placeholder="Paste your invitation" aria-invalid={!!joinError}/>
      {joinError&&<p role="alert">{joinError}</p>}<footer><button type="button" onClick={()=>setJoinOpen(false)}>Cancel</button><button className="primary">Join room</button></footer>
    </form></Dialog>}
    {showHostModal && <Dialog title="Host a meeting" busy={creating} onClose={()=>setShowHostModal(false)}><form onSubmit={handleCreateRoom}>
      <label htmlFor="new-room-name">Room name</label><input id="new-room-name" autoFocus required value={newRoomName} onChange={e=>setNewRoomName(e.target.value)} placeholder="e.g. Design review"/>
      <fieldset><legend>Environment</legend>{THEME_OPTIONS.map(theme=><label className="theme-radio" key={theme.id}>
        <input type="radio" name="environment" checked={newRoomTheme===theme.id} onChange={()=>setNewRoomTheme(theme.id)}/>
        <span><strong>{theme.name}</strong><small>{theme.desc}</small></span></label>)}</fieldset>
      {createError && <p role="alert">{createError}</p>}<footer><button type="button" disabled={creating} onClick={()=>setShowHostModal(false)}>Cancel</button>
      <button className="primary" disabled={creating || !newRoomName.trim()}>{creating?'Creating…':'Create and enter'}</button></footer>
    </form></Dialog>}
  </div>;
}
