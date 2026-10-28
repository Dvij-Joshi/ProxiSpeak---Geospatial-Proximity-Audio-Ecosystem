import { useState, useEffect } from 'react';
import { SERVER_URL, AVATAR_COLORS } from '../config';

export default function AuthModal({ onAuthSuccess, onClose, defaultRoomName }) {
  const [isLogin, setIsLogin] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedColor, setSelectedColor] = useState(AVATAR_COLORS[2]); // Amber default
  const [error, setError] = useState('');
  const [suggestSwitch, setSuggestSwitch] = useState(null);
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

  // Quick Guest Join
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
        setError('Please enter your email or username and password.');
        return;
      }
    } else {
      if (!username.trim() || username.trim().length < 2) {
        setError('Display name must be at least 2 characters long.');
        return;
      }
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid work or personal email address.');
        return;
      }
      if (!password || password.length < 6) {
        setError('Password must contain at least 6 characters.');
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
          'Unable to reach the ProxiSpeak authentication gateway. Please check your network or enter via Guest Session.'
        );
      }

      let data = {};
      const responseText = await res.text();
      try {
        data = JSON.parse(responseText);
      } catch (_jsonErr) {
        if (!res.ok) {
          throw new Error(`Authentication server returned status ${res.status}. Please retry or continue as Guest.`);
        }
        throw new Error('Unexpected authentication response format.');
      }

      if (!res.ok) {
        const errorMsg = data.error || 'Authentication failed. Please verify your credentials.';

        if (
          isLogin &&
          (res.status === 404 ||
            errorMsg.toLowerCase().includes('not found') ||
            errorMsg.toLowerCase().includes('no account'))
        ) {
          setSuggestSwitch('register');
        }

        if (
          !isLogin &&
          (errorMsg.toLowerCase().includes('already registered') ||
            errorMsg.toLowerCase().includes('already taken'))
        ) {
          setSuggestSwitch('login');
        }

        throw new Error(errorMsg);
      }

      if (data.token && data.user) {
        localStorage.setItem('proxispeak_token', data.token);
        localStorage.setItem('proxispeak_user', JSON.stringify(data.user));
        onAuthSuccess(data.user);
      } else {
        throw new Error('Authentication session token was missing from response.');
      }
    } catch (err) {
      setError(err.message || 'Authentication error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#141413]/60 backdrop-blur-md transition-all select-none overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <style>{`
        @keyframes radarSweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes subtlePulse {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50% { transform: scale(1.08); opacity: 0.6; }
        }
        .radar-line {
          transform-origin: center center;
          animation: radarSweep 6s linear infinite;
        }
      `}</style>

      {/* Dual-Panel Architectural Studio Modal */}
      <div className="relative w-full max-w-4xl bg-[#FFFDF8] rounded-2xl sm:rounded-3xl border border-[#D9D7D0] shadow-[0_32px_90px_rgba(20,20,19,0.35)] overflow-hidden flex flex-col md:flex-row my-auto">
        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-white/80 hover:bg-white text-[#5e5f5c] hover:text-[#1c1b1b] flex items-center justify-center transition-all cursor-pointer border border-[#D9D7D0] shadow-xs"
            title="Close modal (Esc)"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}

        {/* ── Left Column: Spatial Audio Engineering Showcase (Desktop) ── */}
        <div className="w-full md:w-[42%] bg-[#1c1b1b] text-white p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden border-b md:border-b-0 md:border-r border-[#333230]">
          {/* Background Ambient Gradient */}
          <div className="absolute -top-24 -left-24 w-72 h-72 bg-[#FF4B2B]/15 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-72 h-72 bg-[#3b82f6]/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Brand & Status Header */}
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#FAF9F5] flex items-center justify-center text-[#1c1b1b]">
                  <span className="material-symbols-outlined text-[16px]">graphic_eq</span>
                </div>
                <span className="font-h3 text-base font-bold tracking-tight text-white">ProxiSpeak</span>
              </div>
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-0.5 rounded bg-white/10 text-white/70 border border-white/10">
                Studio Node
              </span>
            </div>

            <div className="font-mono text-[10px] text-[#BDBAB2] uppercase tracking-[0.18em] mb-1">
              [01 // SPATIAL ARCHITECTURE]
            </div>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug">
              Physical Proximity Acoustics.
            </h3>
            <p className="text-xs text-[#8C8880] mt-1.5 leading-relaxed font-normal">
              Continuous 3D sound attenuation, physical partition damping, and high-fidelity WebRTC mesh.
            </p>
          </div>

          {/* Center: Interactive Acoustic Radar Visualizer */}
          <div className="relative z-10 my-6 flex flex-col items-center justify-center">
            <div className="relative w-44 h-44 rounded-full border border-white/10 flex items-center justify-center">
              {/* Outer Acoustic Boundary Ring */}
              <div
                className="absolute inset-2 rounded-full border border-[#FF4B2B]/20"
                style={{ animation: 'subtlePulse 3s ease-in-out infinite' }}
              />
              {/* Mid Boundary Ring */}
              <div className="absolute inset-8 rounded-full border border-white/15" />
              {/* Inner Focus Ring */}
              <div className="absolute inset-14 rounded-full border border-white/25" />

              {/* Crosshair Grid Hairlines */}
              <div className="absolute inset-x-0 top-1/2 h-[1px] bg-white/10" />
              <div className="absolute inset-y-0 left-1/2 w-[1px] bg-white/10" />

              {/* Radar Sweep Needle */}
              <div className="absolute inset-0 radar-line">
                <div className="w-1/2 h-[1px] bg-gradient-to-r from-transparent to-[#FF4B2B]" />
              </div>

              {/* Central Audio Core */}
              <div className="relative w-9 h-9 rounded-full bg-[#FAF9F5] text-[#1c1b1b] flex items-center justify-center shadow-[0_0_20px_rgba(255,75,43,0.35)] z-10">
                <span className="material-symbols-outlined text-[18px]">volume_up</span>
              </div>

              {/* Satellite User Nodes */}
              <div className="absolute top-8 right-10 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-75" />
              <div className="absolute top-8 right-10 w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <div className="absolute bottom-9 left-11 w-2 h-2 rounded-full bg-[#FF4B2B]" />
            </div>

            {defaultRoomName && (
              <div className="mt-3 px-3 py-1 rounded-md bg-white/5 border border-white/10 text-[10px] font-mono text-[#BDBAB2] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF4B2B] animate-pulse" />
                <span>TARGET: {defaultRoomName.toUpperCase()}</span>
              </div>
            )}
          </div>

          {/* Bottom Specifications Bar */}
          <div className="relative z-10 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 font-mono text-[9px] text-[#8C8880]">
            <div>
              <span className="block text-white/50 tracking-wider">AUDIO ENGINE</span>
              <span className="text-white font-medium">48kHz · HRTF PANNER</span>
            </div>
            <div>
              <span className="block text-white/50 tracking-wider">MEDIA PROTOCOL</span>
              <span className="text-emerald-400 font-medium">WEBRTC UDP &lt;30ms</span>
            </div>
          </div>
        </div>

        {/* ── Right Column: Precision Authentication Gateway ── */}
        <div className="w-full md:w-[58%] p-6 sm:p-10 flex flex-col justify-between bg-[#FFFDF8]">
          <div>
            {/* Header / Mode Indicator */}
            <div className="flex items-center justify-between mb-5">
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#8C8880] uppercase">
                {isLogin ? 'SESSION ACCESS // 01' : 'NEW REGISTRATION // 02'}
              </span>
              <span className="font-mono text-[9px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                SECURE AUTH
              </span>
            </div>

            <h2 className="font-h2 text-2xl font-bold tracking-tight text-[#1c1b1b] mb-1">
              {isLogin ? 'Sign In to Workspace' : 'Create Spatial Profile'}
            </h2>
            <p className="text-xs text-[#5e5f5c] mb-6">
              {isLogin
                ? 'Enter your account credentials to access spatial audio suites.'
                : 'Configure your profile name, email, and spatial identity swatch.'}
            </p>

            {/* Architectural Segmented Tab Bar */}
            <div className="grid grid-cols-2 p-1 bg-[#F4F3EF] rounded-xl border border-[#D9D7D0] mb-6">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setError('');
                  setSuggestSwitch(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  isLogin
                    ? 'bg-white text-[#1c1b1b] shadow-xs border border-[#D9D7D0]/60'
                    : 'text-[#8C8880] hover:text-[#1c1b1b]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">login</span>
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setError('');
                  setSuggestSwitch(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  !isLogin
                    ? 'bg-white text-[#1c1b1b] shadow-xs border border-[#D9D7D0]/60'
                    : 'text-[#8C8880] hover:text-[#1c1b1b]'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">person_add</span>
                <span>Create Account</span>
              </button>
            </div>

            {/* Error / Smart Handoff Notice */}
            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs">
                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[16px] text-rose-600 mt-0.5">warning</span>
                  <div className="flex-1 leading-relaxed">
                    <span className="font-medium">{error}</span>
                    {suggestSwitch === 'register' && (
                      <button
                        type="button"
                        onClick={handleSwitchToRegister}
                        className="mt-1.5 block font-semibold text-[#FF4B2B] hover:underline cursor-pointer"
                      >
                        Account not found. Click here to register with this email →
                      </button>
                    )}
                    {suggestSwitch === 'login' && (
                      <button
                        type="button"
                        onClick={handleSwitchToLogin}
                        className="mt-1.5 block font-semibold text-[#FF4B2B] hover:underline cursor-pointer"
                      >
                        Email already registered. Click here to sign in instead →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isLogin ? (
                /* ── Login Form ── */
                <div>
                  <label className="block font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase mb-1.5">
                    Email Address or Username
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C8880] text-[18px]">
                      alternate_email
                    </span>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="alex@company.com or username"
                      autoComplete="username"
                      required
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all font-sans"
                    />
                  </div>
                </div>
              ) : (
                /* ── Registration Form ── */
                <>
                  <div>
                    <label className="block font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase mb-1.5">
                      Full Name / Display Name
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C8880] text-[18px]">
                        person
                      </span>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Alex Rivera"
                        autoComplete="name"
                        maxLength={30}
                        required
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all font-sans"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase mb-1.5">
                      Work / Personal Email
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C8880] text-[18px]">
                        mail
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex@company.com"
                        autoComplete="email"
                        required
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all font-sans"
                      />
                    </div>
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
                    <span className="font-mono text-[9px] text-[#8C8880]">6+ characters</span>
                  )}
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8C8880] text-[18px]">
                    lock
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isLogin ? 'Enter password' : 'Create secure password'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#1c1b1b] transition-all font-sans"
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

              {/* Avatar Swatch Selection (Register only) */}
              {!isLogin && (
                <div>
                  <label className="block font-mono text-[10px] font-semibold text-[#5e5f5c] tracking-wider uppercase mb-2">
                    Spatial Avatar Swatch
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
                          className={`w-6 h-6 rounded-full transition-all cursor-pointer flex items-center justify-center ${
                            isSelected
                              ? 'scale-125 ring-2 ring-offset-2 ring-[#1c1b1b]'
                              : 'opacity-75 hover:opacity-100'
                          }`}
                        >
                          {isSelected && (
                            <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>
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
                  className="w-full py-3 rounded-xl bg-[#1c1b1b] hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      <span>Verifying Session...</span>
                    </>
                  ) : (
                    <>
                      <span>{isLogin ? 'Sign In to Workspace' : 'Register Profile & Enter'}</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Bottom Secondary Actions */}
          <div className="mt-6 pt-4 border-t border-[#D9D7D0]">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleGuestJoin}
                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-[#D9D7D0] hover:bg-[#F4F3EF] hover:border-[#1c1b1b] text-[#1c1b1b] text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px] text-[#FF4B2B]">bolt</span>
                <span>Instant Guest Pass</span>
              </button>

              <span className="font-mono text-[9px] text-[#8C8880] uppercase tracking-wider text-center sm:text-right">
                HRTF Engine · 0% TURN API
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
