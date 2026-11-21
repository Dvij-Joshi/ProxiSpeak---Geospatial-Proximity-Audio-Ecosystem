import { useState, useEffect, lazy, Suspense } from 'react';
import AuthModal from './components/AuthModal';
import MeetingLobby from './components/MeetingLobby';


import OrganizationHub from './components/OrganizationHub';
import { playUiChime } from './services/meetingSounds';
import { SERVER_URL } from './config';

const OfficeDesigner = lazy(() => import('./components/OfficeDesigner'));
const WorldCanvas = lazy(() => import('./WorldCanvas'));

function LoadingScreen() {
  return <div className="boot-screen" role="status">
    <img src="/favicon.svg" width="54" height="54" alt="" />
    <strong>ProxiSpeak</strong><span>Opening your workspace...</span>
  </div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [inviteRoomId, setInviteRoomId] = useState(null);
  const [isDesigningOffice, setIsDesigningOffice] = useState(false);
  const [initialLayout,setInitialLayout] = useState(null);
  const [draftId,setDraftId] = useState(null);
  const [hubTab,setHubTab] = useState('overview');
  const [designerOrg, setDesignerOrg] = useState(null);
  const [showOrgHub, setShowOrgHub] = useState(false);
  const [activeOrg, setActiveOrg] = useState(undefined);

  useEffect(() => {
    const onClick = event => {
      if (event.target.closest?.('button:not(:disabled)')) playUiChime('click');
    };
    document.addEventListener('click',onClick,true);
    return () => document.removeEventListener('click',onClick,true);
  }, []);

  // Check URL query parameters (?room=roomId)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      if (roomParam && roomParam.trim()) {
        setInviteRoomId(roomParam.trim());
      }
      if (params.get('orgs') === 'true' || params.get('organizations') === 'true' || window.location.pathname === '/organizations') {
        setShowOrgHub(true);
      }
      if (params.get('designer') === 'true' || window.location.pathname === '/designer') {
        setIsDesigningOffice(true);
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
    // If not authenticated, require registration or sign in
    if (!user) {
      setShowAuthModal(true);
      return;
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
    setActiveOrg(null);
    setDesignerOrg(null);
    setCurrentRoom(null);
    window.history.pushState({}, '', window.location.pathname);
  };

  const openDesigner = (org=null,layout=null,id=null) => {
    setActiveOrg(org); setDesignerOrg(org); setInitialLayout(layout); setDraftId(id);
    setShowOrgHub(false); setIsDesigningOffice(true);
  };
  const openHub = (org,tab='overview') => {
    setActiveOrg(org || null); setHubTab(tab); setShowOrgHub(true);
  };

  if(authChecking) return <LoadingScreen />;

  // Interactive Office Designer View (Pillar 2)
  if (isDesigningOffice) {
    return (
      <Suspense fallback={<LoadingScreen />}><OfficeDesigner
        user={user}
        organization={designerOrg} initialLayout={initialLayout} draftId={draftId}
        onBackToLobby={() => {
          setIsDesigningOffice(false);
          window.history.replaceState({},'',window.location.pathname==='/designer'?'/':window.location.pathname);
        }}
        onLaunchOffice={(officeData) => {
          setIsDesigningOffice(false);
          handleJoinRoom(officeData);
        }}
      /></Suspense>
    );
  }

  // Active Workspace & Call Canvas
  if (currentRoom) {
    if (!user) {
      return (
        <AuthModal
          defaultRoomName={currentRoom.roomId}
          onClose={() => setCurrentRoom(null)}
          onAuthSuccess={(authenticatedUser) => {
            setUser(authenticatedUser);
          }}
        />
      );
    }

    return (
      <Suspense fallback={<LoadingScreen />}>
        <WorldCanvas
          user={user}
          room={currentRoom}
          onLeaveRoom={handleLeaveRoom}
        />
      </Suspense>
    );
  }

  // Workspace directory
  return (
    <>
      <MeetingLobby
        user={user}
        onJoinRoom={handleJoinRoom}
        onLogout={handleLogout}
        onRequestAuth={() => setShowAuthModal(true)}
        onOpenDesigner={openDesigner}
        onResumeDraft={(draft,org)=>openDesigner(org,draft.layout,draft.id)}
        onSelectOrg={setActiveOrg}
        onDashboardHub={openHub}
        onOpenOrgHub={()=>openHub(activeOrg)}
        activeOrg={activeOrg}
      />

      {/* Organization & Office Layouts Hub Modal */}
      {showOrgHub && (
        <OrganizationHub
          user={user}
          currentOrg={activeOrg}
          onSelectOrg={(org) => setActiveOrg(org)}
          initialTab={hubTab}
          onOpenDesigner={openDesigner}
          onLaunchOffice={(officeData) => {
            setShowOrgHub(false);
            handleJoinRoom(officeData);
          }}
          onLogout={handleLogout}
          onAuthSuccess={(authData) => {
            if (authData?.token) localStorage.setItem('proxispeak_token', authData.token);
            if (authData?.user) {
              localStorage.setItem('proxispeak_user', JSON.stringify(authData.user));
              setUser(authData.user);
            }
          }}
          onRequestAuth={() => setShowAuthModal(true)}
          onClose={() => setShowOrgHub(false)}
        />
      )}

      {/* Auth Modal Dialog */}
      {showAuthModal && (
        <AuthModal
          defaultRoomName={inviteRoomId}
          onClose={() => setShowAuthModal(false)}
          onAuthSuccess={(authenticatedUser) => {
            setUser(authenticatedUser);
            setShowAuthModal(false);
          }}
        />
      )}
    </>
  );
}
