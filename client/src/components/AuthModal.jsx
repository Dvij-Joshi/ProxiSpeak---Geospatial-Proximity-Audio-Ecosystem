import { useState, useEffect } from 'react';
import { SERVER_URL, AVATAR_COLORS } from '../config';

export default function AuthModal({ onAuthSuccess, onClose, defaultRoomName }) {
  const [isLogin, setIsLogin] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[0]);
  const [error, setError] = useState('');
  const [suggestSwitch, setSuggestSwitch] = useState(null); // 'register' | 'login'
  const [loading, setLoading] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Quick Guest Join fallback
  const handleGuestJoin = (e) => {
    if (e) e.preventDefault();
    const fallbackName = identifier.trim() || username.trim() || 'Guest-' + Math.floor(1000 + Math.random() * 9000);
    const guestUser = {
      userId: 'guest-' + Math.random().toString(36).substring(2, 9),
      username: fallbackName,
      email: `${fallbackName.toLowerCase().replace(/[^a-z0-9]/g, '')}@guest.local`,
      avatarColor: selectedColor || '#FF4B2B',
      isGuest: true,
    };
    const guestToken = 'guest-token-' + Date.now();
    localStorage.setItem('proxispeak_token', guestToken);
    localStorage.setItem('proxispeak_user', JSON.stringify(guestUser));
    onAuthSuccess(guestUser);
  };

  const handleSwitchToRegister = () => {
    setIsLogin(false);
    setError('');
    setSuggestSwitch(null);
    if (identifier.includes('@')) {
      setEmail(identifier.trim());
      if (!username) {
        setUsername(identifier.split('@')[0]);
      }
    } else {
      setUsername(identifier.trim());
    }
  };

  const handleSwitchToLogin = () => {
    setIsLogin(true);
    setError('');
    setSuggestSwitch(null);
    if (email) {
      setIdentifier(email.trim());
    } else if (username) {
      setIdentifier(username.trim());
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuggestSwitch(null);

    if (isLogin) {
      if (!identifier.trim() || !password) {
        setError('Please enter your username or email address and password.');
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
        ? { identifier: identifier.trim(), password }
        : {
            username: username.trim(),
            email: email.trim().toLowerCase(),
            password,
            avatarColor: selectedColor || '#FF4B2B',
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
        throw new Error(
          `Unable to reach authentication server. Please check your internet connection or join immediately as a Guest.`
        );
      }

      let data = {};
      const responseText = await res.text();
      try {
        data = JSON.parse(responseText);
      } catch (_jsonErr) {
        console.warn('[AuthModal] Non-JSON server response:', responseText.slice(0, 120));
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}. Please try again or join as Guest.`);
        }
        throw new Error('Unexpected server response format.');
      }

      if (!res.ok) {
        const errorMsg = data.error || 'Authentication failed. Please verify your credentials.';

        // Smart Suggestion: Account does not exist on login
        if (isLogin && (res.status === 404 || errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('no account'))) {
          setSuggestSwitch('register');
        }

        // Smart Suggestion: Email already registered on register
        if (!isLogin && (errorMsg.toLowerCase().includes('already registered') || errorMsg.toLowerCase().includes('already taken'))) {
          setSuggestSwitch('login');
        }

        throw new Error(errorMsg);
      }

      // Persist auth token and user profile
      if (data.token && data.user) {
        localStorage.setItem('proxispeak_token', data.token);
        localStorage.setItem('proxispeak_user', JSON.stringify(data.user));
        onAuthSuccess(data.user);
      } else {
        throw new Error('Invalid response structure received from authentication server.');
      }
    } catch (err) {
      setError(err.message || 'Authentication error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-[#1c1b1b]/50 backdrop-blur-md transition-all select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <style>{`
        @keyframes soundwaveAuth {
          0%, 100% { transform: scaleY(0.3); opacity: 0.4; }
          50% { transform: scaleY(1); opacity: 1; }
        }
        .auth-bar {
          display: inline-block;
          width: 3px;
          height: 18px;
          background-color: #1c1b1b;
          border-radius: 9999px;
          animation: soundwaveAuth 1.1s ease-in-out infinite;
        }
      `}</style>

      {/* Main Architectural Modal Card */}
      <div className="relative w-full max-w-[420px] bg-white rounded-3xl border border-[#D9D7D0] shadow-[0_24px_60px_-15px_rgba(28,27,27,0.22)] p-6 sm:p-8 overflow-hidden">
        {/* Subtle Architectural Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#FF4B2B] via-[#1c1b1b] to-[#FF4B2B]" />

        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#F4F3EF] hover:bg-[#EAE8E2] text-[#8C8880] hover:text-[#1c1b1b] flex items-center justify-center transition-all cursor-pointer border border-[#EAE8E2]"
            title="Close dialog (Esc)"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}

        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF9F5] border border-[#D9D7D0] flex items-center justify-center gap-[3px] mb-3 shadow-xs">
            <span className="auth-bar" style={{ animationDelay: '0s' }} />
            <span className="auth-bar" style={{ animationDelay: '0.2s', backgroundColor: '#FF4B2B' }} />
            <span className="auth-bar" style={{ animationDelay: '0.4s' }} />
            <span className="auth-bar" style={{ animationDelay: '0.15s' }} />
          </div>

          <div className="font-mono text-[10px] font-semibold tracking-[0.25em] text-[#8C8880] uppercase mb-1">
            ProxiSpeak · Spatial Network
          </div>
          <h2 className="text-xl font-bold tracking-tight text-[#1c1b1b]">
            {isLogin ? 'Welcome Back' : 'Create Spatial Profile'}
          </h2>
          <p className="text-xs text-[#8C8880] mt-1 max-w-[280px]">
            {isLogin
              ? 'Sign in to access your proximity audio workspaces & team rooms.'
              : 'Register to unlock persistent spatial avatar credentials & private suites.'}
          </p>

          {defaultRoomName && (
            <div className="mt-3 px-3 py-1 rounded-full bg-[#FAF9F5] border border-[#D9D7D0] text-[11px] font-mono text-[#5e5f5c] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4B2B] animate-pulse" />
              <span>Invited to: <strong>{defaultRoomName}</strong></span>
            </div>
          )}
        </div>

        {/* Segmented Tab Pill Control */}
        <div className="bg-[#F4F3EF] p-1 rounded-xl flex items-center mb-6 border border-[#EAE8E2]">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setError('');
              setSuggestSwitch(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
              isLogin
                ? 'bg-white text-[#1c1b1b] shadow-xs'
                : 'text-[#8C8880] hover:text-[#1c1b1b]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setError('');
              setSuggestSwitch(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer text-center ${
              !isLogin
                ? 'bg-white text-[#1c1b1b] shadow-xs'
                : 'text-[#8C8880] hover:text-[#1c1b1b]'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error / Smart Feedback Banner */}
        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-[16px] text-rose-600 mt-0.5">error</span>
              <div className="flex-1 leading-relaxed">
                <span>{error}</span>
                {suggestSwitch === 'register' && (
                  <button
                    type="button"
                    onClick={handleSwitchToRegister}
                    className="mt-1.5 block font-semibold text-[#FF4B2B] hover:underline cursor-pointer"
                  >
                    Don&apos;t have an account yet? Click here to register with this email →
                  </button>
                )}
                {suggestSwitch === 'login' && (
                  <button
                    type="button"
                    onClick={handleSwitchToLogin}
                    className="mt-1.5 block font-semibold text-[#FF4B2B] hover:underline cursor-pointer"
                  >
                    Already registered? Click here to sign in instead →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Form Inputs */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isLogin ? (
            /* Sign In Fields */
            <div>
              <label className="block font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase mb-1.5">
                Username or Email
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="e.g. alex or alex@team.com"
                  autoComplete="username"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all"
                />
              </div>
            </div>
          ) : (
            /* Registration Fields */
            <>
              <div>
                <label className="block font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase mb-1.5">
                  Display / Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  autoComplete="name"
                  maxLength={30}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all"
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@team.com"
                  autoComplete="email"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all"
                />
              </div>
            </>
          )}

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase">
                Password
              </label>
              {!isLogin && (
                <span className="text-[10px] text-[#8C8880]">Min. 6 characters</span>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isLogin ? 'Enter your password' : 'Create a secure password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C8880] hover:text-[#1c1b1b] transition-colors cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Avatar Color Swatches (Registration only) */}
          {!isLogin && (
            <div>
              <label className="block font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase mb-2">
                Spatial Avatar Badge Color
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {AVATAR_COLORS.map((col) => {
                  const isSelected = selectedColor === col;
                  return (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setSelectedColor(col)}
                      style={{ backgroundColor: col }}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        isSelected ? 'scale-110 ring-2 ring-offset-2 ring-[#1c1b1b]' : 'opacity-85 hover:opacity-100 hover:scale-105'
                      }`}
                    >
                      {isSelected && (
                        <span className="material-symbols-outlined text-white text-[14px] font-bold">check</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#1c1b1b] hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="relative my-5 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#EAE8E2]" />
          </div>
          <span className="relative bg-white px-3 font-mono text-[9px] uppercase tracking-widest text-[#BDBAB2]">
            or
          </span>
        </div>

        {/* Guest Join Quick Action */}
        <button
          type="button"
          onClick={handleGuestJoin}
          className="w-full py-2.5 rounded-xl border border-[#D9D7D0] hover:bg-[#F4F3EF] hover:border-[#BDBAB2] text-[#1c1b1b] text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px] text-[#FF4B2B]">bolt</span>
          <span>Quick Join as Guest (Instant Access)</span>
        </button>

        {/* Security & Architectural Note */}
        <div className="mt-5 pt-3 border-t border-[#EAE8E2] text-center">
          <span className="font-mono text-[9px] tracking-wider text-[#BDBAB2] uppercase">
            End-to-End Encrypted Session · ProxiSpeak Auth v2.1
          </span>
        </div>
      </div>
    </div>
  );
}
