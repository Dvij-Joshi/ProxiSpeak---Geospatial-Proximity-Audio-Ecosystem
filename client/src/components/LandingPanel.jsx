import React from 'react';
import ProxiLogo from './ProxiLogo';
import { Play } from 'lucide-react';
import '../styles/LandingPanel.css';

import social1 from '../assets/social_1.png';
import social2 from '../assets/social_2.png';
import social3 from '../assets/social_3.png';
import social4 from '../assets/social_4.png';
import landingOfficeExact from '../assets/landing_office_exact.png';

export default function LandingPanel({ onGetStarted, onOpenMeeting }) {
  return (
    <div className="landing-card">
      {/* Header */}
      <header className="landing-header">
        <ProxiLogo size={16} fontSize={13} />

        <nav className="landing-nav">
          <span className="landing-nav-link">The office</span>
          <span className="landing-nav-link">How it works</span>
          <span className="landing-nav-link">For teams</span>
          <span className="landing-nav-link">About</span>
        </nav>

        <div className="landing-auth">
          <span className="landing-signin" onClick={onGetStarted}>Sign in</span>
          <button className="landing-btn-dark" onClick={onGetStarted}>
            Get started
          </button>
        </div>
      </header>

      {/* Main Hero Area */}
      <div className="landing-body">
        {/* Left Content */}
        <div className="landing-content-left">
          <h1 className="landing-title">
            A little more room<br />for a quick hello.
          </h1>
          <p className="landing-desc">
            See who’s around, then walk over when you have a minute. No calendar invite needed.
          </p>

          <div className="landing-cta-row">
            <button className="landing-cta-primary" onClick={onGetStarted}>
              Step into the office
            </button>
            <button className="landing-cta-secondary" onClick={onOpenMeeting || onGetStarted}>
              <Play size={10} fill="#111827" strokeWidth={0} />
              <span>Preview a call</span>
            </button>
          </div>

          <div className="landing-social-proof">
            <div className="landing-avatar-stack">
              <img src={social1} alt="Remote user" />
              <img src={social2} alt="Remote user" />
              <img src={social3} alt="Remote user" />
              <img src={social4} alt="Remote user" />
            </div>
            <div className="landing-social-text">
              <span className="landing-social-title">Your team, around the corner</span>
              <span className="landing-social-note">Drop in when it feels natural.</span>
            </div>
          </div>
        </div>

        {/* Right Illustration */}
        <div className="landing-graphic-right">
          <img
            src={landingOfficeExact}
            alt="Virtual office preview"
            className="landing-office-img"
          />
        </div>
      </div>
    </div>
  );
}
