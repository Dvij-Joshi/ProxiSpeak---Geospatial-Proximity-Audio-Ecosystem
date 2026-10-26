import React, { useState } from 'react';
import ProxiLogo from './ProxiLogo';
import {
  User,
  Volume2,
  RefreshCw,
  Bell,
  Box,
  Camera,
  ChevronDown
} from 'lucide-react';
import '../styles/ProfilePanel.css';

import sumitProfile from '../assets/sumit_profile.png';
import headerAvatar from '../assets/header_avatar.png';
import avatar1 from '../assets/avatar_1.png';
import avatar2 from '../assets/avatar_2.png';
import avatar3 from '../assets/avatar_3.png';
import avatar4 from '../assets/avatar_4.png';
import avatar5 from '../assets/avatar_5.png';
import avatar6 from '../assets/avatar_6.png';

export default function ProfilePanel({ onThemeChange }) {
  const [activeTab, setActiveTab] = useState('Profile');
  const [name, setName] = useState('Sumit Sahu');
  const [status, setStatus] = useState('Available');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [about, setAbout] = useState('Frontend Developer at Infotact');
  const [selectedAvatar, setSelectedAvatar] = useState(-1);
  const [selectedColor, setSelectedColor] = useState('#5d7668');

  const avatarOptions = [avatar1, avatar2, avatar3, avatar4, avatar5, avatar6];

  const themeColors = [
    { id: 'sage', hex: '#5d7668' },
    { id: 'blue', hex: '#66839a' },
    { id: 'green', hex: '#7a936f' },
    { id: 'amber', hex: '#b78643' },
    { id: 'coral', hex: '#bc5b4c' },
    { id: 'pink', hex: '#ec4899' }
  ];

  const handleColorSelect = (hex) => {
    setSelectedColor(hex);
    document.documentElement.style.setProperty('--color-primary', hex);
    if (onThemeChange) onThemeChange(hex);
  };

  const tabs = [
    { name: 'Profile', icon: User },
    { name: 'Audio & Video', icon: Volume2, disabled: true },
    { name: 'Appearance', icon: RefreshCw, disabled: true },
    { name: 'Notifications', icon: Bell, disabled: true },
    { name: 'Integrations', icon: Box, disabled: true }
  ];

  return (
    <div className="profile-card">
      {/* Mini Sidebar */}
      <aside className="profile-sidebar">
        <div className="profile-brand">
          <ProxiLogo size={13} fontSize={11} />
        </div>

        <div className="profile-tab-list">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.name;
            return (
              <button
                key={tab.name}
                type="button"
                disabled={tab.disabled}
                title={tab.disabled ? `${tab.name} isn’t available in this preview` : undefined}
                className={`profile-tab-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.name)}
              >
                <Icon size={12} />
                <span>{tab.name}</span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main Profile Form */}
      <div className="profile-content">
        {/* Top User Status Bar */}
        <div className="profile-top-bar">
          <div className="profile-header-user">
            <img src={headerAvatar} alt="Sumit" className="profile-mini-avatar" />
            <div className="profile-header-info">
              <div className="profile-header-name">
                <span>Sumit</span>
                <ChevronDown size={9} color="#6b7280" />
              </div>
              <div className="profile-header-status">
                <span className="profile-status-bullet"></span>
                <span>Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="profile-form-body">
          <div className="profile-heading-group">
            <h2 className="profile-title">Profile</h2>
            <p className="profile-desc">
              Manage your profile and how you appear in the office.
            </p>
          </div>

          {/* Hero Row: Photo + Name + Status */}
          <div className="profile-hero-row">
            <div className="profile-photo-wrap">
              <img src={selectedAvatar >= 0 ? avatarOptions[selectedAvatar] : sumitProfile} alt="Sumit profile" className="profile-large-img" />
              <button
                type="button"
                className="profile-camera-badge"
                title="Choose another avatar"
                aria-label="Choose another avatar"
                onClick={() => setSelectedAvatar((index) => (index + 1) % avatarOptions.length)}
              >
                <Camera size={9} />
              </button>
            </div>

            <div className="profile-hero-fields">
              <div className="profile-field-group">
                <label className="profile-field-label" htmlFor="profile-name">Name</label>
                <input
                  id="profile-name"
                  type="text"
                  className="profile-input-box"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="profile-field-group" style={{ position: 'relative' }}>
                <label className="profile-field-label" id="profile-status-label">Status</label>
                <button
                  type="button"
                  className="profile-status-dropdown"
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  aria-label={`Status: ${status}`}
                  aria-haspopup="listbox"
                  aria-expanded={showStatusMenu}
                >
                  <div className="profile-status-value">
                    <span className="profile-status-bullet"></span>
                    <span>{status}</span>
                  </div>
                  <ChevronDown size={10} color="#6b7280" />
                </button>

                {showStatusMenu && (
                  <div
                    className="profile-status-menu"
                    role="listbox"
                    aria-labelledby="profile-status-label"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: 6,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                      zIndex: 20,
                      marginTop: 2
                    }}
                  >
                    {['Available', 'Busy', 'In a meeting', 'Away'].map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        role="option"
                        aria-selected={status === opt}
                        style={{
                          padding: '5px 8px',
                          fontSize: 10,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                        onClick={() => {
                          setStatus(opt);
                          setShowStatusMenu(false);
                        }}
                      >
                        <span
                          style={{
                            width: 5,
                            height: 5,
                            borderRadius: '50%',
                            background:
                              opt === 'Available'
                                ? '#64816a'
                                : opt === 'Busy'
                                ? '#bc5b4c'
                                : opt === 'Away'
                                ? '#b78643'
                                : '#5d7668'
                          }}
                        ></span>
                        <span>{opt}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* About Field */}
          <div className="profile-field-group">
            <label className="profile-field-label" htmlFor="profile-about">About</label>
            <input
              id="profile-about"
              type="text"
              className="profile-input-box"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
          </div>

          {/* Avatar Selector */}
          <div className="profile-field-group">
            <label className="profile-field-label">Avatar</label>
            <div className="profile-avatar-row">
              {avatarOptions.map((av, idx) => (
                <button
                  type="button"
                  key={idx}
                  aria-label={`Choose avatar ${idx + 1}`}
                  aria-pressed={selectedAvatar === idx}
                  className={`profile-avatar-option ${selectedAvatar === idx ? 'selected' : ''}`}
                  onClick={() => setSelectedAvatar(idx)}
                >
                  <img src={av} alt={`Avatar ${idx + 1}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Theme Color Selector */}
          <div className="profile-field-group">
            <label className="profile-field-label">Theme Color</label>
            <div className="profile-color-row">
              {themeColors.map((col) => (
                <button
                  type="button"
                  key={col.id}
                  aria-label={`Use ${col.id} theme`}
                  aria-pressed={selectedColor === col.hex}
                  className={`profile-color-swatch ${selectedColor === col.hex ? 'selected' : ''}`}
                  style={{ background: col.hex }}
                  onClick={() => handleColorSelect(col.hex)}
                  title={col.id}
                />
              ))}
              <button type="button" className="profile-color-more" title="More colors aren’t available in this preview" aria-label="More colors unavailable" disabled>
                ...
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
