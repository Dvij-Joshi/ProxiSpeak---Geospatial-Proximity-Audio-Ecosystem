import { useState } from 'react';
import WorldCanvas from './components/WorldCanvas';
import AudioControls from './components/AudioControls';

function App() {
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);
  const [earshotCount, setEarshotCount] = useState(0);

  const handleJoin = (e) => {
    e.preventDefault();
    if (username.trim()) {
      setJoined(true);
    }
  };

  const handleToggleMic = (muted) => {
    console.log(`[Audio] Mic state toggled: ${muted ? 'muted' : 'unmuted'}`);
  };

  const handleToggleDeafen = (deafened) => {
    console.log(`[Audio] Output deafen state: ${deafened}`);
  };

  if (!joined) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a' }}>
        <h1 style={{ marginBottom: '16px', color: '#f8fafc' }}>🎙️ ProxiSpeak</h1>
        <p style={{ marginBottom: '24px', color: '#94a3b8' }}>Geospatial Proximity Audio Virtual Office</p>
        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '280px' }}>
          <input
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: '6px',
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#f8fafc',
              fontSize: '14px',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={!username.trim()}
            style={{
              padding: '10px',
              borderRadius: '6px',
              border: 'none',
              background: username.trim() ? '#3b82f6' : '#475569',
              color: '#ffffff',
              fontWeight: 600,
              cursor: username.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Join Office
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <WorldCanvas username={username} />
      <AudioControls
        earshotCount={earshotCount}
        onToggleMic={handleToggleMic}
        onToggleDeafen={handleToggleDeafen}
      />
    </div>
  );
}

export default App;
