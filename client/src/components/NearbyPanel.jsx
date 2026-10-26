import React, { useState } from 'react';
import { Volume2, VolumeX, Activity } from 'lucide-react';
import '../styles/NearbyPanel.css';

import nearbyRiya from '../assets/nearby_riya.png';
import nearbyAman from '../assets/nearby_aman.png';
import nearbyNeha from '../assets/nearby_neha.png';
import nearbyKaran from '../assets/nearby_karan.png';
import nearbyPriya from '../assets/nearby_priya.png';

export default function NearbyPanel({ userPos = { x: 52, y: 56 }, onSelectPerson }) {
  const [mutedPeople, setMutedPeople] = useState({});

  // People with positions on office map relative to center
  const initialPeople = [
    {
      id: 'riya',
      name: 'Riya Sharma',
      avatar: nearbyRiya,
      baseDist: 0.8,
      posX: 67,
      posY: 51,
      speaking: true
    },
    {
      id: 'aman',
      name: 'Aman Verma',
      avatar: nearbyAman,
      baseDist: 1.2,
      posX: 60,
      posY: 30,
      speaking: false
    },
    {
      id: 'neha',
      name: 'Neha Gupta',
      avatar: nearbyNeha,
      baseDist: 2.1,
      posX: 67,
      posY: 64,
      speaking: false
    },
    {
      id: 'karan',
      name: 'Karan Mehta',
      avatar: nearbyKaran,
      baseDist: 3.4,
      posX: 35,
      posY: 35,
      speaking: false
    },
    {
      id: 'priya',
      name: 'Priya Singh',
      avatar: nearbyPriya,
      baseDist: 4.0,
      posX: 85,
      posY: 68,
      speaking: false
    }
  ];

  // Keep the reference distances at the starting desk and update them as the user moves.
  const getDistance = (person) => {
    const referencePosition = { x: 48, y: 47 };
    const currentDistance = Math.hypot(userPos.x - person.posX, userPos.y - person.posY);
    const referenceDistance = Math.hypot(referencePosition.x - person.posX, referencePosition.y - person.posY);
    const dist = person.baseDist * (currentDistance / referenceDistance);
    return Math.max(0.4, dist).toFixed(1);
  };

  const toggleMute = (id, e) => {
    e.stopPropagation();
    setMutedPeople((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="nearby-card">
      {/* Header */}
      <header className="nearby-header">
        <h2 className="nearby-title">People Nearby</h2>
        <span className="nearby-count-badge">5</span>
      </header>

      {/* List */}
      <div className="nearby-list">
        {initialPeople.map((person) => {
          const isMuted = mutedPeople[person.id];
          const dist = getDistance(person);
          return (
            <div
              key={person.id}
              className="nearby-item"
              onClick={() => onSelectPerson && onSelectPerson(person)}
            >
              <div className="nearby-item-left">
                <img src={person.avatar} alt={person.name} className="nearby-avatar" />
                <div className="nearby-person-info">
                  <span className="nearby-person-name">{person.name}</span>
                  <div className="nearby-distance-row">
                    <span className="nearby-status-dot"></span>
                    <span>{dist} m</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                className={`nearby-audio-icon ${person.speaking && !isMuted ? 'speaking' : ''}`}
                onClick={(e) => toggleMute(person.id, e)}
                title={isMuted ? 'Unmute' : 'Mute'}
                aria-label={`${isMuted ? 'Unmute' : 'Mute'} ${person.name}`}
                aria-pressed={Boolean(isMuted)}
              >
                {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer Info Box */}
      <div className="nearby-footer-hint">
        <div className="nearby-wave-badge">
          <Activity size={15} />
        </div>
        <div className="nearby-hint-text">
          <span className="nearby-hint-title">Move closer to join in</span>
          <span className="nearby-hint-desc">
            Walk over when you’re ready to talk.
          </span>
        </div>
      </div>
    </div>
  );
}
