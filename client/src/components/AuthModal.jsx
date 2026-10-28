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
          'Unable to reach the ProxiSpeak authentication gateway. Please check your network connection and retry.'
        );
      }

      let data = {};
      const responseText = await res.text();
      try {
        data = JSON.parse(responseText);
      } catch (_jsonErr) {
        if (!res.ok) {
          throw new Error(`Authentication server returned status ${res.status}. Please verify your credentials and retry.`);
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#141413]/65 backdrop-blur-md select-none overflow-y-auto animate-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <style>{`
        @keyframes modalOverlayFade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(12px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes formFadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-overlay {
          animation: modalOverlayFade 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-modal-card {
          animation: modalSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-form-pane {
          animation: formFadeIn 0.18s ease-out forwards;
        }
        /* Refined WebKit autofill styling to match natural input background */
        input:-webkit-autofill,
        input:-webkit-autofill:hover, 
        input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0px 1000px #F4F3EF inset !important;
          -webkit-text-fill-color: #1c1b1b !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>

      {/* Precision Studio Modal Container */}
      <div className="relative w-full max-w-4xl bg-[#FFFDF8] rounded-2xl border border-[#D9D7D0] shadow-[0_24px_70px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col md:flex-row my-auto animate-modal-card">
        {/* Minimalist Close Button - Flush with Corner */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full text-[#8C8880] hover:text-[#1c1b1b] hover:bg-[#F4F3EF] flex items-center justify-center transition-all cursor-pointer"
            title="Close modal (Esc)"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}

        {/* ── Left Column: Precision Spatial Audio Architecture ── */}
        <div className="w-full md:w-[44%] bg-[#151514] text-white p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden border-b md:border-b-0 md:border-r border-[#262624]">
          {/* Subtle Technical Blueprint Background Grid */}
          <div
            className="absolute inset-0 pointer-events-none opacity-25"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          {/* Top Brand & Status */}
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#FAF9F5] text-[#151514] flex items-center justify-center font-bold text-xs shadow-2xs">
                  <span className="material-symbols-outlined text-[16px]">graphic_eq</span>
                </div>
                <span className="font-sans text-sm font-semibold tracking-tight text-white">ProxiSpeak</span>
              </div>
              <span className="font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded bg-white/[0.06] text-[#A6A49F] border border-white/10">
                Core System
              </span>
            </div>

            <div className="font-mono text-[10px] text-[#8C8880] tracking-widest uppercase mb-1">
              ACOUSTIC DISPERSION ENGINE
            </div>
            <h3 className="text-xl font-semibold tracking-tight text-[#F5F4F0] leading-snug">
              Spatial Audio Architecture.
            </h3>
            <p className="text-xs text-[#8C8880] mt-1.5 leading-relaxed font-normal">
              Continuous 3D sound attenuation, physical partition damping, and peer-to-peer WebRTC mesh routing.
            </p>
          </div>

          {/* Center: Precision Architectural Acoustic Soundstage Diagram */}
          <div className="relative z-10 my-5">
            <div className="w-full rounded-xl bg-[#1B1B1A] border border-[#2B2B28] p-3 flex flex-col justify-between relative overflow-hidden">
              {/* Corner Registration Crosshairs */}
              <span className="absolute top-2 left-2 font-mono text-[10px] text-white/20 select-none">+</span>
              <span className="absolute top-2 right-2 font-mono text-[10px] text-white/20 select-none">+</span>
              <span className="absolute bottom-2 left-2 font-mono text-[10px] text-white/20 select-none">+</span>
              <span className="absolute bottom-2 right-2 font-mono text-[10px] text-white/20 select-none">+</span>

              {/* Header Telemetry */}
              <div className="flex items-center justify-between font-mono text-[9px] text-[#8C8880] px-2 pt-1">
                <span>POLAR DISPERSION // 360°</span>
                <span className="text-white/60">HRTF MIT-KEMAR</span>
              </div>

              {/* Precision Vector Acoustic Dispersion Diagram */}
              <div className="relative flex-1 flex items-center justify-center my-2">
                <svg
                  viewBox="0 0 280 120"
                  className="w-full h-full max-h-32 text-white/40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Grid Lines */}
                  <line x1="20" y1="60" x2="260" y2="60" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 3" opacity="0.3" />
                  <line x1="140" y1="10" x2="140" y2="110" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 3" opacity="0.3" />

                  {/* Isobar Sound Contours */}
                  <circle cx="140" cy="60" r="22" stroke="#FF4B2B" strokeWidth="1" opacity="0.8" />
                  <circle cx="140" cy="60" r="42" stroke="currentColor" strokeWidth="0.75" opacity="0.4" />
                  <circle cx="140" cy="60" r="64" stroke="currentColor" strokeWidth="0.75" strokeDasharray="3 3" opacity="0.25" />
                  <circle cx="140" cy="60" r="86" stroke="currentColor" strokeWidth="0.75" strokeDasharray="2 4" opacity="0.15" />

                  {/* Sound Wave Curves */}
                  <path
                    d="M 20 60 Q 80 20, 140 60 T 260 60"
                    stroke="#FF4B2B"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    opacity="0.85"
                  />
                  <path
                    d="M 20 60 Q 80 100, 140 60 T 260 60"
                    stroke="currentColor"
                    strokeWidth="0.75"
                    strokeDasharray="2 3"
                    opacity="0.3"
                  />

                  {/* Center Node */}
                  <circle cx="140" cy="60" r="3.5" fill="#FAF9F5" />
                  <circle cx="140" cy="60" r="7" stroke="#FAF9F5" strokeWidth="0.75" opacity="0.5" />

                  {/* Satellite Node Indicator */}
                  <circle cx="184" cy="38" r="3" fill="#38BDF8" />
                  <line x1="140" y1="60" x2="184" y2="38" stroke="#38BDF8" strokeWidth="0.75" strokeDasharray="2 2" opacity="0.6" />

                  {/* Technical Annotations */}
                  <text x="145" y="55" fill="#FAF9F5" fontSize="7" fontFamily="monospace" opacity="0.9">SOURCE [0,0]</text>
                  <text x="189" y="36" fill="#38BDF8" fontSize="7" fontFamily="monospace" opacity="0.9">PEER [x,y]</text>
                  <text x="25" y="55" fill="#8C8880" fontSize="6.5" fontFamily="monospace">-24dB</text>
                  <text x="235" y="55" fill="#8C8880" fontSize="6.5" fontFamily="monospace">-24dB</text>
                  <text x="143" y="105" fill="#8C8880" fontSize="6.5" fontFamily="monospace">r = 10m</text>
                </svg>
              </div>

              {/* Bottom Real-time Telemetry Bar */}
              <div className="flex items-center justify-between font-mono text-[9px] text-[#8C8880] px-2 pb-1 border-t border-white/[0.06] pt-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>MESH READY</span>
                </span>
                <span className="text-white/60">48kHz · 24-bit Opus</span>
              </div>
            </div>

            {defaultRoomName && (
              <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-[#1B1B1A] border border-[#2B2B28] text-[10px] font-mono text-[#A6A49F] flex items-center justify-between">
                <span className="text-[#8C8880] uppercase tracking-wider">TARGET ROOM</span>
                <span className="font-semibold text-white">{defaultRoomName}</span>
              </div>
            )}
          </div>

          {/* Bottom Specifications Bar */}
          <div className="relative z-10 pt-4 border-t border-[#262624] grid grid-cols-2 gap-3 font-mono text-[9px] text-[#8C8880]">
            <div>
              <span className="block text-white/40 tracking-wider">AUDIO ENGINE</span>
              <span className="text-[#E5E3DC] font-medium">BINAURAL HRTF</span>
            </div>
            <div>
              <span className="block text-white/40 tracking-wider">PROTOCOL</span>
              <span className="text-[#E5E3DC] font-medium">WEBRTC UDP &lt;30ms</span>
            </div>
          </div>
        </div>

        {/* ── Right Column: Clean, Focused Authentication Console ── */}
        <div className="w-full md:w-[56%] p-6 sm:p-9 flex flex-col justify-between bg-[#FFFDF8]">
          <div className="w-full">
            {/* Header: Clean & Focused Title */}
            <div className="mb-5 pr-8">
              <h2 className="font-sans text-2xl font-bold tracking-tight text-[#1c1b1b]">
                {isLogin ? 'Sign In' : 'Create Account'}
              </h2>
              <p className="text-xs text-[#5e5f5c] mt-1">
                {isLogin
                  ? 'Enter your credentials to access your spatial workspace.'
                  : 'Set up your profile to start hosting spatial meetings.'}
              </p>
            </div>

            {/* Seamless Segmented Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#F4F3EF] rounded-xl border border-[#D9D7D0] mb-5">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setError('');
                  setSuggestSwitch(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
                  isLogin
                    ? 'bg-white text-[#1c1b1b] shadow-2xs border border-[#D9D7D0]/60'
                    : 'text-[#8C8880] hover:text-[#1c1b1b]'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">login</span>
                <span>Sign In</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setError('');
                  setSuggestSwitch(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
                  !isLogin
                    ? 'bg-white text-[#1c1b1b] shadow-2xs border border-[#D9D7D0]/60'
                    : 'text-[#8C8880] hover:text-[#1c1b1b]'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">person_add</span>
                <span>Register</span>
              </button>
            </div>

            {/* Error / Smart Suggestion Banner */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-xs">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[16px] text-rose-600 mt-0.5">warning</span>
                  <div className="flex-1 leading-relaxed">
                    <span className="font-medium">{error}</span>
                    {suggestSwitch === 'register' && (
                      <button
                        type="button"
                        onClick={handleSwitchToRegister}
                        className="mt-1 block font-semibold text-[#FF4B2B] hover:underline cursor-pointer"
                      >
                        Account not found. Click here to register with this email
                      </button>
                    )}
                    {suggestSwitch === 'login' && (
                      <button
                        type="button"
                        onClick={handleSwitchToLogin}
                        className="mt-1 block font-semibold text-[#FF4B2B] hover:underline cursor-pointer"
                      >
                        Email already registered. Click here to sign in instead
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Input Form with Subtle Transition */}
            <form onSubmit={handleSubmit} className="space-y-3.5 animate-form-pane">
              {isLogin ? (
                /* ── Login Form ── */
                <div>
                  <label className="block text-xs font-medium text-[#5e5f5c] mb-1.5">
                    Email address or username
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
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#1c1b1b] focus:border-[#1c1b1b] transition-all font-sans"
                    />
                  </div>
                </div>
              ) : (
                /* ── Registration Form ── */
                <>
                  <div>
                    <label className="block text-xs font-medium text-[#5e5f5c] mb-1.5">
                      Display name
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
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#1c1b1b] focus:border-[#1c1b1b] transition-all font-sans"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#5e5f5c] mb-1.5">
                      Email address
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
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#1c1b1b] focus:border-[#1c1b1b] transition-all font-sans"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#5e5f5c]">
                    Password
                  </label>
                  {!isLogin && (
                    <span className="text-[11px] text-[#8C8880]">6+ characters</span>
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
                    placeholder={isLogin ? 'Enter your password' : 'Create a secure password'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#F4F3EF] border border-[#D9D7D0] text-sm text-[#1c1b1b] placeholder:text-[#BDBAB2] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#1c1b1b] focus:border-[#1c1b1b] transition-all font-sans"
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
                  <label className="block text-xs font-medium text-[#5e5f5c] mb-2">
                    Spatial avatar color
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
                              ? 'ring-2 ring-offset-2 ring-[#1c1b1b]'
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
                  className="w-full py-2.5 rounded-xl bg-[#1c1b1b] hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all duration-150 shadow-sm cursor-pointer disabled:opacity-50 active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                      <span>Verifying Session...</span>
                    </>
                  ) : (
                    <>
                      <span>{isLogin ? 'Sign In to Workspace' : 'Create Account & Enter'}</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Clean Understated Footer Link */}
          <div className="mt-6 pt-4 border-t border-[#D9D7D0]/60 text-center text-xs text-[#5e5f5c]">
            {isLogin ? (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={handleSwitchToRegister}
                  className="font-semibold text-[#1c1b1b] hover:text-[#FF4B2B] hover:underline cursor-pointer transition-colors"
                >
                  Create one now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={handleSwitchToLogin}
                  className="font-semibold text-[#1c1b1b] hover:text-[#FF4B2B] hover:underline cursor-pointer transition-colors"
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
