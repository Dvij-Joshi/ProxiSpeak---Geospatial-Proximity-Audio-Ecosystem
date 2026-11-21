import { useEffect, useState } from 'react';
import { SERVER_URL } from '../config';
import { listDrafts } from '../services/layoutDrafts';
import { organizationRole } from '../services/organizationRole';
import OfficeDiorama from './OfficeDiorama';

export default function WorkspaceDashboard({user,view,activeOrg,onSelectOrg,onOpenHub,onDesign,onResume,onHost,onJoinCode}) {
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
  const agenda=[...(meetings?.active || []),...(meetings?.upcoming || [])];
  const selector=organizations.length>0 && <label className="scope-picker"><span>Workspace</span><select aria-label="Dashboard workspace" value={org?.orgId||''}
    onChange={e=>onSelectOrg(organizations.find(o=>o.orgId===e.target.value)||null)}>
    <option value="">Personal workspace</option>{organizations.map(o=><option key={o.orgId} value={o.orgId}>{o.name}</option>)}
  </select></label>;
  if (view==='drafts') return <section className="draft-library"><div className="hub-heading"><div>{selector}<h1>Layout drafts</h1></div>
      <button className="primary" onClick={()=>onDesign(org)}>+ New layout</button></div>
      {orgError && <p role="alert">Organization details are unavailable.</p>}
      {visible.length===0?<div className="hub-empty"><span className="material-symbols-outlined" aria-hidden="true">architecture</span><h2>No drafts in this workspace</h2><p>Start a layout to save your progress on this device.</p></div>:
      <ul className="draft-list">{visible.map(d=><li key={d.id}><div><h2>{d.layout.name||'Untitled layout'}</h2><small>Saved {new Date(d.updatedAt).toLocaleString()}</small></div>
      <button onClick={()=>onResume(d,org)}>Resume layout</button></li>)}</ul>}</section>;
  return <section className="workspace-dashboard" aria-label="Workspace dashboard">
    <div className="hub-heading"><div><small>{admin?'Organization administrator':role?'Organization member':'Personal workspace'}</small>
      <h1>{org?.name || 'My workspace'}</h1></div>{selector}</div>
    {orgError && <p role="alert">Organization details are unavailable.</p>}
    <div className="meeting-board"><div><h2>Meeting desk</h2><p>Start a room for your team or enter one with an invitation.</p>
      <div className="hub-actions"><button className="primary" onClick={onHost}>+ Host a meeting</button><button onClick={onJoinCode}>Join by code</button></div></div>
      <div className="board-art"><OfficeDiorama/></div></div>
    <div className="hub-columns"><article className="hub-card"><header><h2>{org?'Team agenda':'Meeting rooms'}</h2>
      {org&&<button onClick={()=>openTab('meetings')}>{admin?'Manage schedule':'View schedule'}</button>}</header>
      {org ? !meetings?<p role="status">Loading schedule…</p>:meetings.error?<p role="status">The schedule is unavailable.</p>:
      agenda.length===0?<p>No active or upcoming meetings.</p>:<ul className="agenda-list">{agenda.slice(0,4).map(m=><li key={m.meetingId||m.roomId}><button onClick={()=>openTab('meetings')}>
        <span className="material-symbols-outlined" aria-hidden="true">calendar_month</span><strong>{m.title}</strong><small>{m.scheduledAt?new Date(m.scheduledAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'In progress'}</small></button></li>)}</ul>:
      <a className="hub-row" href="#workspaces">Browse the room directory <span>→</span></a>}
    </article><article className="hub-card"><header><h2>Workspace tools</h2></header>
      {org && <button className="hub-row" onClick={()=>openTab('members')}>{admin?'Manage members and roles':'Team directory'}<span>→</span></button>}
      <button className="hub-row" onClick={()=>org?openTab('templates'):onDesign(null)}>{org?'Office layouts':'Design an office'}<span>→</span></button>
      <a href="#drafts" className="hub-row">Layout drafts <span>{visible.length} →</span></a>
    </article></div>
  </section>;
}
