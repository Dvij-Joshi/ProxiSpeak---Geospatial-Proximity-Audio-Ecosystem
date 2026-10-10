import { useState } from 'react';
import WorldCanvas from './components/WorldCanvas';

function App() {
  const [username, setUsername] = useState('');
  const [joined, setJoined] = useState(false);

  if (!joined) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <h1>🎙️ ProxiSpeak</h1>
        <input
          placeholder="Enter your name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button onClick={() => setJoined(true)} disabled={!username.trim()}>
          Join Office
        </button>
      </div>
    );
  }

  return <WorldCanvas username={username} />;
}

export default App;
