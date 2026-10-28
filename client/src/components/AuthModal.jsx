import { useState } from 'react';
import { SERVER_URL, AVATAR_COLORS } from '../config';

export default function AuthModal({ onAuthSuccess, defaultRoomName }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGuestJoin = (e) => {
    if (e) e.preventDefault();
    const cleanName = username.trim() || 'Guest-' + Math.floor(1000 + Math.random() * 9000);
    const guestUser = {
      userId: 'guest-' + Math.random().toString(36).substring(2, 9),
      username: cleanName,
      email: `${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}@guest.local`,
      avatarColor: selectedColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      isGuest: true,
    };
    const guestToken = 'guest-token-' + Date.now();
    localStorage.setItem('proxispeak_token', guestToken);
    localStorage.setItem('proxispeak_user', JSON.stringify(guestUser));
    onAuthSuccess(guestUser);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isLogin) {
      if (!username.trim() || !password) {
        setError('Please enter your username/email and password.');
        return;
      }
    } else {
      if (!username.trim() || username.trim().length < 2) {
        setError('Username must be at least 2 characters long.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
    }

    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin
        ? { identifier: username.trim(), password }
        : {
            username: username.trim(),
            email: email.trim(),
            password,
            avatarColor: selectedColor,
          };

      let res;
      try {
        res = await fetch(`${SERVER_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (networkErr) {
        console.warn('[AuthModal] Network error reaching', SERVER_URL, networkErr);
        throw new Error(`Unable to reach server at ${SERVER_URL}. Check your network or click 'Quick Join as Guest' below.`);
      }

      let data = {};
      const responseText = await res.text();
      try {
        data = JSON.parse(responseText);
      } catch (_jsonErr) {
        console.warn('[AuthModal] Non-JSON server response:', responseText.slice(0, 120));
        if (!res.ok) {
          throw new Error(`Server returned ${res.status} (${res.statusText || 'Service Temporarily Unavailable'}). Please try again or join as Guest.`);
        }
        throw new Error('Unexpected server response format.');
      }

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please check your credentials.');
      }

      // Persist auth token and user profile
      localStorage.setItem('proxispeak_token', data.token);
      localStorage.setItem('proxispeak_user', JSON.stringify(data.user));

      onAuthSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#090d16',
        padding: '20px',
        color: '#f8fafc',
      }}
    >
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ fontSize: '42px', marginBottom: '6px' }}>🎙️</div>
        <h1 style={{ fontSize: '30px', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#f8fafc' }}>
          ProxiSpeak
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
          Geospatial Proximity Audio & Virtual Workspaces
        </p>
        {defaultRoomName && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '12px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              fontSize: '12px',
              color: '#60a5fa',
            }}
          >
            <span>🔗 Invited to join:</span>
            <strong>{defaultRoomName}</strong>
          </div>
        )}
      </div>

      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'rgba(23, 31, 48, 0.85)',
          backdropFilter: 'blur(16px)',
          borderRadius: '16px',
          border: '1px solid rgba(51, 65, 85, 0.6)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Tab Toggle */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b' }}>
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(''); }}
            style={{
              flex: 1,
              padding: '14px',
              background: isLogin ? 'rgba(30, 41, 59, 0.7)' : 'transparent',
              border: 'none',
              borderBottom: isLogin ? '2px solid #3b82f6' : '2px solid transparent',
              color: isLogin ? '#f8fafc' : '#64748b',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(''); }}
            style={{
              flex: 1,
              padding: '14px',
              background: !isLogin ? 'rgba(30, 41, 59, 0.7)' : 'transparent',
              border: 'none',
              borderBottom: !isLogin ? '2px solid #3b82f6' : '2px solid transparent',
              color: !isLogin ? '#f8fafc' : '#64748b',
              fontWeight: 600,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Create Account
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: '13px',
                marginBottom: '16px',
              }}
            >
              <div style={{ marginBottom: '6px' }}>⚠️ {error}</div>
              <button
                type="button"
                onClick={handleGuestJoin}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#93c5fd',
                  textDecoration: 'underline',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                👉 Or click here to enter immediately as Guest
              </button>
            </div>
          )}

          {/* Identifier / Username */}
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {isLogin ? 'Username or Email' : 'Username'}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={isLogin ? 'e.g. alex or alex@team.com' : 'Choose a unique username'}
              maxLength={30}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f8fafc',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Email for Registration */}
          {!isLogin && (
            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Password */}
          <div style={{ marginBottom: !isLogin ? '14px' : '20px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '12px',
                fontWeight: 600,
                color: '#94a3b8',
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? 'Enter your password' : 'At least 6 characters'}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#f8fafc',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {isLogin && (
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b' }}>
                💡 Tip: If you don&apos;t have an account yet, one will be created automatically.
              </p>
            )}
          </div>

          {/* Avatar Color Picker (Registration only) */}
          {!isLogin && (
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#94a3b8',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Avatar Color
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: color,
                      border: selectedColor === color ? '3px solid #ffffff' : '2px solid transparent',
                      boxShadow: selectedColor === color ? `0 0 10px ${color}` : 'none',
                      cursor: 'pointer',
                      transition: 'transform 0.15s ease',
                      transform: selectedColor === color ? 'scale(1.15)' : 'scale(1)',
                      outline: 'none',
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              border: 'none',
              background: loading ? '#475569' : '#2563eb',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s ease',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
            }}
          >
            {loading ? 'Please wait...' : isLogin ? 'Sign In →' : 'Create Account & Enter →'}
          </button>

          {/* Divider */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              margin: '16px 0',
              color: '#64748b',
              fontSize: '12px',
            }}
          >
            <div style={{ flex: 1, height: '1px', background: '#334155' }} />
            <span style={{ padding: '0 10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>or</span>
            <div style={{ flex: 1, height: '1px', background: '#334155' }} />
          </div>

          {/* Quick Join as Guest */}
          <button
            type="button"
            onClick={handleGuestJoin}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '8px',
              border: '1px dashed #475569',
              background: 'rgba(30, 41, 59, 0.4)',
              color: '#94a3b8',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#60a5fa';
              e.currentTarget.style.color = '#f8fafc';
              e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#475569';
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.background = 'rgba(30, 41, 59, 0.4)';
            }}
          >
            <span>⚡</span>
            <span>Quick Join as Guest (No Password Required)</span>
          </button>
        </form>
      </div>

      {/* Footer Instructions */}
      <p style={{ color: '#64748b', fontSize: '12px', marginTop: '20px' }}>
        Move with <kbd style={{ background: '#1e293b', padding: '2px 6px', borderRadius: '4px', color: '#cbd5e1' }}>W A S D</kbd>
        {' '}or Arrow Keys · Spatial audio activates when avatars approach
      </p>
    </div>
  );
}
