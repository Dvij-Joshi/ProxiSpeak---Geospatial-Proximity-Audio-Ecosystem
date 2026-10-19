import { useState, useEffect } from 'react';
import AuthModal from './components/AuthModal';
import MeetingLobby from './components/MeetingLobby';
import WorldCanvas from './WorldCanvas';
import { SERVER_URL } from './config';

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [inviteRoomId, setInviteRoomId] = useState(null);

  // Check URL query parameters (?room=roomId)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam && roomParam.trim()) {
        setInviteRoomId(roomParam.trim());
      }
    } catch (_e) {}
  }, []);

  // Validate existing JWT session on boot
  useEffect(() => {
    const token = localStorage.getItem('proxispeak_token');
    const cachedUser = localStorage.getItem('proxispeak_user');

    if (!token) {
      setAuthChecking(false);
      return;
    }

    // Quick restore from cache so UI does not flicker
    if (cachedUser) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch (_e) {}
    }

    // Verify token with backend
    fetch(`${SERVER_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          localStorage.setItem('proxispeak_user', JSON.stringify(data.user));
        } else if (res.status === 401 || res.status === 403) {
          // Token explicitly rejected or expired
          localStorage.removeItem('proxispeak_token');
          localStorage.removeItem('proxispeak_user');
          setUser(null);
        } else {
          // Temporary server error, 404 routing, or cold boot: keep cached user session
          console.warn(`[Auth] /api/auth/me returned status ${res.status}. Retaining cached session.`);
        }
      })
      .catch((err) => {
        console.warn('[Auth] Token check network error, retaining cached session:', err.message);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  // If user is authenticated and there is an invite room in the URL, auto-join it
  useEffect(() => {
    if (user && inviteRoomId && !currentRoom) {
      // Lookup room details from API to get the correct name & theme
      fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(inviteRoomId)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((roomData) => {
          if (roomData) {
            setCurrentRoom(roomData);
          } else {
            // Join as dynamic room
            setCurrentRoom({
              roomId: inviteRoomId,
              name: inviteRoomId.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
              theme: 'office',
            });
          }
        })
        .catch(() => {
          setCurrentRoom({
            roomId: inviteRoomId,
            name: inviteRoomId,
            theme: 'office',
          });
        });
    }
  }, [user, inviteRoomId, currentRoom]);

  // Sync current room with browser URL history
  const handleJoinRoom = (room) => {
    setCurrentRoom(room);
    const newUrl = `${window.location.pathname}?room=${encodeURIComponent(room.roomId)}`;
    window.history.pushState({ roomId: room.roomId }, '', newUrl);
  };

  const handleLeaveRoom = () => {
    setCurrentRoom(null);
    setInviteRoomId(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  const handleLogout = () => {
    localStorage.removeItem('proxispeak_token');
    localStorage.removeItem('proxispeak_user');
    setUser(null);
    setCurrentRoom(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  // Loading spinner during initial auth check
  if (authChecking) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#090d16',
          color: '#94a3b8',
          fontFamily: 'Inter, system-ui, sans-serif',
          gap: '16px',
        }}
      >
        <div style={{ fontSize: '42px', animation: 'spin 1.5s infinite linear' }}>🎙️</div>
        <div style={{ fontSize: '15px', color: '#cbd5e1', fontWeight: 500 }}>
          Connecting to ProxiSpeak Network...
        </div>
      </div>
    );
  }

  // Step 1: User Login / Registration Modal
  if (!user) {
    return (
      <AuthModal
        defaultRoomName={inviteRoomId}
        onAuthSuccess={(authenticatedUser) => {
          setUser(authenticatedUser);
        }}
      />
    );
  }

  // Step 3: Active Workspace & Call Canvas
  if (currentRoom) {
    return (
      <WorldCanvas
        user={user}
        room={currentRoom}
        onLeaveRoom={handleLeaveRoom}
      />
    );
  }

  // Step 2: Meeting Lobby (Browse rooms, Host meeting, Join by Code/URL)
  return (
    <MeetingLobby
      user={user}
      onJoinRoom={handleJoinRoom}
      onLogout={handleLogout}
    />
  );
}
