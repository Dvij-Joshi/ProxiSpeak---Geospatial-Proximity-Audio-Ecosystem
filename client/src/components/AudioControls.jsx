import React, { useState } from 'react';

function AudioControls({ earshotCount = 0, onToggleMic, onToggleDeafen }) {
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  const handleMicClick = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    if (onToggleMic) onToggleMic(nextState);
  };

  const handleDeafenClick = () => {
    const nextState = !isDeafened;
    setIsDeafened(nextState);
    if (onToggleDeafen) onToggleDeafen(nextState);
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        background: 'rgba(17, 24, 39, 0.85)',
        backdropFilter: 'blur(10px)',
        padding: '10px 20px',
        borderRadius: '30px',
        border: '1px solid rgba(75, 85, 99, 0.4)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.36)',
        color: '#f3f4f6',
        fontSize: '14px',
        zIndex: 10,
      }}
    >
      {/* Earshot Proximity Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingRight: '12px',
          borderRight: '1px solid #374151',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: earshotCount > 0 ? '#10b981' : '#6b7280',
          }}
        />
        <span>{earshotCount} in earshot</span>
      </div>

      {/* Mic Mute Button */}
      <button
        onClick={handleMicClick}
        style={{
          background: isMuted ? '#ef4444' : '#374151',
          color: '#ffffff',
          border: 'none',
          padding: '8px 14px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s ease',
        }}
        title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
      >
        <span>{isMuted ? '🔇' : '🎙️'}</span>
        <span>{isMuted ? 'Muted' : 'Mic On'}</span>
      </button>

      {/* Deafen Button */}
      <button
        onClick={handleDeafenClick}
        style={{
          background: isDeafened ? '#ef4444' : '#374151',
          color: '#ffffff',
          border: 'none',
          padding: '8px 14px',
          borderRadius: '20px',
          cursor: 'pointer',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          transition: 'all 0.2s ease',
        }}
        title={isDeafened ? 'Undeafen Audio' : 'Deafen Audio'}
      >
        <span>{isDeafened ? '🔕' : '🎧'}</span>
        <span>{isDeafened ? 'Deafened' : 'Listening'}</span>
      </button>
    </div>
  );
}

export default AudioControls;
