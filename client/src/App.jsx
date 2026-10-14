import { useState } from 'react';
import WorldCanvas from './WorldCanvas';

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function App() {
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [colorIdx, setColorIdx] = useState(0);

  if (profile) {
    return <WorldCanvas username={profile.name} avatarColor={profile.color} />;
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', background: '#0f1117', gap: '0',
    }}>
      {/* Logo */}
      <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎙️</div>
      <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
        ProxiSpeak
      </h1>
      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '32px', textAlign: 'center' }}>
        Geospatial Proximity Audio · Virtual Office
      </p>

      {/* Card */}
      <div style={{
        background: '#1e293b', borderRadius: '16px', padding: '32px',
        width: '320px', border: '1px solid #334155',
        boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
      }}>
        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
          Your Name
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && setProfile({ name: name.trim(), color: AVATAR_COLORS[colorIdx] })}
          placeholder="Enter your name..."
          maxLength={20}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '8px',
            border: '1px solid #334155', background: '#0f172a', color: '#f8fafc',
            fontSize: '15px', outline: 'none', marginBottom: '20px',
          }}
        />

        <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
          Avatar Colour
        </label>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
          {AVATAR_COLORS.map((c, i) => (
            <div
              key={c}
              onClick={() => setColorIdx(i)}
              style={{
                width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                border: i === colorIdx ? '3px solid #fff' : '3px solid transparent',
                transition: 'border 0.15s',
              }}
            />
          ))}
        </div>

        <button
          disabled={!name.trim()}
          onClick={() => setProfile({ name: name.trim(), color: AVATAR_COLORS[colorIdx] })}
          style={{
            width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
            background: name.trim() ? AVATAR_COLORS[colorIdx] : '#334155',
            color: '#fff', fontSize: '15px', fontWeight: 600,
            cursor: name.trim() ? 'pointer' : 'not-allowed', transition: 'background 0.2s',
          }}
        >
          Join Office →
        </button>
      </div>

      <p style={{ color: '#475569', fontSize: '12px', marginTop: '20px' }}>
        Use <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', color: '#94a3b8' }}>W A S D</kbd>
        {' '}or Arrow Keys to move
      </p>
    </div>
  );
}
