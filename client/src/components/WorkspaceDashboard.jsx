import { useEffect, useState } from 'react';
import { SERVER_URL } from '../config';
import { listDrafts } from '../services/layoutDrafts';
import { organizationRole } from '../services/organizationRole';
import './workspaceDashboard.css';

export default function WorkspaceDashboard({user,activeOrg,onSelectOrg,onOpenHub,onDesign,onResume,onHost,onJoinCode}) {
  const [organizations,setOrganizations] = useState([]);
  const [orgError,setOrgError] = useState(false);
  const [schedule,setSchedule] = useState(null);
  const [drafts,setDrafts] = useState(() => listDrafts(user));

  useEffect(() => {
    function refresh() { setDrafts(listDrafts(user)); }
    window.addEventListener('storage',refresh);
    return () => window.removeEventListener('storage',refresh);
  },[user]);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    fetch(SERVER_URL+'/api/organizations',{signal:controller.signal,
      headers:{Authorization:'Bearer '+localStorage.getItem('proxispeak_token')}})
      .then(async r => { if (!r.ok) throw Error(); return r.json(); })
      .then(rows=>setOrganizations(rows.filter(org=>organizationRole(user,org))))
      .catch(e=>{ if (e.name!=='AbortError') setOrgError(true); });
    return () => controller.abort();
  },[user]);
  const org = activeOrg===null ? null : organizations.find(o=>o.orgId===activeOrg?.orgId) || organizations[0];
  const role = organizationRole(user,org);
  useEffect(() => {
    if (!org) return;
    const controller = new AbortController();
    fetch(SERVER_URL+'/api/organizations/'+encodeURIComponent(org.orgId)+'/meetings',{signal:controller.signal})
      .then(async r=>{if (!r.ok) throw Error(); return r.json();})
      .then(data=>setSchedule({...data,orgId:org.orgId}))
      .catch(e=>{if(e.name!=='AbortError') setSchedule({orgId:org.orgId,error:true});});
    return ()=>controller.abort();
  },[org]);
  const visible = drafts.filter(d=>d.orgId===(org?.orgId || null));
  if (!user && !visible.length) return null;
  const openTab = tab => onOpenHub(org,tab);
  const admin = role==='admin';
  const meetings = schedule?.orgId===org?.orgId ? schedule : null;
  return <section className="workspace-dashboard" aria-label="Workspace dashboard">
    <header><div><small>{admin?'Organization administrator':role?'Organization member':'Personal workspace'}</small>
      <h1>{org?.name || 'My workspace'}</h1></div>
      {organizations.length>0 && <select aria-label="Dashboard workspace" value={org?.orgId || ''} onChange={e=>{
        onSelectOrg(organizations.find(o=>o.orgId===e.target.value)||null);
      }}><option value="">Personal workspace</option>{organizations.map(o=><option key={o.orgId} value={o.orgId}>{o.name}</option>)}</select>}
    </header>
    {orgError && <p role="status">Organization details are unavailable.</p>}
    <div className="dashboard-columns"><div className="dashboard-panel"><h2>{org?'Team workspace':'Meetings'}</h2>
      <div className="dashboard-links">
        {org ? <>
          <button onClick={()=>openTab('meetings')}>{admin?'Schedule and manage meetings':'Open meeting schedule'}</button>
          <button onClick={()=>openTab('members')}>{admin?'Manage members and roles':'Team directory'}</button>
          <button onClick={()=>openTab('templates')}>{admin?'Manage office layouts':'Browse team offices'}</button>
        </> : <>
          <button onClick={onHost}>Host a meeting</button>
          <button onClick={onJoinCode}>Join by code</button>
          <a href="#workspaces">Browse public workspaces</a>
          <button onClick={()=>openTab('overview')}>Organizations</button>
        </>}
      </div>
      {org && <div className="dashboard-agenda"><h3>Team agenda</h3>{!meetings?'Loading schedule…':meetings.error?'Schedule unavailable':
        [...(meetings.active||[]),...(meetings.upcoming||[])].length===0?'No active or upcoming meetings.':
        [...(meetings.active||[]),...(meetings.upcoming||[])].slice(0,3).map(m=><button key={m.meetingId||m.roomId} onClick={()=>openTab('meetings')}>
          <strong>{m.title}</strong><span>{m.scheduledAt?new Date(m.scheduledAt).toLocaleString():'In progress'}</span></button>)}</div>}
    </div><div className="dashboard-panel"><div className="draft-heading"><h2>Layout drafts</h2>
      <button onClick={()=>onDesign(org)}>New layout</button></div>
      {visible.length===0 ? <p>Layouts you edit on this device appear here.</p> :
        <ul>{visible.map(d=><li key={d.id}><div><strong>{d.layout.name || 'Untitled layout'}</strong>
          <small>Saved {new Date(d.updatedAt).toLocaleString()}</small></div>
          <button aria-label={'Resume '+(d.layout.name||'untitled layout')} onClick={()=>onResume(d,org)}>Resume</button></li>)}</ul>}
    </div></div>
  </section>;
}
