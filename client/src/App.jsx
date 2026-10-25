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

  // Validate existing JWT session on boot with smooth boot sequence
  useEffect(() => {
    const token = localStorage.getItem('proxispeak_token');
    const cachedUser = localStorage.getItem('proxispeak_user');
    const bootStartTime = Date.now();
    const minBootTimeMs = 800; // Guarantees a smooth, visible luxury boot sequence

    const finishBoot = () => {
      const elapsed = Date.now() - bootStartTime;
      const remaining = Math.max(0, minBootTimeMs - elapsed);
      setTimeout(() => {
        setAuthChecking(false);
      }, remaining);
    };

    if (!token) {
      finishBoot();
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
        finishBoot();
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

  const [showAuthModal, setShowAuthModal] = useState(false);

  // Sync current room with browser URL history
  const handleJoinRoom = (room) => {
    // If not authenticated, create guest user credentials so canvas works seamlessly
    if (!user) {
      const guestName = 'Guest-' + Math.floor(1000 + Math.random() * 9000);
      const guestUser = {
        userId: 'guest-' + Math.random().toString(36).substring(2, 9),
        username: guestName,
        email: `${guestName.toLowerCase()}@guest.local`,
        avatarColor: '#FF4B2B',
        isGuest: true,
      };
      localStorage.setItem('proxispeak_token', 'guest-token-' + Date.now());
      localStorage.setItem('proxispeak_user', JSON.stringify(guestUser));
      setUser(guestUser);
    }

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

  // High-End Architectural Audio Loading Screen
  if (authChecking) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#FAF9F5] select-none z-50">
        <style>{`
          @keyframes soundwave {
            0%, 100% {
              transform: scaleY(0.22);
              opacity: 0.35;
            }
            50% {
              transform: scaleY(1);
              opacity: 1;
            }
          }
          @keyframes shimmerProgress {
            0% { transform: translateX(-150%); }
            100% { transform: translateX(250%); }
          }
          @keyframes pulseRing {
            0% { transform: scale(0.88); opacity: 0.3; }
            50% { transform: scale(1.18); opacity: 0.85; }
            100% { transform: scale(0.88); opacity: 0.3; }
          }
          .sound-bar {
            display: inline-block !important;
            width: 3.5px !important;
            height: 24px !important;
            background-color: #1c1b1b !important;
            border-radius: 9999px !important;
            transform-origin: center !important;
            animation: soundwave 1.1s ease-in-out infinite !important;
          }
          .sound-bar-accent {
            background-color: #FF4B2B !important;
          }
        `}</style>

        {/* Spatial Acoustic Node */}
        <div className="relative flex items-center justify-center">
          {/* Subtle Concentric Pulse Ring */}
          <div
            className="absolute w-24 h-24 rounded-full border border-[#D9D7D0]/70 pointer-events-none"
            style={{ animation: 'pulseRing 2.8s ease-in-out infinite' }}
          />

          {/* Central Acoustic Core */}
          <div className="w-16 h-16 rounded-2xl bg-white border border-[#D9D7D0] shadow-[0_8px_30px_rgba(0,0,0,0.05)] flex items-center justify-center gap-[4px] z-10">
            <span className="sound-bar" style={{ animationDelay: '0s' }} />
            <span className="sound-bar" style={{ animationDelay: '0.2s' }} />
            <span className="sound-bar sound-bar-accent" style={{ animationDelay: '0.4s' }} />
            <span className="sound-bar" style={{ animationDelay: '0.15s' }} />
            <span className="sound-bar" style={{ animationDelay: '0.35s' }} />
          </div>
        </div>

        {/* Brand & Status */}
        <div className="mt-7 flex flex-col items-center text-center">
          <div className="font-mono text-[11px] font-semibold tracking-[0.28em] uppercase text-[#1c1b1b]">
            ProxiSpeak
          </div>
          <div className="text-[12px] text-[#8C8880] mt-1.5 font-normal tracking-wide">
            Connecting to spatial audio network...
          </div>

          {/* Hairline Precision Progress Meter */}
          <div className="w-36 h-[2px] bg-[#E9E8E4] rounded-full overflow-hidden relative mt-4">
            <div
              className="absolute top-0 bottom-0 w-16 bg-gradient-to-r from-transparent via-[#FF4B2B] to-transparent"
              style={{ animation: 'shimmerProgress 1.6s infinite ease-in-out' }}
            />
          </div>
        </div>

        {/* Architectural Footer Specification */}
        <div className="absolute bottom-8 font-mono text-[9px] tracking-[0.25em] text-[#BDBAB2] uppercase">
          3D HRTF Spatial Engine · WebRTC Mesh
        </div>
      </div>
    );
  }

  // Active Workspace & Call Canvas
  if (currentRoom) {
    const activeUser = user || {
      userId: 'guest-' + Math.random().toString(36).substring(2, 9),
      username: 'Guest-' + Math.floor(1000 + Math.random() * 9000),
      avatarColor: '#FF4B2B',
      isGuest: true,
    };

    return (
      <div style={{ background: '#FAF9F5', minHeight: '100vh', width: '100%' }}>
        <WorldCanvas
          user={activeUser}
          room={currentRoom}
          onLeaveRoom={handleLeaveRoom}
        />
      </div>
    );
  }

  // Main Home Page '/' - Stitch Lumio SaaS Landing Page & Spatial Workspaces Hub
  return (
    <>
      <MeetingLobby
        user={user}
        onJoinRoom={handleJoinRoom}
        onLogout={handleLogout}
        onRequestAuth={() => setShowAuthModal(true)}
      />

      {/* Auth Modal Overlay */}
      {showAuthModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div style={{ position: 'relative', width: '100%', maxWidth: '440px' }}>
            <button
              onClick={() => setShowAuthModal(false)}
              style={{
                position: 'absolute',
                top: '-40px',
                right: '0',
                color: '#ffffff',
                background: 'rgba(255, 255, 255, 0.15)',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
            <AuthModal
              defaultRoomName={inviteRoomId}
              onAuthSuccess={(authenticatedUser) => {
                setUser(authenticatedUser);
                setShowAuthModal(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

