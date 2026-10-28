import React from 'react';
import LandingPanel from './LandingPanel';
import OfficePanel from './OfficePanel';
import MeetingPanel from './MeetingPanel';
import NearbyPanel from './NearbyPanel';
import ProfilePanel from './ProfilePanel';

export default function CompositeView({
  userPos,
  onUserPositionChange,
  onNavigateTab,
  onOpenMeeting,
  onThemeChange
}) {
  return (
    <div className="composite-wrapper">
      {/* Top Row: Landing Page + Main Virtual Office */}
      <div className="composite-row-top">
        <div className="card-shell">
          <LandingPanel
            onGetStarted={() => onNavigateTab('Office')}
            onOpenMeeting={onOpenMeeting}
          />
        </div>

        <div className="card-shell">
          <OfficePanel
            userPos={userPos}
            onUserPositionChange={onUserPositionChange}
            onNavigateTab={onNavigateTab}
            onOpenMeeting={onOpenMeeting}
          />
        </div>
      </div>

      {/* Bottom Row: Meeting Interface + People Nearby + Profile Settings */}
      <div className="composite-row-bottom">
        <div className="card-shell dark-theme">
          <MeetingPanel
            onLeave={() => onNavigateTab('Office')}
            onExpand={() => onNavigateTab('Meeting')}
          />
        </div>

        <div className="card-shell">
          <NearbyPanel userPos={userPos} />
        </div>

        <div className="card-shell">
          <ProfilePanel onThemeChange={onThemeChange} />
        </div>
      </div>
    </div>
  );
}
