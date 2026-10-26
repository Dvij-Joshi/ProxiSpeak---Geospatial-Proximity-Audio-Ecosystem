import React from 'react';

export default function ProxiLogo({ size = 20, fontSize = 16, color = 'var(--text-main)', showText = true }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', userSelect: 'none' }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ProxiSpeak custom 4-lobed / blossom icon */}
        <circle cx="12" cy="6" r="3.6" fill="#7c9483" opacity="0.9" />
        <circle cx="18" cy="12" r="3.6" fill="#5d7668" />
        <circle cx="12" cy="18" r="3.6" fill="#91a596" />
        <circle cx="6" cy="12" r="3.6" fill="#4a6154" />
        <circle cx="12" cy="12" r="2.2" fill="#41594b" />
      </svg>
      {showText && (
        <span
          style={{
            fontWeight: 700,
            fontSize: `${fontSize}px`,
            color: color,
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-family)',
          }}
        >
          ProxiSpeak
        </span>
      )}
    </div>
  );
}
