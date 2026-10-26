import React, { useState } from 'react';
import ProxiLogo from './ProxiLogo';
import {
  Home,
  Users,
  Box,
  MessageSquare,
  Calendar,
  Building2,
  Settings,
  Search,
  Bell,
  ChevronDown
} from 'lucide-react';
import '../styles/OfficePanel.css';

import officeCanvasExact from '../assets/office_canvas_exact.png';
import headerAvatar from '../assets/header_avatar.png';

export default function OfficePanel({
  userPos = { x: 48, y: 47 },
  onUserPositionChange,
  onNavigateTab,
  onOpenMeeting
}) {
  const [activeTab, setActiveTab] = useState('Office');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [query, setQuery] = useState('');
  const [youPosition, setYouPosition] = useState(userPos);
  const [hasMoved, setHasMoved] = useState(false);
  const [screenShared, setScreenShared] = useState(false);
  const people = ['Riya Sharma', 'Aman Verma', 'Neha Gupta', 'Karan Mehta', 'Priya Singh'];
  const rooms = ['Design Team', 'Product', 'Marketing', 'Lounge', 'Meeting Room'];
  const results = [...people, ...rooms].filter((item) => item.toLowerCase().includes(query.trim().toLowerCase()));

  const navItems = [
    { name: 'Office', icon: Home },
    { name: 'People', icon: Users },
    { name: 'Rooms', icon: Box },
    { name: 'Chat', icon: MessageSquare, disabled: true },
    { name: 'Calendar', icon: Calendar, disabled: true }
  ];

  return (
    <div className="office-card">
      {/* Left Sidebar */}
      <aside className="office-sidebar">
        <div className="office-sidebar-top">
          <div className="office-brand">
            <ProxiLogo size={13} fontSize={11} />
          </div>

          <div className="office-nav-list">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.name;
              return (
                <button
                  key={item.name}
                  type="button"
                  disabled={item.disabled}
                  title={item.disabled ? `${item.name} isn’t available in this preview` : undefined}
                  className={`office-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab(item.name);
                    if (onNavigateTab) onNavigateTab(item.name);
                  }}
                >
                  <Icon size={12} strokeWidth={isActive ? 2.2 : 1.8} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="office-sidebar-bottom">
          <button
            type="button"
            className="office-nav-item"
            onClick={() => {
              setActiveTab('Settings');
              if (onNavigateTab) onNavigateTab('Settings');
            }}
          >
            <Settings size={12} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      {/* Main Office Space */}
      <div className="office-main">
        {/* Top Header */}
        <header className="office-header">
          <div className="office-workspace-btn">
            <Building2 size={12} strokeWidth={1.8} />
            <span>Infotact HQ</span>
            <ChevronDown size={11} color="#6b7280" />
          </div>

          <div className="office-search-box">
            <Search size={11} color="#9ca3af" />
            <input
              type="text"
              placeholder="Search people or rooms..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search people or rooms"
            />
            {query && (
              <button className="office-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
                ×
              </button>
            )}
            {query && (
              <div className="office-search-results">
                {results.length ? results.map((item) => (
                  <button key={item} onClick={() => { setQuery(item); if (rooms.includes(item)) setActiveTab('Office'); }}>
                    {item}<span>{rooms.includes(item) ? 'Room' : 'Person'}</span>
                  </button>
                )) : <div className="office-search-empty">No matches</div>}
              </div>
            )}
          </div>

          <div className="office-header-user">
            <button type="button" className="office-bell-btn" aria-label="Notifications unavailable in this preview" title="Notifications unavailable in this preview" disabled>
              <Bell size={13} />
              <span className="office-bell-dot"></span>
            </button>

            <button
              type="button"
              className="office-user-profile"
              aria-label="Open profile settings"
              onClick={() => {
                if (onNavigateTab) onNavigateTab('Profile');
              }}
            >
              <img src={headerAvatar} alt="Sumit" className="office-avatar-circle" />
              <div className="office-user-info">
                <div className="office-user-name-row">
                  <span>Sumit</span>
                  <ChevronDown size={10} color="#6b7280" />
                </div>
                <div className="office-status-pill">
                  <span className="office-status-dot"></span>
                  <span>Online</span>
                </div>
              </div>
            </button>
          </div>
        </header>

        {/* Office Top-Down Map Canvas with Exact Art & Click Targets */}
        <div className="office-map-container">
          <img
            src={officeCanvasExact}
            alt="Virtual office layout"
            className="office-canvas-bg"
          />

          <div className="office-move-hint">Drag your avatar to move</div>
          <button
            type="button"
            className={`office-movable-avatar ${hasMoved ? 'moved' : ''}`}
            style={{ left: `${youPosition.x}%`, top: `${youPosition.y}%` }}
            onPointerDown={(event) => {
              setHasMoved(true);
              const bounds = event.currentTarget.parentElement.getBoundingClientRect();
              const move = (e) => {
                const nextPosition = {
                  x: Math.min(97, Math.max(3, ((e.clientX - bounds.left) / bounds.width) * 100)),
                  y: Math.min(91, Math.max(5, ((e.clientY - bounds.top) / bounds.height) * 100))
                };
                setYouPosition(nextPosition);
                onUserPositionChange?.(nextPosition);
              };
              move(event);
              const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
              window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
            }}
            aria-label="Move your avatar"
            title="Drag to move your avatar"
          >
            <img src={headerAvatar} alt="" />
          </button>

          {/* Interactive Hit Areas */}
          <div className="office-interactive-overlay">
            {/* Call Toolbar Hit Area */}
            <div className="office-call-hit-bar">
              <button
                type="button"
                className={`office-call-hit-target ${micMuted ? 'active' : ''}`}
                title={micMuted ? 'Unmute Mic' : 'Mute Mic'}
                aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={micMuted}
                onClick={() => setMicMuted(!micMuted)}
              />
              <button
                type="button"
                className={`office-call-hit-target ${cameraOff ? 'active' : ''}`}
                title={cameraOff ? 'Turn on Camera' : 'Turn off Camera'}
                aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                aria-pressed={cameraOff}
                onClick={() => setCameraOff(!cameraOff)}
              />
              <button
                type="button"
                className={`office-call-hit-target ${screenShared ? 'active' : ''}`}
                title="Share Screen"
                aria-label={screenShared ? 'Stop sharing screen' : 'Share screen'}
                aria-pressed={screenShared}
                onClick={() => setScreenShared((value) => !value)}
              />
              <button
                type="button"
                className="office-call-hit-target"
                title="Leave / Open Meeting Room"
                aria-label="Open meeting room"
                onClick={() => {
                  if (onOpenMeeting) onOpenMeeting();
                }}
              />
            </div>

            {/* Meeting Room Hit Area (Bottom Right) */}
            <button
              type="button"
              className="office-room-hit-area"
              style={{
                position: 'absolute',
                bottom: 20,
                right: 30,
                width: 140,
                height: 110,
                cursor: 'pointer',
                pointerEvents: 'auto'
              }}
              title="Click to enter Meeting Room"
              aria-label="Enter meeting room"
              onClick={() => {
                if (onOpenMeeting) onOpenMeeting();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
