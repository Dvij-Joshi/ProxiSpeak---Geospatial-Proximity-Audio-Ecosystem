import React, { useState } from 'react';
import CompositeView from './components/CompositeView';
import LandingPanel from './components/LandingPanel';
import OfficePanel from './components/OfficePanel';
import MeetingPanel from './components/MeetingPanel';
import NearbyPanel from './components/NearbyPanel';
import ProfilePanel from './components/ProfilePanel';
import { LayoutGrid, Globe, Building2, Video, Users, UserCog } from 'lucide-react';
import './styles/main.css';

export default function App() {
  const [viewMode, setViewMode] = useState('composite');
  const [userPos, setUserPos] = useState({ x: 48, y: 47 });

  const handleTabNavigation = (tabName) => {
    if (tabName === 'Office') setViewMode('office');
    else if (tabName === 'Meeting') setViewMode('meeting');
    else if (tabName === 'People') setViewMode('nearby');
    else if (tabName === 'Rooms') setViewMode('office');
    else if (tabName === 'Settings' || tabName === 'Profile') setViewMode('profile');
    else return;
  };

  return (
    <>
      {/* 1:1 Composite View (Identical to reference image) */}
      {viewMode === 'composite' && (
        <CompositeView
          userPos={userPos}
          onUserPositionChange={setUserPos}
          onNavigateTab={handleTabNavigation}
          onOpenMeeting={() => setViewMode('meeting')}
          onThemeChange={() => {}}
        />
      )}

      {/* Focused Screen Views */}
      {viewMode === 'landing' && (
        <main className="focus-view-container">
          <div className="focus-view-card">
          <LandingPanel
            onGetStarted={() => setViewMode('office')}
            onOpenMeeting={() => setViewMode('meeting')}
          />
          </div>
        </main>
      )}

      {viewMode === 'office' && (
        <main className="focus-view-container">
          <div className="focus-view-card">
            <OfficePanel
              userPos={userPos}
              onUserPositionChange={setUserPos}
              onNavigateTab={handleTabNavigation}
              onOpenMeeting={() => setViewMode('meeting')}
            />
          </div>
        </main>
      )}

      {viewMode === 'meeting' && (
        <main className="focus-view-container">
          <div className="focus-view-card" style={{ background: 'var(--bg-dark-panel)', borderColor: 'var(--border-dark)' }}>
            <MeetingPanel
              onLeave={() => setViewMode('office')}
              onExpand={() => {}}
            />
          </div>
        </main>
      )}

      {viewMode === 'nearby' && (
        <main className="focus-view-container">
          <div className="focus-view-card" style={{ maxWidth: 360, height: 480 }}>
            <NearbyPanel userPos={userPos} />
          </div>
        </main>
      )}

      {viewMode === 'profile' && (
        <main className="focus-view-container">
          <div className="focus-view-card" style={{ maxWidth: 680, height: 520 }}>
            <ProfilePanel />
          </div>
        </main>
      )}

      {/* Discreet floating mode toggle for testing/exploring individual screens */}
      <nav className="floating-view-toggle" title="Switch View Mode">
        <button
          className={`toggle-pill-btn ${viewMode === 'composite' ? 'active' : ''}`}
          onClick={() => setViewMode('composite')}
        >
          <LayoutGrid size={11} />
          <span>1:1 Reference</span>
        </button>
        <button
          className={`toggle-pill-btn ${viewMode === 'landing' ? 'active' : ''}`}
          onClick={() => setViewMode('landing')}
        >
          <Globe size={11} />
          <span>Landing</span>
        </button>
        <button
          className={`toggle-pill-btn ${viewMode === 'office' ? 'active' : ''}`}
          onClick={() => setViewMode('office')}
        >
          <Building2 size={11} />
          <span>Office</span>
        </button>
        <button
          className={`toggle-pill-btn ${viewMode === 'meeting' ? 'active' : ''}`}
          onClick={() => setViewMode('meeting')}
        >
          <Video size={11} />
          <span>Meeting</span>
        </button>
        <button
          className={`toggle-pill-btn ${viewMode === 'nearby' ? 'active' : ''}`}
          onClick={() => setViewMode('nearby')}
        >
          <Users size={11} />
          <span>Nearby</span>
        </button>
        <button
          className={`toggle-pill-btn ${viewMode === 'profile' ? 'active' : ''}`}
          onClick={() => setViewMode('profile')}
        >
          <UserCog size={11} />
          <span>Profile</span>
        </button>
      </nav>
    </>
  );
}
