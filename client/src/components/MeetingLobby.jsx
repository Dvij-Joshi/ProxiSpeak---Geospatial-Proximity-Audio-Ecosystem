import { useState, useEffect } from 'react';
import { SERVER_URL } from '../config';

const THEME_OPTIONS = [
  {
    id: 'office',
    name: 'Corporate Office',
    icon: '🏢',
    desc: 'Executive suites, conference room, lounge, and open desks.',
    color: '#3b82f6',
  },
  {
    id: 'conference',
    name: 'Conference & Auditorium',
    icon: '🏛️',
    desc: 'Keynote stage, presentation hall, and breakout pods.',
    color: '#8b5cf6',
  },
  {
    id: 'lounge',
    name: 'Rooftop Social Lounge',
    icon: '☕',
    desc: 'Casual coffee bar, sofa booths, and open air terrace.',
    color: '#10b981',
  },
];

export default function MeetingLobby({ user, onJoinRoom, onLogout }) {
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');

  // Host modal state
  const [showHostModal, setShowHostModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomTheme, setNewRoomTheme] = useState('office');
  const [creating, setCreating] = useState(false);

  // Fetch rooms list
  const fetchRooms = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/rooms`);
      if (res.ok) {
        const data = await res.json();
        setRooms(data);
      }
    } catch (err) {
      console.warn('[Lobby] Failed to fetch rooms:', err.message);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const timer = setInterval(fetchRooms, 4000);
    return () => clearInterval(timer);
  }, []);

  const handleJoinByCode = (e) => {
    e.preventDefault();
    setJoinError('');

    if (!joinCode.trim()) {
      setJoinError('Please enter a room code or invite link.');
      return;
    }

    let code = joinCode.trim();
    // Parse URL if user pasted full invite URL
    if (code.includes('?room=')) {
      const parts = code.split('?room=');
      if (parts[1]) {
        code = parts[1].split('&')[0];
      }
    } else if (code.includes('/room/')) {
      const parts = code.split('/room/');
      if (parts[1]) {
        code = parts[1].split('/')[0];
      }
    }

    if (!code) {
      setJoinError('Invalid meeting link or code.');
      return;
    }

    onJoinRoom({
      roomId: code,
      name: code.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      theme: 'office',
    });
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;

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
      alert(err.message || 'Error creating meeting room.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#090d16',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top Navigation */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 32px',
          background: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(51, 65, 85, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '24px' }}>🎙️</span>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: '#f8fafc' }}>
              ProxiSpeak
            </h2>
            <p style={{ margin: 0, fontSize: '11px', color: '#64748b' }}>
              Spatial Audio Virtual Workspaces
            </p>
          </div>
        </div>

        {/* User Profile Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '6px 14px',
              borderRadius: '24px',
              background: '#1e293b',
              border: '1px solid #334155',
            }}
          >
            <div
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: user.avatarColor || '#3b82f6',
                boxShadow: `0 0 8px ${user.avatarColor || '#3b82f6'}`,
              }}
            />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
              {user.username}
            </span>
          </div>

          <button
            onClick={onLogout}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, maxWidth: '1100px', width: '100%', margin: '0 auto', padding: '36px 20px' }}>
        {/* Hero Section */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em', margin: '0 0 10px 0' }}>
            Choose a Workspace or Host a Call
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '15px', maxWidth: '600px', margin: '0 auto' }}>
            Walk up to teammates to speak naturally. Sound attenuates smoothly with distance and direction.
          </p>
        </div>

        {/* Action Grid: Host vs Join */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '20px',
            marginBottom: '44px',
          }}
        >
          {/* Card 1: Host a Meeting */}
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>✨</div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
                Host a New Meeting
              </h3>
              <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 20px 0' }}>
                Create a customized spatial meeting room. Choose from Corporate Office, Auditorium, or Lounge canvas layouts.
              </p>
            </div>
            <button
              onClick={() => setShowHostModal(true)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                boxShadow: '0 4px 15px rgba(37, 99, 235, 0.4)',
              }}
            >
              + Host Meeting Room
            </button>
          </div>

          {/* Card 2: Join with Code / Link */}
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.9))',
              border: '1px solid rgba(51, 65, 85, 0.6)',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 12px 30px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔗</div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
                Join with Code or Link
              </h3>
              <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 16px 0' }}>
                Invited to a call? Enter the meeting code or paste the shared invite URL below.
              </p>

              {joinError && (
                <div style={{ color: '#f87171', fontSize: '12px', marginBottom: '10px' }}>
                  ⚠️ {joinError}
                </div>
              )}

              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode(e)}
                placeholder="e.g. main-office or https://.../?room=xyz"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: '16px',
                }}
              />
            </div>

            <button
              onClick={handleJoinByCode}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              Join Meeting →
            </button>
          </div>
        </div>

        {/* Featured / Active Workspaces Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Active & Official Workspaces
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Jump directly into persistent company canvases with live users.
              </p>
            </div>
            <button
              onClick={fetchRooms}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              🔄 Refresh
            </button>
          </div>

          {loadingRooms ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
              Loading workspaces...
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: '16px',
              }}
            >
              {rooms.map((r) => {
                const themeMeta = THEME_OPTIONS.find(t => t.id === r.theme) || THEME_OPTIONS[0];
                const isOccupied = r.activeUsers > 0;

                return (
                  <div
                    key={r.roomId}
                    onClick={() => onJoinRoom(r)}
                    style={{
                      background: 'rgba(30, 41, 59, 0.5)',
                      border: '1px solid rgba(51, 65, 85, 0.6)',
                      borderRadius: '14px',
                      padding: '20px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = themeMeta.color;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(51, 65, 85, 0.6)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '26px' }}>{themeMeta.icon}</span>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '3px 10px',
                            borderRadius: '16px',
                            background: isOccupied ? 'rgba(16, 185, 129, 0.15)' : 'rgba(100, 116, 139, 0.15)',
                            border: `1px solid ${isOccupied ? 'rgba(16, 185, 129, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
                            fontSize: '11px',
                            fontWeight: 600,
                            color: isOccupied ? '#34d399' : '#94a3b8',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: isOccupied ? '#10b981' : '#64748b',
                            }}
                          />
                          <span>{r.activeUsers} online</span>
                        </div>
                      </div>

                      <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
                        {r.name}
                      </h4>
                      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px 0', lineHeight: '1.4' }}>
                        {r.description || themeMeta.desc}
                      </p>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '12px',
                        borderTop: '1px solid rgba(51, 65, 85, 0.4)',
                        fontSize: '12px',
                        color: '#64748b',
                      }}
                    >
                      <span style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>#{r.roomId}</span>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>Enter Canvas →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Host Meeting Modal */}
      {showHostModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            zIndex: 100,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '460px',
              background: '#131b2e',
              border: '1px solid #334155',
              borderRadius: '16px',
              padding: '28px',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Host a Spatial Meeting
              </h3>
              <button
                onClick={() => setShowHostModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRoom}>
              {/* Meeting Name */}
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px', textTransform: 'uppercase' }}>
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="e.g. Design Critique, Team Standup"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Theme Selector */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '10px', textTransform: 'uppercase' }}>
                  Choose Canvas Layout
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {THEME_OPTIONS.map((theme) => {
                    const isSelected = newRoomTheme === theme.id;
                    return (
                      <div
                        key={theme.id}
                        onClick={() => setNewRoomTheme(theme.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: isSelected ? 'rgba(59, 130, 246, 0.15)' : '#0f172a',
                          border: `1.5px solid ${isSelected ? '#3b82f6' : '#1e293b'}`,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ fontSize: '24px' }}>{theme.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: isSelected ? '#60a5fa' : '#f8fafc' }}>
                            {theme.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            {theme.desc}
                          </div>
                        </div>
                        {isSelected && <span style={{ color: '#3b82f6', fontWeight: 700 }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowHostModal(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    background: 'transparent',
                    color: '#94a3b8',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newRoomName.trim()}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: creating ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
                  }}
                >
                  {creating ? 'Creating...' : 'Launch Meeting →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
