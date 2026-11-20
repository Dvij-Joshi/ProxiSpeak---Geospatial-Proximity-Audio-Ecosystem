import { useState, useEffect } from 'react';
import { SERVER_URL, AVATAR_COLORS } from '../config';
import { WorkspaceArt, AvatarPortrait } from './WorkspaceArt';

export default function AuthModal({ onAuthSuccess, onClose, defaultRoomName }) {
  const [isLogin, setIsLogin] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
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
      if (!firstName && !lastName) {
        const raw = identifier.split('@')[0];
        const parts = raw.split(/[._-]/);
        setFirstName(parts[0] || '');
        setLastName(parts[1] || '');
      }
    } else {
      const parts = identifier.trim().split(/\s+/);
      setFirstName(parts[0] || '');
      setLastName(parts.slice(1).join(' ') || '');
    }
  };

  const handleSwitchToLogin = () => {
    setIsLogin(true);
    setError('');
    setSuggestSwitch(null);
    if (email) {
      setIdentifier(email.trim());
    } else if (firstName || lastName) {
      setIdentifier(`${firstName.trim()} ${lastName.trim()}`.trim());
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
      if (!firstName.trim()) {
        setError('Please enter your first name.');
        return;
      }
      if (!lastName.trim()) {
        setError('Please enter your surname / last name.');
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
            username: `${firstName.trim()} ${lastName.trim()}`,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            password,
            avatarColor: selectedColor || '#bd5137',
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#203334]/65 backdrop-blur-md select-none overflow-y-auto animate-overlay"
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
          -webkit-box-shadow: 0 0 0px 1000px #eae4cc inset !important;
          -webkit-text-fill-color: #203334 !important;
          transition: background-color 5000s ease-in-out 0s;
        }
      `}</style>

      {/* Precision Studio Modal Container */}
      <div className="relative w-full max-w-4xl bg-[#fff9e9] rounded-lg border border-[#849388] shadow-[0_24px_70px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col md:flex-row my-auto animate-modal-card">
        {/* Minimalist Close Button - Flush with Corner */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full text-[#55675e] hover:text-[#203334] hover:bg-[#eae4cc] flex items-center justify-center transition-all cursor-pointer"
            title="Close modal (Esc)"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}

        <div className="auth-poster">
          <strong>ProxiSpeak</strong>
          <WorkspaceArt theme="office" />
          <p>{defaultRoomName || 'Spatial workspaces'}</p>
        </div>

        <div className="w-full md:w-[56%] p-6 sm:p-9 flex flex-col justify-between bg-[#fff9e9]">
          <div className="w-full">
            {/* Header: Clean & Focused Title */}
            <div className="mb-5 pr-8">
              <h2 className="font-sans text-2xl font-bold tracking-tight text-[#203334]">
                {isLogin ? 'Sign In' : 'Create Account'}
              </h2>
              <p className="text-xs text-[#475950] mt-1">
                {isLogin
                  ? 'Enter your credentials to access your spatial workspace.'
                  : 'Set up your profile to start hosting spatial meetings.'}
              </p>
            </div>

            {/* Seamless Segmented Mode Switcher */}
            <div className="grid grid-cols-2 p-1 bg-[#eae4cc] rounded-xl border border-[#849388] mb-5">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setError('');
                  setSuggestSwitch(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all duration-150 cursor-pointer flex items-center justify-center gap-1.5 ${
                  isLogin
                    ? 'bg-white text-[#203334] shadow-2xs border border-[#849388]/60'
                    : 'text-[#55675e] hover:text-[#203334]'
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
                    ? 'bg-white text-[#203334] shadow-2xs border border-[#849388]/60'
                    : 'text-[#55675e] hover:text-[#203334]'
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
                        className="mt-1 block font-semibold text-[#bd5137] hover:underline cursor-pointer"
                      >
                        Account not found. Click here to register with this email
                      </button>
                    )}
                    {suggestSwitch === 'login' && (
                      <button
                        type="button"
                        onClick={handleSwitchToLogin}
                        className="mt-1 block font-semibold text-[#bd5137] hover:underline cursor-pointer"
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
                  <label className="block text-xs font-medium text-[#475950] mb-1.5">
                    Email address or username
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#55675e] text-[18px]">
                      alternate_email
                    </span>
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="alex@company.com or username"
                      autoComplete="username"
                      required
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#eae4cc] border border-[#849388] text-sm text-[#203334] placeholder:text-[#9da698] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#203334] focus:border-[#203334] transition-all font-sans"
                    />
                  </div>
                </div>
              ) : (
                /* ── Registration Form ── */
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-medium text-[#475950] mb-1.5">
                        First name
                      </label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#55675e] text-[17px]">
                          badge
                        </span>
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Dvij"
                          autoComplete="given-name"
                          required
                          className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#eae4cc] border border-[#849388] text-sm text-[#203334] placeholder:text-[#9da698] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#203334] focus:border-[#203334] transition-all font-sans"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#475950] mb-1.5">
                        Surname
                      </label>
                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#55675e] text-[17px]">
                          person
                        </span>
                        <input
                          type="text"
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Joshi"
                          autoComplete="family-name"
                          required
                          className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#eae4cc] border border-[#849388] text-sm text-[#203334] placeholder:text-[#9da698] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#203334] focus:border-[#203334] transition-all font-sans"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Live Avatar Initials Box Preview */}
                  <div className="p-3 rounded-xl bg-[#eae4cc] border border-[#9bab99] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12"><AvatarPortrait color={selectedColor} name={username} /></div>
                      <div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-[#55675e] font-semibold">
                          Office avatar
                        </div>
                        <div className="text-xs font-semibold text-[#203334]">
                          {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Your Name'}
                        </div>
                      </div>
                    </div>

                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#475950] mb-1.5">
                      Email address
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#55675e] text-[18px]">
                        mail
                      </span>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex@company.com"
                        autoComplete="email"
                        required
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#eae4cc] border border-[#849388] text-sm text-[#203334] placeholder:text-[#9da698] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#203334] focus:border-[#203334] transition-all font-sans"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-[#475950]">
                    Password
                  </label>
                  {!isLogin && (
                    <span className="text-[11px] text-[#55675e]">6+ characters</span>
                  )}
                </div>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#55675e] text-[18px]">
                    lock
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isLogin ? 'Enter your password' : 'Create a secure password'}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[#eae4cc] border border-[#849388] text-sm text-[#203334] placeholder:text-[#9da698] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#203334] focus:border-[#203334] transition-all font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#55675e] hover:text-[#203334] transition-colors cursor-pointer"
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
                  <label className="block text-xs font-medium text-[#475950] mb-2">
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
                          aria-label={`Use avatar color ${col}`}
                          aria-pressed={isSelected}
                          style={{ backgroundColor: col }}
                          className={`w-6 h-6 rounded-full transition-all cursor-pointer flex items-center justify-center ${
                            isSelected
                              ? 'ring-2 ring-offset-2 ring-[#203334]'
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
                  className="w-full py-2.5 rounded-xl bg-[#203334] hover:bg-black text-white text-xs font-bold uppercase tracking-wider transition-all duration-150 shadow-sm cursor-pointer disabled:opacity-50 active:scale-[0.99] flex items-center justify-center gap-2"
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
          <div className="mt-6 pt-4 border-t border-[#849388]/60 text-center text-xs text-[#475950]">
            {isLogin ? (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={handleSwitchToRegister}
                  className="font-semibold text-[#203334] hover:text-[#bd5137] hover:underline cursor-pointer transition-colors"
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
                  className="font-semibold text-[#203334] hover:text-[#bd5137] hover:underline cursor-pointer transition-colors"
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
