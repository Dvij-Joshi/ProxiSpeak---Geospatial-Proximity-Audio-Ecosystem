import React, { useState } from 'react';
import {
  Users,
  Maximize2,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Share2,
  MoreHorizontal,
  PhoneOff,
  Sparkles
} from 'lucide-react';
import '../styles/MeetingPanel.css';

import participantYou from '../assets/participant_you.png';
import participantRiya from '../assets/participant_riya.png';
import participantAman from '../assets/participant_aman.png';
import participantNeha from '../assets/participant_neha.png';
import participantKaran from '../assets/participant_karan.png';
import participantPriya from '../assets/participant_priya.png';

export default function MeetingPanel({ onLeave, onExpand }) {
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);

  const participants = [
    { id: 'you', name: 'You', image: participantYou },
    { id: 'riya', name: 'Riya', image: participantRiya },
    { id: 'aman', name: 'Aman', image: participantAman },
    { id: 'neha', name: 'Neha', image: participantNeha },
    { id: 'karan', name: 'Karan', image: participantKaran },
    { id: 'priya', name: 'Priya', image: participantPriya }
  ];

  return (
    <div className="meeting-card">
      {/* Header */}
      <header className="meeting-header">
        <div className="meeting-header-left">
          <div className="meeting-title-box">
            <div className="meeting-room-badge">
              <Sparkles size={10} color="#ffffff" />
            </div>
            <span>Design Sync</span>
          </div>

          <div className="meeting-people-pill">
            <Users size={10} />
            <span>6 people</span>
          </div>
        </div>

        <div className="meeting-header-right">
          <span style={{ fontWeight: 500 }}>12:24</span>
          <button
            type="button"
            className="meeting-expand-btn"
            onClick={onExpand}
            title="Expand meeting"
            aria-label="Expand meeting"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </header>

      {/* 2x3 Video Call Grid */}
      <div className="meeting-grid">
        {participants.map((person) => (
          <div className="video-tile" key={person.id}>
            <img src={person.image} alt={person.name} className="video-tile-img" />
          </div>
        ))}
      </div>

      {/* Bottom Controls */}
      <footer className="meeting-toolbar">
        <div className="meeting-control-btn-wrap">
          <button
            type="button"
            className={`meeting-control-btn ${!micOn ? 'active-off' : ''}`}
            onClick={() => setMicOn(!micOn)}
            aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!micOn}
          >
            {micOn ? <Mic size={13} /> : <MicOff size={13} />}
          </button>
          <span className="meeting-control-label">Mic</span>
        </div>

        <div className="meeting-control-btn-wrap">
          <button
            type="button"
            className={`meeting-control-btn ${!cameraOn ? 'active-off' : ''}`}
            onClick={() => setCameraOn(!cameraOn)}
            aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            aria-pressed={!cameraOn}
          >
            {cameraOn ? <Video size={13} /> : <VideoOff size={13} />}
          </button>
          <span className="meeting-control-label">Camera</span>
        </div>

        <div className="meeting-control-btn-wrap">
          <button
            type="button"
            className={`meeting-control-btn ${screenSharing ? 'active-off' : ''}`}
            onClick={() => setScreenSharing(!screenSharing)}
            aria-label={screenSharing ? 'Stop sharing screen' : 'Share screen'}
            aria-pressed={screenSharing}
          >
            <Share2 size={13} />
          </button>
          <span className="meeting-control-label">Share</span>
        </div>

        <div className="meeting-control-btn-wrap">
          <button type="button" className="meeting-control-btn" aria-label="More meeting options" disabled>
            <MoreHorizontal size={13} />
          </button>
          <span className="meeting-control-label">More</span>
        </div>

        <div className="meeting-control-btn-wrap">
          <button
            type="button"
            className="meeting-control-btn leave-btn"
            onClick={onLeave}
            aria-label="Leave meeting"
          >
            <PhoneOff size={13} />
          </button>
          <span className="meeting-control-label">Leave</span>
        </div>
      </footer>
    </div>
  );
}
