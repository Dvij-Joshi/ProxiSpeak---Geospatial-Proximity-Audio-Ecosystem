import { useState } from 'react';
import { AvatarPortrait } from '../components/WorkspaceArt';

export default function Account({user,onLogout}) {
  const [sound,setSound]=useState(()=>localStorage.getItem('meeting-sfx')!=='off');
  const [error,setError]=useState('');
  function changeSound() {
    try {localStorage.setItem('meeting-sfx',sound?'off':'on');setSound(!sound);setError('');}
    catch {setError('Your browser could not save this preference.');}
  }
  return <section className="hub-account"><h1>Account</h1><div className="hub-card">
    <div className="account-identity"><AvatarPortrait color={user.avatarColor} name={user.username}/><div><h2>{user.username}</h2><p>{user.email}</p></div></div>
    <div className="setting-row"><div><h3>Interaction sounds</h3><p>Play feedback for meeting controls on this device.</p></div>
    <button role="switch" aria-checked={sound} aria-label="Interaction sounds" onClick={changeSound}>{sound?'On':'Off'}</button></div>
    {error && <p role="alert">{error}</p>}
    <div className="setting-row"><h3>Current session</h3><button onClick={onLogout}>Sign out</button></div>
  </div></section>;
}
