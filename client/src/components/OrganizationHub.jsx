import { useState, useEffect, useMemo, useCallback } from 'react';
import { SERVER_URL } from '../config';

// ─── Default Architectural Templates ─────────────────────────────────────────
const DEFAULT_TEMPLATES = [
  {
    id: 'office',
    name: 'Corporate Headquarters',
    theme: 'office',
    description: 'Executive suites, private soundproof meeting rooms, and team desk pods.',
    icon: 'corporate_fare',
    badge: 'Standard HQ',
    badgeColor: '#2563eb',
    badgeBg: '#eff6ff',
    acoustics: 'Wall attenuation · Soundproof knock-to-enter doors · 60 FPS LERP radar',
    capacity: 'Up to 50 members',
  },
  {
    id: 'conference',
    name: 'Townhall & Keynote Auditorium',
    theme: 'conference',
    description: 'Keynote presentation stage, speaker podium, attendee rows, and acoustic wings.',
    icon: 'account_balance',
    badge: 'Auditorium',
    badgeColor: '#7c3aed',
    badgeBg: '#f5f3ff',
    acoustics: 'High-gain stage broadcast · Acoustic isolation zones · Wide auditorium',
    capacity: 'Up to 100 members',
  },
  {
    id: 'rooftop',
    name: 'Executive Sky Rooftop Lounge',
    theme: 'rooftop',
    description: 'Ambient open-air terrace, fireside lounges, cocktail bar, and VIP lounges.',
    icon: 'deck',
    badge: 'Sky Lounge',
    badgeColor: '#059669',
    badgeBg: '#ecfdf5',
    acoustics: 'Ambient stereo panning · Spatial social clusters · Relaxed drop-off',
    capacity: 'Up to 35 members',
  },
];

export default function OrganizationHub({
  user,
  currentOrg,
  onSelectOrg,
  onOpenDesigner,
  onLaunchOffice,
  onClose,
}) {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(currentOrg || null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, meetings, members, templates, settings
  const [layouts, setLayouts] = useState([]);
  const [meetings, setMeetings] = useState({ all: [], active: [], upcoming: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Modals state
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [newOrgColor, setNewOrgColor] = useState('#2563eb');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Add User Modal State (Admin)
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('member');
  const [showPassword, setShowPassword] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Edit User Modal State
  const [editingMember, setEditingMember] = useState(null);
  const [editRole, setEditRole] = useState('member');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [isEditingMember, setIsEditingMember] = useState(false);

  // Delete User Confirm Modal
  const [deletingMember, setDeletingMember] = useState(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);

  // Start Meeting Modal (Template Picker)
  const [showStartMeetingModal, setShowStartMeetingModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('Team Collaboration Sync');
  const [selectedTemplate, setSelectedTemplate] = useState('office');
  const [selectedCustomLayoutId, setSelectedCustomLayoutId] = useState('');
  const [isStartingMeeting, setIsStartingMeeting] = useState(false);

  // Schedule Meeting Modal
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedTitle, setSchedTitle] = useState('');
  const [schedDesc, setSchedDesc] = useState('');
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');
  const [schedTemplate, setSchedTemplate] = useState('office');
  const [isScheduling, setIsScheduling] = useState(false);

  // Member Search Query
  const [memberSearch, setMemberSearch] = useState('');

  // Helpers
  const showToast = useCallback((msg, type = 'info') => {
    setFeedback({ msg, type, id: Date.now() });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  // Determine current user's role in the selected organization
  const myUsername = (user?.username || '').trim().toLowerCase();
  const isOwner = selectedOrg && selectedOrg.owner?.trim().toLowerCase() === myUsername;
  const myMemberRecord = (selectedOrg?.members || []).find(
    (m) => m.username?.trim().toLowerCase() === myUsername
  );
  const isAdmin = isOwner || myMemberRecord?.role === 'admin' || myMemberRecord?.role === 'owner';

  // Fetch organizations
  const fetchOrgs = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/organizations`);
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data);
        if (!selectedOrg && data.length > 0) {
          const match = data.find((o) => o.orgId === currentOrg?.orgId) || data[0];
          setSelectedOrg(match);
        }
      }
    } catch (_e) {
      setOrganizations([
        {
          orgId: 'acme-corp',
          name: 'Acme Corporation',
          slug: 'acme-corp',
          description: 'Enterprise virtual headquarters with departmental suites.',
          logoColor: '#2563eb',
          owner: 'dvijjoshi',
          members: [
            { username: 'dvijjoshi', displayName: 'Dvij Joshi', email: 'dvijjoshi@acme-corp.com', role: 'owner' },
            { username: 'kunj', displayName: 'Kunj Kachhiya', email: 'kunj@acme-corp.com', role: 'admin' },
          ],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  // Fetch layouts & meetings for selected org
  const fetchOrgDetails = async (orgId) => {
    if (!orgId) return;
    try {
      // Fetch custom layouts
      const resLayouts = await fetch(`${SERVER_URL}/api/organizations/${orgId}/layouts`);
      if (resLayouts.ok) {
        const ldata = await resLayouts.json();
        setLayouts(ldata);
      }

      // Fetch meetings
      const resMeetings = await fetch(`${SERVER_URL}/api/organizations/${orgId}/meetings`);
      if (resMeetings.ok) {
        const mdata = await resMeetings.json();
        setMeetings(mdata);
      }
    } catch (_err) {}
  };

  useEffect(() => {
    if (selectedOrg?.orgId) {
      fetchOrgDetails(selectedOrg.orgId);
    }
  }, [selectedOrg?.orgId]);

  // Derived real-time email preview for Add User modal
  const derivedUserHandle = useMemo(() => {
    if (!newUserFullName.trim()) return '';
    return newUserFullName
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
  }, [newUserFullName]);

  const derivedUserEmail = useMemo(() => {
    if (!selectedOrg?.slug) return '';
    const h = derivedUserHandle || 'username';
    return `${h}@${selectedOrg.slug}.com`;
  }, [derivedUserHandle, selectedOrg?.slug]);

  // Handle Create Organization
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setIsCreatingOrg(true);

    try {
      const res = await fetch(`${SERVER_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOrgName.trim(),
          description: newOrgDesc.trim(),
          logoColor: newOrgColor,
          owner: user?.username || 'Admin',
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setOrganizations((prev) => [created, ...prev]);
        setSelectedOrg(created);
        setShowCreateOrgModal(false);
        setNewOrgName('');
        setNewOrgDesc('');
        showToast(`Organization "${created.name}" created! You are designated as Admin.`, 'success');
        fetchOrgDetails(created.orgId);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create organization', 'error');
      }
    } catch (_err) {
      showToast('Network error creating organization', 'error');
    } finally {
      setIsCreatingOrg(false);
    }
  };

  // Handle Add User (Admin only)
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserFullName.trim() || !newUserPassword) {
      showToast('Full name and initial password are required.', 'error');
      return;
    }
    if (newUserPassword.length < 6) {
      showToast('Password must be at least 6 characters long.', 'error');
      return;
    }

    setIsAddingUser(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/organizations/${selectedOrg.orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: newUserFullName.trim(),
          password: newUserPassword,
          role: newUserRole,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedOrg(data.organization);
        setOrganizations((prev) =>
          prev.map((o) => (o.orgId === data.organization.orgId ? data.organization : o))
        );
        setCreatedCredentials(data.credentials);
        showToast(`User ${data.member.displayName} added with official email ${data.member.email}!`, 'success');
        setNewUserFullName('');
        setNewUserPassword('');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to add user', 'error');
      }
    } catch (_err) {
      showToast('Network error adding member', 'error');
    } finally {
      setIsAddingUser(false);
    }
  };

  // Handle Edit User (Admin only)
  const handleSaveEditUser = async (e) => {
    e.preventDefault();
    if (!editingMember) return;
    setIsEditingMember(true);

    try {
      const res = await fetch(`${SERVER_URL}/api/organizations/${selectedOrg.orgId}/members/${editingMember.username}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: editDisplayName.trim(),
          role: editRole,
          password: editPassword || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedOrg(data.organization);
        setOrganizations((prev) =>
          prev.map((o) => (o.orgId === data.organization.orgId ? data.organization : o))
        );
        showToast(`Member ${editingMember.username} updated successfully!`, 'success');
        setEditingMember(null);
        setEditPassword('');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to update member', 'error');
      }
    } catch (_err) {
      showToast('Network error updating member', 'error');
    } finally {
      setIsEditingMember(false);
    }
  };

  // Handle Remove User (Admin only)
  const handleRemoveUser = async () => {
    if (!deletingMember) return;
    setIsDeletingMember(true);

    try {
      const res = await fetch(`${SERVER_URL}/api/organizations/${selectedOrg.orgId}/members/${deletingMember.username}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedOrg(data.organization);
        setOrganizations((prev) =>
          prev.map((o) => (o.orgId === data.organization.orgId ? data.organization : o))
        );
        showToast(`Member ${deletingMember.displayName || deletingMember.username} removed from organization.`, 'info');
        setDeletingMember(null);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to remove member', 'error');
      }
    } catch (_err) {
      showToast('Network error removing member', 'error');
    } finally {
      setIsDeletingMember(false);
    }
  };

  // Handle Start Instant Meeting
  const handleStartInstantMeeting = async (customTemplateOverride) => {
    const tmpl = customTemplateOverride || selectedTemplate;
    setIsStartingMeeting(true);

    try {
      const res = await fetch(`${SERVER_URL}/api/organizations/${selectedOrg.orgId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: meetingTitle.trim() || `${selectedOrg.name} Instant Call`,
          template: tmpl,
          layoutId: selectedCustomLayoutId || undefined,
          isInstant: true,
          host: user?.username || 'Team Member',
        }),
      });

      if (res.ok) {
        const meeting = await res.json();
        setShowStartMeetingModal(false);
        if (onLaunchOffice) {
          const customLayout = layouts.find((l) => l.layoutId === meeting.layoutId);
          onLaunchOffice({
            roomId: meeting.roomId,
            name: meeting.title,
            theme: meeting.template,
            layout: customLayout || null,
          });
        }
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to start meeting', 'error');
      }
    } catch (_err) {
      showToast('Network error starting meeting', 'error');
    } finally {
      setIsStartingMeeting(false);
    }
  };

  // Handle Schedule Meeting
  const handleScheduleMeeting = async (e) => {
    e.preventDefault();
    if (!schedTitle.trim() || !schedDate || !schedTime) {
      showToast('Meeting title, date, and time are required.', 'error');
      return;
    }

    const scheduledDateTime = new Date(`${schedDate}T${schedTime}`);
    if (isNaN(scheduledDateTime.getTime())) {
      showToast('Invalid date or time selected.', 'error');
      return;
    }

    setIsScheduling(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/organizations/${selectedOrg.orgId}/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: schedTitle.trim(),
          description: schedDesc.trim(),
          template: schedTemplate,
          scheduledAt: scheduledDateTime.toISOString(),
          isInstant: false,
          host: user?.username || 'Team Member',
        }),
      });

      if (res.ok) {
        const newMeeting = await res.json();
        setMeetings((prev) => ({
          ...prev,
          upcoming: [newMeeting, ...prev.upcoming],
          all: [newMeeting, ...prev.all],
        }));
        setShowScheduleModal(false);
        setSchedTitle('');
        setSchedDesc('');
        setSchedDate('');
        setSchedTime('');
        showToast(`Meeting "${newMeeting.title}" scheduled for ${scheduledDateTime.toLocaleDateString()} at ${scheduledDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}!`, 'success');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to schedule meeting', 'error');
      }
    } catch (_err) {
      showToast('Network error scheduling meeting', 'error');
    } finally {
      setIsScheduling(false);
    }
  };

  // Filtered members list
  const filteredMembers = useMemo(() => {
    const list = selectedOrg?.members || [];
    if (!memberSearch.trim()) return list;
    const q = memberSearch.toLowerCase().trim();
    return list.filter(
      (m) =>
        (m.displayName || '').toLowerCase().includes(q) ||
        (m.username || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.role || '').toLowerCase().includes(q)
    );
  }, [selectedOrg?.members, memberSearch]);

  // Copy to clipboard helper
  const copyText = (text, label = 'Copied') => {
    navigator.clipboard.writeText(text);
    showToast(`${label} to clipboard!`, 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-3 md:p-6 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-6xl bg-[#FAF9F5] rounded-3xl border border-[#D9D7D0] shadow-2xl overflow-hidden flex flex-col h-[90vh] max-h-[920px]">
        {/* ─── Top Main Navigation Bar ────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-[#E9E8E4] flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-sm shadow-md"
              style={{ backgroundColor: selectedOrg?.logoColor || '#2563eb' }}
            >
              {selectedOrg?.name?.slice(0, 2).toUpperCase() || 'OG'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#1c1b1b] tracking-tight">{selectedOrg?.name || 'Organization Workspace'}</h1>
                <span className="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[#FAF9F5] border border-[#E9E8E4] text-[#5e5f5c]">
                  @{selectedOrg?.slug || 'workspace'}.com
                </span>
                {isAdmin ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#dbeafe] text-[#1d4ed8] border border-blue-200">
                    Administrator
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F4F3EF] text-[#5e5f5c] border border-[#D9D7D0]">
                    Team Member
                  </span>
                )}
              </div>
              <p className="text-xs text-[#8C8880] mt-0.5 line-clamp-1">
                {selectedOrg?.description || 'Enterprise spatial audio workspace and virtual headquarters.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStartMeetingModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-sm transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">video_call</span>
              <span>Start Instant Call</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setShowScheduleModal(true)}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#F4F3EF] border border-[#D9D7D0] text-[#1c1b1b] text-xs font-semibold shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                <span>Schedule Meeting</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-[#8C8880] hover:text-[#1c1b1b] hover:bg-[#F4F3EF] transition-colors ml-1"
              title="Close Workspace"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* ─── Feedback Toast Alert ───────────────────────────────────────────── */}
        {feedback && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between border-b shrink-0 transition-all ${
              feedback.type === 'success'
                ? 'bg-[#dcfce7] border-green-200 text-[#15803d]'
                : feedback.type === 'error'
                ? 'bg-[#fee2e2] border-red-200 text-[#b91c1c]'
                : 'bg-[#e0f2fe] border-blue-200 text-[#0369a1]'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">
                {feedback.type === 'success' ? 'check_circle' : feedback.type === 'error' ? 'error' : 'info'}
              </span>
              <span>{feedback.msg}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-current opacity-70 hover:opacity-100">
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {/* ─── Body Layout: Organizations Sidebar + Content Dashboard ─────────── */}
        <div className="flex-1 flex overflow-hidden">
          {/* ─── Left Sidebar: Organizations Selector & Profile ───────────────── */}
          <div className="w-64 border-r border-[#E9E8E4] bg-[#F7F6F2] p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider">Organizations</span>
                <span className="text-[10px] text-[#8C8880] font-mono">{organizations.length}</span>
              </div>

              {loading ? (
                <div className="p-4 text-xs text-[#8C8880] text-center">Loading workspaces...</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {organizations.map((org) => {
                    const isSelected = selectedOrg?.orgId === org.orgId;
                    return (
                      <button
                        key={org.orgId}
                        onClick={() => {
                          setSelectedOrg(org);
                          if (onSelectOrg) onSelectOrg(org);
                        }}
                        className={`w-full text-left p-3 rounded-2xl transition-all flex items-center gap-3 border ${
                          isSelected
                            ? 'bg-white border-[#2563eb] shadow-sm text-[#1c1b1b]'
                            : 'border-transparent hover:bg-white/60 text-[#5e5f5c]'
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0"
                          style={{ backgroundColor: org.logoColor || '#2563eb' }}
                        >
                          {org.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xs truncate text-[#1c1b1b]">{org.name}</div>
                          <div className="text-[10px] text-[#8C8880] truncate font-mono">@{org.slug}.com</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                onClick={() => setShowCreateOrgModal(true)}
                className="mt-2 w-full py-2.5 px-3 rounded-2xl border border-dashed border-[#D9D7D0] hover:border-[#2563eb] text-xs font-semibold text-[#2563eb] hover:bg-blue-50/50 transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add_business</span>
                <span>Create Organization</span>
              </button>
            </div>

            {/* Signed-in Account Footer */}
            <div className="pt-4 border-t border-[#E9E8E4] flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: user?.avatarColor || '#3b82f6' }}
              >
                {(user?.username || 'A').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#1c1b1b] truncate">{user?.username || 'Anonymous'}</div>
                <div className="text-[10px] text-[#8C8880] truncate font-mono">
                  {myMemberRecord?.email || `${user?.username || 'user'}@${selectedOrg?.slug || 'proxispeak'}.com`}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Right Content Dashboard ──────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {/* Dashboard Navigation Tabs */}
            <div className="px-6 pt-3 border-b border-[#E9E8E4] flex items-center gap-1 bg-[#FAF9F5] overflow-x-auto shrink-0">
              {[
                { id: 'overview', label: 'Overview', icon: 'dashboard' },
                { id: 'meetings', label: 'Meetings & Schedule', icon: 'calendar_month', count: meetings.upcoming?.length || 0 },
                { id: 'members', label: 'Team Members', icon: 'group', count: selectedOrg?.members?.length || 1 },
                { id: 'templates', label: 'Office Templates', icon: 'architecture', count: DEFAULT_TEMPLATES.length + layouts.length },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
                      isActive
                        ? 'border-[#2563eb] text-[#2563eb] bg-white shadow-sm'
                        : 'border-transparent text-[#8C8880] hover:text-[#1c1b1b] hover:bg-white/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                          isActive ? 'bg-blue-100 text-blue-700' : 'bg-[#E9E8E4] text-[#5e5f5c]'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dashboard Tab Content Body */}
            <div className="flex-1 p-6 overflow-y-auto bg-white flex flex-col gap-6">
              {/* ─── TAB 1: OVERVIEW ────────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <div className="flex flex-col gap-6">
                  {/* Hero Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#E9E8E4]">
                      <div className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider">Team Members</div>
                      <div className="text-2xl font-bold text-[#1c1b1b] mt-1">
                        {selectedOrg?.members?.length || 1}
                      </div>
                      <div className="text-[11px] text-[#059669] mt-1 flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-[14px]">verified_user</span>
                        <span>{isAdmin ? 'Admin managed' : 'Member access'}</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#E9E8E4]">
                      <div className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider">Upcoming Calls</div>
                      <div className="text-2xl font-bold text-[#1c1b1b] mt-1">
                        {meetings.upcoming?.length || 0}
                      </div>
                      <div className="text-[11px] text-[#8C8880] mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">event</span>
                        <span>Scheduled calendar</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#E9E8E4]">
                      <div className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider">Office Templates</div>
                      <div className="text-2xl font-bold text-[#1c1b1b] mt-1">
                        {DEFAULT_TEMPLATES.length + layouts.length}
                      </div>
                      <div className="text-[11px] text-[#2563eb] mt-1 flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-[14px]">layers</span>
                        <span>3 Standard + {layouts.length} Custom</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-[#FAF9F5] border border-[#E9E8E4]">
                      <div className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider">Company Domain</div>
                      <div className="text-sm font-mono font-bold text-[#1c1b1b] mt-2 truncate">
                        @{selectedOrg?.slug || 'workspace'}.com
                      </div>
                      <div className="text-[10px] text-[#8C8880] mt-1">Auto-generated accounts</div>
                    </div>
                  </div>

                  {/* Instant Meeting Quick Launcher */}
                  <div className="p-6 rounded-3xl bg-gradient-to-r from-[#FAF9F5] via-[#F4F3EF] to-[#FAF9F5] border border-[#D9D7D0] flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <span className="material-symbols-outlined text-[12px]">bolt</span>
                        <span>Spatial Meeting Engine</span>
                      </div>
                      <h3 className="text-lg font-bold text-[#1c1b1b]">Instant Team Collaboration</h3>
                      <p className="text-xs text-[#5e5f5c] max-w-xl mt-1">
                        Jump immediately into a spatial audio workspace. Choose between Corporate Office, Keynote Auditorium, or Sky Lounge.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowStartMeetingModal(true)}
                      className="px-5 py-3 rounded-2xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[18px]">meeting_room</span>
                      <span>Launch Instant Call</span>
                    </button>
                  </div>

                  {/* Standard Architectural Templates Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-[#1c1b1b] uppercase tracking-wider">
                          Ready-to-Use Architectural Templates
                        </h3>
                        <p className="text-xs text-[#8C8880]">Default physics-aware spatial rooms calibrated for team sizes</p>
                      </div>

                      <button
                        onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg)}
                        className="text-xs font-semibold text-[#2563eb] hover:underline flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">draw</span>
                        <span>Design Custom Template</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {DEFAULT_TEMPLATES.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          className="p-5 rounded-2xl border border-[#E9E8E4] hover:border-[#2563eb] hover:shadow-md transition-all bg-[#FAF9F5] flex flex-col justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md"
                                style={{ backgroundColor: tmpl.badgeBg, color: tmpl.badgeColor }}
                              >
                                {tmpl.badge}
                              </span>
                              <span className="material-symbols-outlined text-[#8C8880] text-[20px]">{tmpl.icon}</span>
                            </div>
                            <h4 className="font-bold text-sm text-[#1c1b1b]">{tmpl.name}</h4>
                            <p className="text-xs text-[#5e5f5c] mt-1 leading-relaxed">{tmpl.description}</p>
                            <div className="mt-3 text-[10px] font-mono text-[#8C8880] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">surround_sound</span>
                              <span>{tmpl.acoustics}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              handleStartInstantMeeting(tmpl.id);
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#2563eb] hover:text-white border border-[#D9D7D0] text-xs font-semibold text-[#1c1b1b] transition-all flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                            <span>Enter {tmpl.name.split(' ')[0]}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 2: MEETINGS & SCHEDULE ─────────────────────────────── */}
              {activeTab === 'meetings' && (
                <div className="flex flex-col gap-6">
                  {/* Action Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E9E8E4]">
                    <div>
                      <h3 className="text-base font-bold text-[#1c1b1b]">Meetings & Audio Sessions</h3>
                      <p className="text-xs text-[#8C8880]">Schedule upcoming calls or review past session audio logs</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowStartMeetingModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-sm transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">video_call</span>
                        <span>Start Instant Meeting</span>
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => setShowScheduleModal(true)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-[#F4F3EF] border border-[#D9D7D0] text-[#1c1b1b] text-xs font-semibold shadow-sm transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                          <span>Schedule Meeting</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Upcoming Scheduled Meetings */}
                  <div>
                    <h4 className="text-xs font-bold text-[#1c1b1b] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      <span>Upcoming Meetings ({meetings.upcoming?.length || 0})</span>
                    </h4>

                    {(!meetings.upcoming || meetings.upcoming.length === 0) ? (
                      <div className="p-8 rounded-2xl border border-dashed border-[#D9D7D0] bg-[#FAF9F5] text-center flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-[#8C8880] text-[32px] mb-2">event_available</span>
                        <p className="text-xs font-semibold text-[#1c1b1b]">No upcoming meetings scheduled</p>
                        <p className="text-[11px] text-[#8C8880] mt-0.5">
                          {isAdmin ? 'Click "Schedule Meeting" to create calendar events for your team.' : 'Your team admin has not scheduled any upcoming calls yet.'}
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {meetings.upcoming.map((m) => {
                          const schedTimeStr = m.scheduledAt ? new Date(m.scheduledAt).toLocaleString() : 'Scheduled';
                          return (
                            <div
                              key={m.meetingId}
                              className="p-4 rounded-2xl border border-[#E9E8E4] hover:border-[#2563eb] bg-[#FAF9F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h5 className="font-bold text-xs text-[#1c1b1b]">{m.title}</h5>
                                    <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                      {m.template}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#8C8880] mt-0.5">
                                    Hosted by <span className="font-medium text-[#1c1b1b]">{m.host}</span> · {schedTimeStr}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto">
                                <button
                                  onClick={() => copyText(`${window.location.origin}/?room=${encodeURIComponent(m.roomId)}`, 'Meeting link copied')}
                                  className="p-2 rounded-xl bg-white hover:bg-[#E9E8E4] border border-[#D9D7D0] text-[#5e5f5c] transition-all text-xs"
                                  title="Copy invite link"
                                >
                                  <span className="material-symbols-outlined text-[16px]">share</span>
                                </button>
                                <button
                                  onClick={() => {
                                    if (onLaunchOffice) {
                                      const customLayout = layouts.find((l) => l.layoutId === m.layoutId);
                                      onLaunchOffice({
                                        roomId: m.roomId,
                                        name: m.title,
                                        theme: m.template,
                                        layout: customLayout || null,
                                      });
                                    }
                                  }}
                                  className="px-3.5 py-1.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                                >
                                  <span className="material-symbols-outlined text-[16px]">login</span>
                                  <span>Join Call</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Previous Meeting Logs */}
                  <div>
                    <h4 className="text-xs font-bold text-[#1c1b1b] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      <span>Previous Meeting Logs & Session History</span>
                    </h4>

                    {(!meetings.history || meetings.history.length === 0) ? (
                      <div className="p-6 rounded-2xl border border-[#E9E8E4] bg-[#FAF9F5] text-center text-xs text-[#8C8880]">
                        No completed sessions logged yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-2xl border border-[#E9E8E4]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#FAF9F5] border-b border-[#E9E8E4] text-[#8C8880] uppercase text-[10px]">
                            <tr>
                              <th className="py-3 px-4 font-semibold">Meeting Title</th>
                              <th className="py-3 px-4 font-semibold">Template</th>
                              <th className="py-3 px-4 font-semibold">Host</th>
                              <th className="py-3 px-4 font-semibold">Date</th>
                              <th className="py-3 px-4 font-semibold">Duration</th>
                              <th className="py-3 px-4 font-semibold text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#E9E8E4]">
                            {meetings.history.map((m) => (
                              <tr key={m.meetingId} className="hover:bg-[#FAF9F5] transition-colors">
                                <td className="py-3 px-4 font-semibold text-[#1c1b1b]">{m.title}</td>
                                <td className="py-3 px-4">
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#F4F3EF] border border-[#D9D7D0] text-[#5e5f5c]">
                                    {m.template}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-[#5e5f5c]">{m.host}</td>
                                <td className="py-3 px-4 text-[#8C8880]">
                                  {m.startedAt ? new Date(m.startedAt).toLocaleDateString() : (m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'Recent')}
                                </td>
                                <td className="py-3 px-4 text-[#5e5f5c] font-mono">
                                  {m.durationMinutes ? `${m.durationMinutes} mins` : 'Completed'}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    onClick={() => {
                                      if (onLaunchOffice) {
                                        onLaunchOffice({
                                          roomId: m.roomId,
                                          name: m.title,
                                          theme: m.template,
                                          layout: null,
                                        });
                                      }
                                    }}
                                    className="text-xs font-semibold text-[#2563eb] hover:underline"
                                  >
                                    Re-enter
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── TAB 3: TEAM MEMBERS ────────────────────────────────────── */}
              {activeTab === 'members' && (
                <div className="flex flex-col gap-6">
                  {/* Member Management Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E9E8E4]">
                    <div>
                      <h3 className="text-base font-bold text-[#1c1b1b]">Colleague Directory & Roles</h3>
                      <p className="text-xs text-[#8C8880]">
                        Manage user accounts, assign admin roles, and generate official @{selectedOrg?.slug}.com credentials
                      </p>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setCreatedCredentials(null);
                          setShowAddUserModal(true);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-sm transition-all shrink-0"
                      >
                        <span className="material-symbols-outlined text-[16px]">person_add</span>
                        <span>Add Team Member</span>
                      </button>
                    )}
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-[#8C8880] text-[18px]">
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Search colleagues by name, handle, or role..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#D9D7D0] bg-[#FAF9F5] focus:bg-white focus:outline-none focus:border-[#2563eb] transition-all"
                    />
                  </div>

                  {/* Members Table */}
                  <div className="overflow-x-auto rounded-2xl border border-[#E9E8E4]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#FAF9F5] border-b border-[#E9E8E4] text-[#8C8880] uppercase text-[10px]">
                        <tr>
                          <th className="py-3 px-4 font-semibold">User / Colleague</th>
                          <th className="py-3 px-4 font-semibold">Role</th>
                          <th className="py-3 px-4 font-semibold">Official Company Email</th>
                          <th className="py-3 px-4 font-semibold">Joined</th>
                          {isAdmin && <th className="py-3 px-4 font-semibold text-right">Admin Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E9E8E4]">
                        {filteredMembers.map((m) => {
                          const isMemberOwner = m.role === 'owner' || m.username === selectedOrg.owner;
                          const email = m.email || `${m.username}@${selectedOrg.slug}.com`;
                          return (
                            <tr key={m.username} className="hover:bg-[#FAF9F5] transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0"
                                    style={{ backgroundColor: m.avatarColor || '#3b82f6' }}
                                  >
                                    {(m.displayName || m.username).slice(0, 1).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="font-semibold text-[#1c1b1b]">{m.displayName || m.username}</div>
                                    <div className="text-[10px] text-[#8C8880] font-mono">@{m.username}</div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-4">
                                <span
                                  className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${
                                    isMemberOwner
                                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                      : m.role === 'admin'
                                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                      : 'bg-[#F4F3EF] text-[#5e5f5c] border border-[#D9D7D0]'
                                  }`}
                                >
                                  {m.role || 'member'}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 font-mono text-[11px] text-[#1c1b1b]">
                                <div className="flex items-center gap-1.5">
                                  <span>{email}</span>
                                  <button
                                    onClick={() => copyText(email, 'Email copied')}
                                    className="p-1 rounded text-[#8C8880] hover:text-[#1c1b1b] transition-colors"
                                    title="Copy email"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                  </button>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-[#8C8880]">
                                {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : 'Active'}
                              </td>

                              {isAdmin && (
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => {
                                        setEditingMember(m);
                                        setEditDisplayName(m.displayName || m.username);
                                        setEditRole(m.role || 'member');
                                        setEditPassword('');
                                      }}
                                      className="p-1.5 rounded-lg border border-[#D9D7D0] hover:border-[#2563eb] text-[#5e5f5c] hover:text-[#2563eb] bg-white transition-all text-xs"
                                      title="Edit member details & role"
                                    >
                                      <span className="material-symbols-outlined text-[15px]">edit</span>
                                    </button>

                                    {!isMemberOwner && (
                                      <button
                                        onClick={() => setDeletingMember(m)}
                                        className="p-1.5 rounded-lg border border-[#D9D7D0] hover:border-red-500 text-[#5e5f5c] hover:text-red-600 bg-white transition-all text-xs"
                                        title="Remove member"
                                      >
                                        <span className="material-symbols-outlined text-[15px]">delete</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ─── TAB 4: OFFICE TEMPLATES ─────────────────────────────────── */}
              {activeTab === 'templates' && (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#E9E8E4]">
                    <div>
                      <h3 className="text-base font-bold text-[#1c1b1b]">Architectural Templates & Custom Floor Plans</h3>
                      <p className="text-xs text-[#8C8880]">
                        Select built-in physical room models or draft bespoke office designs in the interactive studio
                      </p>
                    </div>

                    <button
                      onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-sm transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">draw</span>
                      <span>Open Office Designer</span>
                    </button>
                  </div>

                  {/* Standard Templates Grid */}
                  <div>
                    <h4 className="text-xs font-bold text-[#1c1b1b] uppercase tracking-wider mb-3">
                      Built-in Default Templates (3)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {DEFAULT_TEMPLATES.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          className="p-5 rounded-2xl border border-[#D9D7D0] bg-[#FAF9F5] flex flex-col justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md"
                                style={{ backgroundColor: tmpl.badgeBg, color: tmpl.badgeColor }}
                              >
                                {tmpl.badge}
                              </span>
                              <span className="material-symbols-outlined text-[#8C8880] text-[20px]">{tmpl.icon}</span>
                            </div>
                            <h5 className="font-bold text-sm text-[#1c1b1b]">{tmpl.name}</h5>
                            <p className="text-xs text-[#5e5f5c] mt-1">{tmpl.description}</p>
                            <div className="mt-2 text-[10px] text-[#8C8880] font-mono">{tmpl.acoustics}</div>
                          </div>

                          <button
                            onClick={() => handleStartInstantMeeting(tmpl.id)}
                            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#2563eb] hover:text-white border border-[#D9D7D0] text-xs font-semibold text-[#1c1b1b] transition-all flex items-center justify-center gap-1.5 shadow-sm"
                          >
                            <span className="material-symbols-outlined text-[16px]">login</span>
                            <span>Launch {tmpl.name.split(' ')[0]}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom Layouts Section */}
                  <div>
                    <h4 className="text-xs font-bold text-[#1c1b1b] uppercase tracking-wider mb-3">
                      Custom Office Layouts ({layouts.length})
                    </h4>

                    {layouts.length === 0 ? (
                      <div className="p-8 rounded-2xl border border-dashed border-[#D9D7D0] bg-[#FAF9F5] text-center flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-[#8C8880] text-[32px] mb-2">draw</span>
                        <p className="text-xs font-semibold text-[#1c1b1b]">No custom layouts created yet</p>
                        <p className="text-[11px] text-[#8C8880] mt-0.5">
                          Use the visual drag-and-drop Office Designer to build custom rooms, sound zones, and doors.
                        </p>
                        <button
                          onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg)}
                          className="mt-3 px-4 py-1.5 rounded-xl bg-white border border-[#D9D7D0] hover:border-[#2563eb] text-xs font-semibold text-[#2563eb] transition-all"
                        >
                          Design Floor Plan
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {layouts.map((l) => (
                          <div
                            key={l.layoutId}
                            className="p-5 rounded-2xl border border-[#D9D7D0] bg-[#FAF9F5] flex flex-col justify-between gap-4"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <h5 className="font-bold text-sm text-[#1c1b1b]">{l.name}</h5>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                  Custom
                                </span>
                              </div>
                              <p className="text-xs text-[#8C8880] line-clamp-2">{l.description || 'Custom spatial layout with acoustic boundaries.'}</p>
                              <div className="mt-2 text-[10px] text-[#8C8880] font-mono">
                                {l.walls?.length || 0} walls · {l.doors?.length || 0} doors · {l.furniture?.length || 0} furniture
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-[#E9E8E4]">
                              <button
                                onClick={() => {
                                  if (onLaunchOffice) {
                                    onLaunchOffice({
                                      roomId: l.layoutId,
                                      name: l.name,
                                      theme: l.theme || 'custom',
                                      layout: l,
                                    });
                                  }
                                }}
                                className="flex-1 py-1.5 px-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold transition-all flex items-center justify-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">login</span>
                                <span>Launch</span>
                              </button>
                              <button
                                onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg, l)}
                                className="py-1.5 px-3 rounded-xl bg-white border border-[#D9D7D0] hover:border-[#2563eb] text-xs font-semibold text-[#5e5f5c] transition-all"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── MODAL 1: CREATE ORGANIZATION ───────────────────────────────────── */}
      {showCreateOrgModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#D9D7D0] shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9E8E4]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#2563eb] text-[20px]">add_business</span>
                <h3 className="font-bold text-sm text-[#1c1b1b]">Create New Organization</h3>
              </div>
              <button onClick={() => setShowCreateOrgModal(false)} className="text-[#8C8880] hover:text-[#1c1b1b]">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Google, DeepMind, Stripe"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                />
                <p className="text-[10px] text-[#8C8880] mt-1">
                  Unique case-insensitive name. You will be designated as the Admin.
                </p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Describe your organization's mission and team focus..."
                  value={newOrgDesc}
                  onChange={(e) => setNewOrgDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Brand Color
                </label>
                <div className="flex items-center gap-2">
                  {['#2563eb', '#7c3aed', '#059669', '#ea580c', '#db2777'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewOrgColor(c)}
                      className={`w-7 h-7 rounded-xl transition-all border-2 ${
                        newOrgColor === c ? 'border-[#1c1b1b] scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[#E9E8E4] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateOrgModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5e5f5c] hover:bg-[#F4F3EF]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingOrg || !newOrgName.trim()}
                  className="px-5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold disabled:opacity-50 transition-all"
                >
                  {isCreatingOrg ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: ADD USER (ADMIN ONLY) ─────────────────────────────────── */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-[#D9D7D0] shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9E8E4]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#2563eb] text-[20px]">person_add</span>
                <h3 className="font-bold text-sm text-[#1c1b1b]">Add Colleague to {selectedOrg?.name}</h3>
              </div>
              <button
                onClick={() => {
                  setShowAddUserModal(false);
                  setCreatedCredentials(null);
                }}
                className="text-[#8C8880] hover:text-[#1c1b1b]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {createdCredentials ? (
              <div className="flex flex-col gap-4 p-4 rounded-2xl bg-[#eff6ff] border border-blue-200">
                <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                  <span className="material-symbols-outlined text-[18px]">verified</span>
                  <span>User Account Created Successfully!</span>
                </div>
                <p className="text-xs text-[#1c1b1b] leading-relaxed">
                  The colleague can immediately sign in to ProxiSpeak with these generated credentials:
                </p>

                <div className="p-3 rounded-xl bg-white border border-blue-200 font-mono text-xs flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#8C8880]">Full Name:</span>
                    <span className="font-bold text-[#1c1b1b]">{createdCredentials.fullName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8C8880]">Official Email:</span>
                    <span className="font-bold text-[#2563eb]">{createdCredentials.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8C8880]">Username:</span>
                    <span className="font-bold text-[#1c1b1b]">{createdCredentials.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8C8880]">Password:</span>
                    <span className="font-bold text-[#059669]">{createdCredentials.initialPassword}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const text = `ProxiSpeak Credentials for ${selectedOrg?.name}:\nEmail: ${createdCredentials.email}\nUsername: ${createdCredentials.username}\nPassword: ${createdCredentials.initialPassword}\nSign in: ${window.location.origin}`;
                      copyText(text, 'Full credentials copied');
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    <span>Copy Credentials</span>
                  </button>
                  <button
                    onClick={() => setCreatedCredentials(null)}
                    className="py-2 px-3 rounded-xl bg-white border border-[#D9D7D0] text-[#1c1b1b] text-xs font-semibold hover:bg-[#F4F3EF]"
                  >
                    Add Another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddUser} className="flex flex-col gap-3.5">
                <div>
                  <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                    Colleague Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Kumar"
                    value={newUserFullName}
                    onChange={(e) => setNewUserFullName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                  />
                </div>

                {/* Real-time Email Preview Banner */}
                <div className="p-3 rounded-xl bg-[#FAF9F5] border border-[#E9E8E4] flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-[#8C8880] uppercase tracking-wider block">Generated Company Email:</span>
                    <span className="font-mono font-bold text-[#2563eb]">{derivedUserEmail}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#8C8880]">Handle: @{derivedUserHandle || '...'}</span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider">
                      Initial Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const randomPass = 'Proxi' + Math.random().toString(36).substring(2, 8) + '!';
                        setNewUserPassword(randomPass);
                      }}
                      className="text-[10px] text-[#2563eb] font-semibold hover:underline"
                    >
                      Generate Password
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      required
                      className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb] pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-[#8C8880] hover:text-[#1c1b1b]"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                    Organization Role
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewUserRole('member')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                        newUserRole === 'member'
                          ? 'border-[#2563eb] bg-blue-50/50 text-[#2563eb]'
                          : 'border-[#D9D7D0] text-[#5e5f5c]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">person</span>
                      <span>Team Member</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserRole('admin')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-all ${
                        newUserRole === 'admin'
                          ? 'border-[#2563eb] bg-blue-50/50 text-[#2563eb]'
                          : 'border-[#D9D7D0] text-[#5e5f5c]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">shield_person</span>
                      <span>Administrator</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E9E8E4] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5e5f5c] hover:bg-[#F4F3EF]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingUser || !newUserFullName.trim() || !newUserPassword}
                    className="px-5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    <span>{isAddingUser ? 'Adding...' : 'Create Account & Add Member'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL 3: EDIT USER (ADMIN ONLY) ─────────────────────────────────── */}
      {editingMember && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-3xl border border-[#D9D7D0] shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9E8E4]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#2563eb] text-[20px]">manage_accounts</span>
                <h3 className="font-bold text-sm text-[#1c1b1b]">Edit Member: {editingMember.username}</h3>
              </div>
              <button onClick={() => setEditingMember(null)} className="text-[#8C8880] hover:text-[#1c1b1b]">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={editingMember.role === 'owner'}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                >
                  <option value="member">Team Member</option>
                  <option value="admin">Administrator</option>
                  {editingMember.role === 'owner' && <option value="owner">Organization Owner</option>}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Reset Password (Leave blank to keep current)
                </label>
                <input
                  type="password"
                  placeholder="New password (optional)"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              <div className="pt-3 border-t border-[#E9E8E4] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5e5f5c] hover:bg-[#F4F3EF]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditingMember}
                  className="px-5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold transition-all"
                >
                  {isEditingMember ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: DELETE USER CONFIRMATION ──────────────────────────────── */}
      {deletingMember && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#D9D7D0] shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-red-600">
              <span className="material-symbols-outlined text-[22px]">warning</span>
              <h3 className="font-bold text-sm text-[#1c1b1b]">Remove Member</h3>
            </div>
            <p className="text-xs text-[#5e5f5c] leading-relaxed">
              Are you sure you want to remove <span className="font-bold text-[#1c1b1b]">{deletingMember.displayName || deletingMember.username}</span> from {selectedOrg.name}? They will lose access to the organization's workspaces.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setDeletingMember(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5e5f5c] hover:bg-[#F4F3EF]"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveUser}
                disabled={isDeletingMember}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all"
              >
                {isDeletingMember ? 'Removing...' : 'Remove User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: START INSTANT MEETING (TEMPLATE SELECTOR) ─────────────── */}
      {showStartMeetingModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl border border-[#D9D7D0] shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9E8E4]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#2563eb] text-[22px]">video_call</span>
                <div>
                  <h3 className="font-bold text-sm text-[#1c1b1b]">Start Instant Spatial Call</h3>
                  <p className="text-[11px] text-[#8C8880]">Select the architectural template for your meeting room</p>
                </div>
              </div>
              <button onClick={() => setShowStartMeetingModal(false)} className="text-[#8C8880] hover:text-[#1c1b1b]">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                Meeting Room Title
              </label>
              <input
                type="text"
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder="e.g. Daily Standup or Design Critique"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-2">
                Choose Room Template
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {DEFAULT_TEMPLATES.map((tmpl) => {
                  const isSelected = selectedTemplate === tmpl.id;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => {
                        setSelectedTemplate(tmpl.id);
                        setSelectedCustomLayoutId('');
                      }}
                      className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between gap-3 transition-all ${
                        isSelected
                          ? 'border-[#2563eb] bg-blue-50/40 ring-1 ring-[#2563eb]'
                          : 'border-[#D9D7D0] hover:bg-[#FAF9F5]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: tmpl.badgeBg, color: tmpl.badgeColor }}
                          >
                            {tmpl.badge}
                          </span>
                          <span className="material-symbols-outlined text-[18px] text-[#8C8880]">{tmpl.icon}</span>
                        </div>
                        <div className="font-bold text-xs text-[#1c1b1b] mt-1">{tmpl.name}</div>
                        <p className="text-[10px] text-[#5e5f5c] mt-0.5 line-clamp-2">{tmpl.description}</p>
                      </div>
                      <div className="text-[9px] text-[#2563eb] font-semibold">{tmpl.capacity}</div>
                    </button>
                  );
                })}
              </div>

              {/* Custom layouts option if available */}
              {layouts.length > 0 && (
                <div className="mt-3">
                  <div className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider mb-1.5">
                    Or select custom team template:
                  </div>
                  <select
                    value={selectedCustomLayoutId}
                    onChange={(e) => {
                      setSelectedCustomLayoutId(e.target.value);
                      if (e.target.value) setSelectedTemplate('custom');
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                  >
                    <option value="">-- Use Standard Template Selected Above --</option>
                    {layouts.map((l) => (
                      <option key={l.layoutId} value={l.layoutId}>
                        Custom: {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#E9E8E4] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowStartMeetingModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5e5f5c] hover:bg-[#F4F3EF]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStartInstantMeeting()}
                disabled={isStartingMeeting}
                className="px-6 py-2.5 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
                <span>{isStartingMeeting ? 'Launching...' : 'Start Meeting Now'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: SCHEDULE MEETING (ADMIN & MEMBERS) ────────────────────── */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-[#D9D7D0] shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E9E8E4]">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#2563eb] text-[20px]">calendar_month</span>
                <h3 className="font-bold text-sm text-[#1c1b1b]">Schedule Meeting for {selectedOrg.name}</h3>
              </div>
              <button onClick={() => setShowScheduleModal(false)} className="text-[#8C8880] hover:text-[#1c1b1b]">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleScheduleMeeting} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Spatial Audio Milestone Review"
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Description / Agenda (Optional)
                </label>
                <textarea
                  placeholder="Outline the meeting agenda..."
                  value={schedDesc}
                  onChange={(e) => setSchedDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    required
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#1c1b1b] uppercase tracking-wider block mb-1">
                  Room Template
                </label>
                <select
                  value={schedTemplate}
                  onChange={(e) => setSchedTemplate(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                >
                  <option value="office">Corporate Headquarters (Default Office)</option>
                  <option value="conference">Townhall & Keynote Auditorium</option>
                  <option value="rooftop">Executive Sky Rooftop Lounge</option>
                  {layouts.map((l) => (
                    <option key={l.layoutId} value="custom">
                      Custom: {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-[#E9E8E4] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#5e5f5c] hover:bg-[#F4F3EF]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isScheduling}
                  className="px-5 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold transition-all"
                >
                  {isScheduling ? 'Scheduling...' : 'Schedule Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
