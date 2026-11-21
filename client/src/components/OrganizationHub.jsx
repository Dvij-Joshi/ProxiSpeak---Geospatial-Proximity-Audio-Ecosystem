import { DialogFrame } from '../dashboard/Dialog';
import styles from '../dashboard/organization.css?inline';
import { organizationRole } from '../services/organizationRole';
import { AvatarPortrait } from './WorkspaceArt';
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
    badgeColor: '#277970',
    badgeBg: '#e2efdf',
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
  initialTab = 'overview',
  onSelectOrg,
  onOpenDesigner,
  onLaunchOffice,
  onLogout,
  onAuthSuccess,
  onRequestAuth,
  onClose,
}) {
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(currentOrg || null);
  const [activeTab, setActiveTab] = useState(initialTab); // overview, meetings, members, templates, settings
  const [layouts, setLayouts] = useState([]);
  const [meetings, setMeetings] = useState({ all: [], active: [], upcoming: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [detailsState,setDetailsState]=useState('loading');
  const [reload,setReload]=useState(0);
  const [feedback, setFeedback] = useState(null);

  // Modals state
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [newOrgColor, setNewOrgColor] = useState('#277970');
  const [adminFullName, setAdminFullName] = useState(user?.username || '');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPass, setShowAdminPass] = useState(false);
  const [createdAdminCredentials, setCreatedAdminCredentials] = useState(null);
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);

  // Secure password generator helper
  const generateSecurePassword = (prefix = 'Admin#') => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let rand = '';
    for (let i = 0; i < 3; i++) rand += upper[Math.floor(Math.random() * upper.length)];
    for (let i = 0; i < 4; i++) rand += chars[Math.floor(Math.random() * chars.length)];
    return `${prefix}${rand}`;
  };

  const handleOpenCreateOrg = () => {
    if (organizations.length > 0) {
      showToast(`You are already part of "${organizations[0].name}". Accounts cannot create multiple organizations.`, 'error');
      return;
    }
    setNewOrgName('');
    setNewOrgDesc('');
    setNewOrgColor('#277970');
    setAdminFullName(user?.username || '');
    setAdminPassword(generateSecurePassword('Admin#'));
    setShowCreateOrgModal(true);
  };

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
  const myEmail = (user?.email || '').trim().toLowerCase();
  const myMemberRecord = (selectedOrg?.members || []).find((m) => {
    const mUser = (m.username || '').trim().toLowerCase();
    const mEmail = (m.email || '').trim().toLowerCase();
    return (myUsername && mUser === myUsername) || (myEmail && mEmail === myEmail);
  });
  const isAdmin = organizationRole(user,selectedOrg) === 'admin';

  // Fetch organizations scoped strictly to authenticated user
  const fetchOrgs = async () => {
    try {
      const token = localStorage.getItem('proxispeak_token');
      const queryParams = new URLSearchParams();
      if (user?.username) queryParams.append('username', user.username);
      if (user?.email) queryParams.append('email', user.email);
      const url = `${SERVER_URL}/api/organizations${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data);
        if (data.length > 0) {
          const match = data.find((o) => o.orgId === currentOrg?.orgId) || data[0];
          setSelectedOrg(match);
        } else {
          setSelectedOrg(null);
        }
      } else {
        setOrganizations([]);
        setSelectedOrg(null);
      }
    } catch (_e) {
      setOrganizations([]);
      setSelectedOrg(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!createdAdminCredentials) fetchOrgs();
  }, [user?.username, user?.email]);

  useEffect(() => {
    const id=selectedOrg?.orgId;
    if (!id) return;
    const controller=new AbortController();
    const load=async resource=>{
      const res=await fetch(SERVER_URL+'/api/organizations/'+encodeURIComponent(id)+'/'+resource,{signal:controller.signal});
      if (!res.ok) throw Error();
      return res.json();
    };
    setDetailsState('loading');
    setLayouts([]);setMeetings({all:[],active:[],upcoming:[],history:[]});
    Promise.all([load('layouts'),load('meetings')]).then(([rooms,events])=>{
      if (!controller.signal.aborted) {setLayouts(rooms);setMeetings(events);setDetailsState('ready');}
    }).catch(()=>{if (!controller.signal.aborted)setDetailsState('error');});
    return ()=>controller.abort();
  },[selectedOrg?.orgId,reload]);

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

  // Derived values for Create Organization Admin preview
  const derivedNewOrgSlug = useMemo(() => {
    if (!newOrgName.trim()) return '';
    return newOrgName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'org';
  }, [newOrgName]);

  const derivedAdminHandle = useMemo(() => {
    const name = (adminFullName || user?.username || 'admin').trim();
    let h = name
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9.]/g, '')
      .replace(/\.+/g, '.')
      .replace(/^\.|\.$/g, '');
    return h || 'admin';
  }, [adminFullName, user?.username]);

  const derivedAdminEmail = useMemo(() => {
    const slug = derivedNewOrgSlug || 'company';
    return `${derivedAdminHandle}@${slug}.com`;
  }, [derivedAdminHandle, derivedNewOrgSlug]);

  // Handle Create Organization with auto-provisioned Admin and auto-logout
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    if (organizations.length > 0) {
      showToast(`You are already part of "${organizations[0].name}". Accounts cannot create multiple organizations.`, 'error');
      return;
    }

    setIsCreatingOrg(true);

    try {
      const token = localStorage.getItem('proxispeak_token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${SERVER_URL}/api/organizations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: newOrgName.trim(),
          description: newOrgDesc.trim(),
          logoColor: newOrgColor,
          adminFullName: adminFullName.trim() || 'Administrator',
          adminPassword: adminPassword.trim(),
          currentUser: user?.username,
          currentEmail: user?.email,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const created = data.organization || data;
        const creds = data.adminCredentials;

        // Bug 2: Log out previous normal user session immediately
        if (onLogout) onLogout();
        localStorage.removeItem('proxispeak_token');
        localStorage.removeItem('proxispeak_user');

        setShowCreateOrgModal(false);
        setOrganizations([created]);
        setSelectedOrg(created);
        setCreatedAdminCredentials(creds);
        showToast(`Organization "${created.name}" created! Review your official Admin credentials.`, 'success');

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

    if (scheduledDateTime <= new Date()) {
      showToast('Choose a meeting time in the future.', 'error');
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
    <div className="org-workbench">
      <style>{styles}</style>
      <div className="org-panel w-full max-w-6xl bg-[#f4edda] rounded-[28px] border border-[#9bab99] shadow-[0_32px_80px_-16px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col h-[90vh] max-h-[920px]">
        {/* ─── Top Main Navigation Bar ────────────────────────────────────────── */}
        <div className="px-6 py-4 border-b border-[#EBEAE5] flex items-center justify-between bg-[#f4edda] shrink-0">
          <div className="flex items-center gap-3.5">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-xs border border-black/5"
              style={{ backgroundColor: selectedOrg?.logoColor || '#203334' }}
            >
              {selectedOrg?.name?.slice(0, 2).toUpperCase() || 'OG'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#203334] tracking-tight">{selectedOrg?.name || 'Organization Workspace'}</h1>
                <span className="font-mono text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-white border border-[#9bab99] text-[#475950]">
                  @{selectedOrg?.slug || 'workspace'}.com
                </span>
                {isAdmin ? (
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#203334] text-[#f4edda] font-semibold">
                    Administrator
                  </span>
                ) : (
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white text-[#475950] border border-[#9bab99] font-semibold">
                    Team Member
                  </span>
                )}
              </div>
              <p className="text-xs text-[#55675e] mt-0.5 line-clamp-1">
                {selectedOrg?.description || 'Enterprise spatial audio workspace and virtual headquarters.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStartMeetingModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold shadow-sm transition-all active:scale-[0.99] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">video_call</span>
              <span>Start Instant Call</span>
            </button>

            {isAdmin && (
              <button
                onClick={() => setShowScheduleModal(true)}
                className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-[#F5F4EE] border border-[#9bab99] text-[#203334] text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                <span>Schedule Meeting</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors ml-1 flex items-center justify-center cursor-pointer"
              title="Close Workspace"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
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
        <div className="org-body flex-1 flex overflow-hidden">
          {/* ─── Left Sidebar: Organizations Selector & Profile ───────────────── */}
          <div className="org-sidebar w-64 border-r border-[#e2dcc5] bg-[#F7F6F2] p-4 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-2 py-1">
                <span className="text-[11px] font-bold text-[#55675e] uppercase tracking-wider">Organizations</span>
                <span className="text-[10px] text-[#55675e] font-mono">{organizations.length}</span>
              </div>

              {loading ? (
                <div className="p-4 text-xs text-[#55675e] text-center">Loading workspaces...</div>
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
                        className={`w-full text-left p-3 rounded-lg transition-all flex items-center gap-3 border ${
                          isSelected
                            ? 'bg-white border-[#277970] shadow-sm text-[#203334]'
                            : 'border-transparent hover:bg-white/60 text-[#475950]'
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0"
                          style={{ backgroundColor: org.logoColor || '#277970' }}
                        >
                          {org.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-xs truncate text-[#203334]">{org.name}</div>
                          <div className="text-[10px] text-[#55675e] truncate font-mono">@{org.slug}.com</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {organizations.length === 0 ? (
                <button
                  onClick={handleOpenCreateOrg}
                  className="mt-2 w-full py-2.5 px-3 rounded-lg border border-dashed border-[#9bab99] hover:border-[#203334] text-xs font-semibold text-[#203334] hover:bg-white transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[16px]">add_business</span>
                  <span>Create Organization</span>
                </button>
              ) : (
                <div className="mt-2 px-3 py-2.5 rounded-lg bg-white border border-[#9bab99] text-[11px] font-mono text-[#475950] text-center shadow-2xs flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="truncate font-semibold">Enrolled: {selectedOrg?.name || 'Workspace'}</span>
                </div>
              )}
            </div>

            {/* Signed-in Account Footer */}
            <div className="pt-4 border-t border-[#e2dcc5] flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ backgroundColor: user?.avatarColor || '#3b82f6' }}
              >
                <AvatarPortrait name={user?.username} color={user?.avatarColor} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-[#203334] truncate">{user?.username || 'Anonymous'}</div>
                <div className="text-[10px] text-[#55675e] truncate font-mono">
                  {myMemberRecord?.email || `${user?.username || 'user'}@${selectedOrg?.slug || 'proxispeak'}.com`}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Right Content Dashboard ──────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {organizations.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#f4edda]/40 select-none">
                <div className="w-16 h-16 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#277970] mb-4 shadow-sm">
                  <span className="material-symbols-outlined text-[32px]">apartment</span>
                </div>
                <h2 className="text-base font-bold text-[#203334] tracking-tight">No Organizations Found</h2>
                <p className="text-xs text-[#475950] max-w-md mt-1.5 leading-relaxed">
                  Organizations in ProxiSpeak are strictly private to verified company members. Create your organization to become the primary administrator, or sign in with your corporate credentials.
                </p>
                <div className="flex items-center gap-3 mt-6">
                  <button
                    onClick={handleOpenCreateOrg}
                    className="px-5 py-2.5 rounded-xl bg-[#277970] hover:bg-[#205e57] text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_business</span>
                    <span>Create Organization</span>
                  </button>
                  {!user && onRequestAuth && (
                    <button
                      onClick={onRequestAuth}
                      className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#eae4cc] border border-[#849388] text-[#203334] text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">login</span>
                      <span>Sign In to Account</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
            {/* Dashboard Navigation Tabs */}
            <nav aria-label="Organization pages" className="org-pages px-6 pt-3 border-b border-[#e2dcc5] flex items-center gap-1 bg-[#f4edda] overflow-x-auto shrink-0">
              {[
                { id: 'overview', label: 'Overview', icon: 'dashboard' },
                { id: 'meetings', label: 'Meetings & Schedule', icon: 'calendar_month', count: meetings.upcoming?.length || 0 },
                { id: 'members', label: 'Team Members', icon: 'group', count: selectedOrg?.members?.length || 1 },
                { id: 'templates', label: 'Office Templates', icon: 'architecture', count: DEFAULT_TEMPLATES.length + layouts.length },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id} aria-current={isActive?'page':undefined}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition-all border-b-2 -mb-px whitespace-nowrap ${
                      isActive
                        ? 'border-[#277970] text-[#277970] bg-white shadow-sm'
                        : 'border-transparent text-[#55675e] hover:text-[#203334] hover:bg-white/50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                          isActive ? 'bg-blue-100 text-blue-700' : 'bg-[#e2dcc5] text-[#475950]'
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Dashboard Tab Content Body */}
            <div className="org-page-content flex-1 p-6 overflow-y-auto bg-white flex flex-col gap-6">
              {detailsState==='error' && <div role="alert" className="org-response">Schedules and layouts could not be loaded. <button onClick={()=>setReload(v=>v+1)}>Retry</button></div>}
              {detailsState==='loading' && <p role="status">Loading workspace details…</p>}
              {/* ─── TAB 1: OVERVIEW ────────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <div className="flex flex-col gap-6">
                  {/* Hero Metric Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-4 rounded-lg bg-[#f4edda] border border-[#e2dcc5]">
                      <div className="text-[11px] font-bold text-[#55675e] uppercase tracking-wider">Team Members</div>
                      <div className="text-2xl font-bold text-[#203334] mt-1">
                        {selectedOrg?.members?.length || 1}
                      </div>
                      <div className="text-[11px] text-[#059669] mt-1 flex items-center justify-between font-medium">
                        <div className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">verified_user</span>
                          <span>{isAdmin ? 'Admin managed' : 'Member access'}</span>
                        </div>
                        {isAdmin && (
                          <button
                            onClick={() => {
                              setCreatedCredentials(null);
                              setNewUserPassword(generateSecurePassword('User#'));
                              setShowAddUserModal(true);
                            }}
                            className="text-[10px] text-[#277970] hover:underline font-bold flex items-center gap-0.5"
                          >
                            <span className="material-symbols-outlined text-[12px]">person_add</span>
                            <span>Add</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-[#f4edda] border border-[#e2dcc5]">
                      <div className="text-[11px] font-bold text-[#55675e] uppercase tracking-wider">Upcoming Calls</div>
                      <div className="text-2xl font-bold text-[#203334] mt-1">
                        {meetings.upcoming?.length || 0}
                      </div>
                      <div className="text-[11px] text-[#55675e] mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">event</span>
                        <span>Scheduled calendar</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-[#f4edda] border border-[#e2dcc5]">
                      <div className="text-[11px] font-bold text-[#55675e] uppercase tracking-wider">Office Templates</div>
                      <div className="text-2xl font-bold text-[#203334] mt-1">
                        {DEFAULT_TEMPLATES.length + layouts.length}
                      </div>
                      <div className="text-[11px] text-[#277970] mt-1 flex items-center gap-1 font-medium">
                        <span className="material-symbols-outlined text-[14px]">layers</span>
                        <span>3 Standard + {layouts.length} Custom</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-[#f4edda] border border-[#e2dcc5]">
                      <div className="text-[11px] font-bold text-[#55675e] uppercase tracking-wider">Company Domain</div>
                      <div className="text-sm font-mono font-bold text-[#203334] mt-2 truncate">
                        @{selectedOrg?.slug || 'workspace'}.com
                      </div>
                      <div className="text-[10px] text-[#55675e] mt-1">Auto-generated accounts</div>
                    </div>
                  </div>

                  {/* Instant Meeting Quick Launcher */}
                  <div className="p-6 rounded-lg bg-gradient-to-r from-[#f4edda] via-[#eae4cc] to-[#f4edda] border border-[#849388] flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                        <span className="material-symbols-outlined text-[12px]">bolt</span>
                        <span>Spatial Meeting Engine</span>
                      </div>
                      <h3 className="text-lg font-bold text-[#203334]">Instant Team Collaboration</h3>
                      <p className="text-xs text-[#475950] max-w-xl mt-1">
                        Jump immediately into a spatial audio workspace. Choose between Corporate Office, Keynote Auditorium, or Sky Lounge.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowStartMeetingModal(true)}
                      className="px-5 py-3 rounded-lg bg-[#277970] hover:bg-[#205e57] text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-[18px]">meeting_room</span>
                      <span>Launch Instant Call</span>
                    </button>
                  </div>

                  {/* Standard Architectural Templates Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-bold text-[#203334] uppercase tracking-wider">
                          Ready-to-Use Architectural Templates
                        </h3>
                        <p className="text-xs text-[#55675e]">Default physics-aware spatial rooms calibrated for team sizes</p>
                      </div>

                      <button
                        onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg)}
                        className="text-xs font-semibold text-[#277970] hover:underline flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]">draw</span>
                        <span>Design Custom Template</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {DEFAULT_TEMPLATES.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          className="p-5 rounded-lg border border-[#e2dcc5] hover:border-[#277970] hover:shadow-[3px_3px_0_#203334] transition-all bg-[#f4edda] flex flex-col justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md"
                                style={{ backgroundColor: tmpl.badgeBg, color: tmpl.badgeColor }}
                              >
                                {tmpl.badge}
                              </span>
                              <span className="material-symbols-outlined text-[#55675e] text-[20px]">{tmpl.icon}</span>
                            </div>
                            <h4 className="font-bold text-sm text-[#203334]">{tmpl.name}</h4>
                            <p className="text-xs text-[#475950] mt-1 leading-relaxed">{tmpl.description}</p>
                            <div className="mt-3 text-[10px] font-mono text-[#55675e] flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">surround_sound</span>
                              <span>{tmpl.acoustics}</span>
                            </div>
                          </div>

                          <button
                            onClick={() => {
                              handleStartInstantMeeting(tmpl.id);
                            }}
                            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#277970] hover:text-white border border-[#849388] text-xs font-semibold text-[#203334] transition-all flex items-center justify-center gap-1.5 shadow-sm"
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#e2dcc5]">
                    <div>
                      <h3 className="text-base font-bold text-[#203334]">Meetings & Audio Sessions</h3>
                      <p className="text-xs text-[#55675e]">Schedule upcoming calls or review past session audio logs</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowStartMeetingModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#277970] hover:bg-[#205e57] text-white text-xs font-semibold shadow-sm transition-all"
                      >
                        <span className="material-symbols-outlined text-[16px]">video_call</span>
                        <span>Start Instant Meeting</span>
                      </button>

                      {isAdmin && (
                        <button
                          onClick={() => setShowScheduleModal(true)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white hover:bg-[#eae4cc] border border-[#849388] text-[#203334] text-xs font-semibold shadow-sm transition-all"
                        >
                          <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                          <span>Schedule Meeting</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Upcoming Scheduled Meetings */}
                  <div>
                    <h4 className="text-xs font-bold text-[#203334] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      <span>Upcoming Meetings ({meetings.upcoming?.length || 0})</span>
                    </h4>

                    {(!meetings.upcoming || meetings.upcoming.length === 0) ? (
                      <div className="p-8 rounded-lg border border-dashed border-[#849388] bg-[#f4edda] text-center flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-[#55675e] text-[32px] mb-2">event_available</span>
                        <p className="text-xs font-semibold text-[#203334]">No upcoming meetings scheduled</p>
                        <p className="text-[11px] text-[#55675e] mt-0.5">
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
                              className="p-4 rounded-lg border border-[#e2dcc5] hover:border-[#277970] bg-[#f4edda] flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
                                  <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h5 className="font-bold text-xs text-[#203334]">{m.title}</h5>
                                    <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                      {m.template}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#55675e] mt-0.5">
                                    Hosted by <span className="font-medium text-[#203334]">{m.host}</span> · {schedTimeStr}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto">
                                <button
                                  onClick={() => copyText(`${window.location.origin}/?room=${encodeURIComponent(m.roomId)}`, 'Meeting link copied')}
                                  className="p-2 rounded-xl bg-white hover:bg-[#e2dcc5] border border-[#849388] text-[#475950] transition-all text-xs"
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
                                  className="px-3.5 py-1.5 rounded-xl bg-[#277970] hover:bg-[#205e57] text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
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
                    <h4 className="text-xs font-bold text-[#203334] uppercase tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      <span>Previous Meeting Logs & Session History</span>
                    </h4>

                    {(!meetings.history || meetings.history.length === 0) ? (
                      <div className="p-6 rounded-lg border border-[#e2dcc5] bg-[#f4edda] text-center text-xs text-[#55675e]">
                        No completed sessions logged yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-[#e2dcc5]">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-[#f4edda] border-b border-[#e2dcc5] text-[#55675e] uppercase text-[10px]">
                            <tr>
                              <th className="py-3 px-4 font-semibold">Meeting Title</th>
                              <th className="py-3 px-4 font-semibold">Template</th>
                              <th className="py-3 px-4 font-semibold">Host</th>
                              <th className="py-3 px-4 font-semibold">Date</th>
                              <th className="py-3 px-4 font-semibold">Duration</th>
                              <th className="py-3 px-4 font-semibold text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e2dcc5]">
                            {meetings.history.map((m) => (
                              <tr key={m.meetingId} className="hover:bg-[#f4edda] transition-colors">
                                <td className="py-3 px-4 font-semibold text-[#203334]">{m.title}</td>
                                <td className="py-3 px-4">
                                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#eae4cc] border border-[#849388] text-[#475950]">
                                    {m.template}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-[#475950]">{m.host}</td>
                                <td className="py-3 px-4 text-[#55675e]">
                                  {m.startedAt ? new Date(m.startedAt).toLocaleDateString() : (m.createdAt ? new Date(m.createdAt).toLocaleDateString() : 'Recent')}
                                </td>
                                <td className="py-3 px-4 text-[#475950] font-mono">
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
                                    className="text-xs font-semibold text-[#277970] hover:underline"
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#e2dcc5]">
                    <div>
                      <h3 className="text-base font-bold text-[#203334]">Colleague Directory & Roles</h3>
                      <p className="text-xs text-[#55675e]">
                        Manage user accounts, assign admin roles, and generate official @{selectedOrg?.slug}.com credentials
                      </p>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setCreatedCredentials(null);
                          setNewUserPassword(generateSecurePassword('User#'));
                          setShowAddUserModal(true);
                        }}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#277970] hover:bg-[#205e57] text-white text-xs font-semibold shadow-sm transition-all shrink-0"
                      >
                        <span className="material-symbols-outlined text-[16px]">person_add</span>
                        <span>Add Team Member</span>
                      </button>
                    )}
                  </div>

                  {/* Search Bar */}
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3.5 top-2.5 text-[#55675e] text-[18px]">
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Search colleagues by name, handle, or role..."
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-[#849388] bg-[#f4edda] focus:bg-white focus:outline-none focus:border-[#277970] transition-all"
                    />
                  </div>

                  {/* Members Table */}
                  <div className="overflow-x-auto rounded-lg border border-[#e2dcc5]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#f4edda] border-b border-[#e2dcc5] text-[#55675e] uppercase text-[10px]">
                        <tr>
                          <th className="py-3 px-4 font-semibold">User / Colleague</th>
                          <th className="py-3 px-4 font-semibold">Role</th>
                          <th className="py-3 px-4 font-semibold">Official Company Email</th>
                          <th className="py-3 px-4 font-semibold">Joined</th>
                          {isAdmin && <th className="py-3 px-4 font-semibold text-right">Admin Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#e2dcc5]">
                        {filteredMembers.map((m) => {
                          const isMemberOwner = m.role === 'owner' || m.username === selectedOrg.owner;
                          const email = m.email || `${m.username}@${selectedOrg.slug}.com`;
                          return (
                            <tr key={m.username} className="hover:bg-[#f4edda] transition-colors">
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0"
                                    style={{ backgroundColor: m.avatarColor || '#3b82f6' }}
                                  >
                                    <AvatarPortrait name={m.displayName || m.username} color={m.avatarColor} />
                                  </div>
                                  <div>
                                    <div className="font-semibold text-[#203334]">{m.displayName || m.username}</div>
                                    <div className="text-[10px] text-[#55675e] font-mono">@{m.username}</div>
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
                                      : 'bg-[#eae4cc] text-[#475950] border border-[#849388]'
                                  }`}
                                >
                                  {m.role || 'member'}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 font-mono text-[11px] text-[#203334]">
                                <div className="flex items-center gap-1.5">
                                  <span>{email}</span>
                                  <button
                                    onClick={() => copyText(email, 'Email copied')}
                                    className="p-1 rounded text-[#55675e] hover:text-[#203334] transition-colors"
                                    title="Copy email"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                  </button>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-[#55675e]">
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
                                      className="p-1.5 rounded-lg border border-[#849388] hover:border-[#277970] text-[#475950] hover:text-[#277970] bg-white transition-all text-xs"
                                      title="Edit member details & role"
                                    >
                                      <span className="material-symbols-outlined text-[15px]">edit</span>
                                    </button>

                                    {!isMemberOwner && (
                                      <button
                                        onClick={() => setDeletingMember(m)}
                                        className="p-1.5 rounded-lg border border-[#849388] hover:border-red-500 text-[#475950] hover:text-red-600 bg-white transition-all text-xs"
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
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#e2dcc5]">
                    <div>
                      <h3 className="text-base font-bold text-[#203334]">Architectural Templates & Custom Floor Plans</h3>
                      <p className="text-xs text-[#55675e]">
                        Select built-in physical room models or draft bespoke office designs in the interactive studio
                      </p>
                    </div>

                    <button
                      onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#277970] hover:bg-[#205e57] text-white text-xs font-semibold shadow-sm transition-all"
                    >
                      <span className="material-symbols-outlined text-[16px]">draw</span>
                      <span>Open Office Designer</span>
                    </button>
                  </div>

                  {/* Standard Templates Grid */}
                  <div>
                    <h4 className="text-xs font-bold text-[#203334] uppercase tracking-wider mb-3">
                      Built-in Default Templates (3)
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {DEFAULT_TEMPLATES.map((tmpl) => (
                        <div
                          key={tmpl.id}
                          className="p-5 rounded-lg border border-[#849388] bg-[#f4edda] flex flex-col justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md"
                                style={{ backgroundColor: tmpl.badgeBg, color: tmpl.badgeColor }}
                              >
                                {tmpl.badge}
                              </span>
                              <span className="material-symbols-outlined text-[#55675e] text-[20px]">{tmpl.icon}</span>
                            </div>
                            <h5 className="font-bold text-sm text-[#203334]">{tmpl.name}</h5>
                            <p className="text-xs text-[#475950] mt-1">{tmpl.description}</p>
                            <div className="mt-2 text-[10px] text-[#55675e] font-mono">{tmpl.acoustics}</div>
                          </div>

                          <button
                            onClick={() => handleStartInstantMeeting(tmpl.id)}
                            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-[#277970] hover:text-white border border-[#849388] text-xs font-semibold text-[#203334] transition-all flex items-center justify-center gap-1.5 shadow-sm"
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
                    <h4 className="text-xs font-bold text-[#203334] uppercase tracking-wider mb-3">
                      Custom Office Layouts ({layouts.length})
                    </h4>

                    {layouts.length === 0 ? (
                      <div className="p-8 rounded-lg border border-dashed border-[#849388] bg-[#f4edda] text-center flex flex-col items-center justify-center">
                        <span className="material-symbols-outlined text-[#55675e] text-[32px] mb-2">draw</span>
                        <p className="text-xs font-semibold text-[#203334]">No custom layouts created yet</p>
                        <p className="text-[11px] text-[#55675e] mt-0.5">
                          Use the visual drag-and-drop Office Designer to build custom rooms, sound zones, and doors.
                        </p>
                        <button
                          onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg)}
                          className="mt-3 px-4 py-1.5 rounded-xl bg-white border border-[#849388] hover:border-[#277970] text-xs font-semibold text-[#277970] transition-all"
                        >
                          Design Floor Plan
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {layouts.map((l) => (
                          <div
                            key={l.layoutId}
                            className="p-5 rounded-lg border border-[#849388] bg-[#f4edda] flex flex-col justify-between gap-4"
                          >
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <h5 className="font-bold text-sm text-[#203334]">{l.name}</h5>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                                  Custom
                                </span>
                              </div>
                              <p className="text-xs text-[#55675e] line-clamp-2">{l.description || 'Custom spatial layout with acoustic boundaries.'}</p>
                              <div className="mt-2 text-[10px] text-[#55675e] font-mono">
                                {l.walls?.length || 0} walls · {l.doors?.length || 0} doors · {l.furniture?.length || 0} furniture
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-[#e2dcc5]">
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
                                className="flex-1 py-1.5 px-3 rounded-xl bg-[#277970] hover:bg-[#205e57] text-white text-xs font-semibold transition-all flex items-center justify-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">login</span>
                                <span>Launch</span>
                              </button>
                              <button
                                onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg, l)}
                                className="py-1.5 px-3 rounded-xl bg-white border border-[#849388] hover:border-[#277970] text-xs font-semibold text-[#475950] transition-all"
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
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── MODAL 1: CREATE NEW ORGANIZATION & PROVISION ADMIN ─────────────── */}
      {showCreateOrgModal && (
        <DialogFrame className="org-dialog" title="Create organization" onClose={()=>setShowCreateOrgModal(false)} busy={isCreatingOrg}>
          {feedback?.type==='error' && <p className="org-response" role="alert">{feedback.msg}</p>}
          <div className="w-full max-w-lg bg-[#f4edda] rounded-[26px] border border-[#9bab99] shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col">
            {/* Studio Header */}
            <div className="px-6 py-5 bg-[#f4edda] border-b border-[#EBEAE5] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#9bab99] shadow-2xs text-[#203334] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">add_business</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#55675e]">Organization Setup</span>
                  </div>
                  <h3 className="text-base font-bold text-[#203334] tracking-tight">Create New Organization</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateOrgModal(false)}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="p-6 flex flex-col gap-4 bg-white/50">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Organization Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Google, Acme, DeepMind"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                />
                <p className="text-[10px] font-mono text-[#55675e] mt-1.5">
                  Unique case-insensitive name · Domain: @{derivedNewOrgSlug || 'org'}.com
                </p>
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Description
                </label>
                <textarea
                  placeholder="Describe your organization's mission and virtual workspaces..."
                  value={newOrgDesc}
                  onChange={(e) => setNewOrgDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                    Admin Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Kumar"
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] font-semibold">
                      Admin Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setAdminPassword(generateSecurePassword('Admin#'))}
                      className="text-[10px] font-mono text-[#203334] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[13px]">autorenew</span>
                      <span>Regenerate</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showAdminPass ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-mono pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAdminPass(!showAdminPass)}
                      className="absolute right-2.5 top-2.5 text-[#55675e] hover:text-[#203334] transition-colors cursor-pointer"
                      title={showAdminPass ? 'Hide password' : 'Show password'}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {showAdminPass ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Technical Admin Preview Card */}
              <div className="p-3.5 rounded-lg bg-[#f4edda] border border-[#9bab99] text-xs flex flex-col gap-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#475950] font-semibold">
                      Generated Admin Email
                    </span>
                  </div>
                  <span className="font-mono font-bold text-xs text-[#203334]">{derivedAdminEmail}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[#EBEAE5]">
                  <span className="font-mono text-[#55675e]">Login Handle:</span>
                  <span className="font-mono font-semibold text-[#203334]">@{derivedAdminHandle}</span>
                </div>
                <div className="text-[10px] text-[#55675e] leading-relaxed pt-1 border-t border-[#EBEAE5]/60">
                  Creating this organization automatically provisions dedicated Administrator credentials and signs you in securely.
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-2 font-semibold">
                  Brand Identity Accent
                </label>
                <div className="flex items-center gap-2.5">
                  {['#203334', '#277970', '#7c3aed', '#059669', '#ea580c', '#db2777'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewOrgColor(c)}
                      className={`w-7 h-7 rounded-full transition-all border-2 cursor-pointer ${
                        newOrgColor === c ? 'border-[#203334] scale-110 shadow-sm ring-2 ring-[#203334]/20' : 'border-white hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                      title={`Select ${c}`}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-1 border-t border-[#EBEAE5] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateOrgModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#475950] hover:text-[#203334] hover:bg-[#f4edda] border border-[#9bab99] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingOrg || !newOrgName.trim() || !adminFullName.trim() || !adminPassword}
                  className="px-5 py-2.5 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold shadow-sm transition-all disabled:opacity-40 flex items-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span className="material-symbols-outlined text-[16px]">verified_user</span>
                  <span>{isCreatingOrg ? 'Provisioning...' : 'Create Organization & Admin'}</span>
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}

      {/* ─── MODAL 1.5: ADMIN CREDENTIALS GENERATED (1-CLICK ADMIN LOGIN) ───── */}
      {createdAdminCredentials && (
        <DialogFrame className="org-dialog" title="Administrator credentials" onClose={()=>setCreatedAdminCredentials(null)} busy={false}>
          {feedback?.type==='error' && <p className="org-response" role="alert">{feedback.msg}</p>}
          <div className="w-full max-w-lg bg-[#f4edda] rounded-[26px] border border-[#9bab99] shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col">
            <div className="px-6 py-5 bg-[#f4edda] border-b border-[#EBEAE5] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#9bab99] shadow-2xs text-[#203334] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-600 font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Provisioned Successfully
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#203334] tracking-tight">Organization & Admin Provisioned</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreatedAdminCredentials(null)}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 bg-white/50">
              <p className="text-xs text-[#475950] leading-relaxed">
                Your new organization <strong className="text-[#203334]">{selectedOrg?.name}</strong> has been provisioned. Your prior normal session was logged out. Save these primary administrator credentials securely:
              </p>

              <div className="p-4 rounded-lg bg-[#f4edda] border border-[#9bab99] font-mono text-xs flex flex-col gap-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#55675e]">Administrator:</span>
                  <span className="font-bold text-[#203334]">{createdAdminCredentials.fullName}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-[#EBEAE5]">
                  <span className="text-[#55675e]">Login Email:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#203334] select-all">{createdAdminCredentials.email}</span>
                    <button
                      type="button"
                      onClick={() => copyText(createdAdminCredentials.email, 'Email copied')}
                      className="w-6 h-6 rounded-lg border border-[#9bab99] bg-white hover:bg-[#f4edda] text-[#475950] hover:text-[#203334] flex items-center justify-center transition-colors cursor-pointer"
                      title="Copy email"
                    >
                      <span className="material-symbols-outlined text-[13px]">content_copy</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-[#EBEAE5]">
                  <span className="text-[#55675e]">Handle:</span>
                  <span className="font-bold text-[#203334] select-all">@{createdAdminCredentials.username}</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-[#EBEAE5]">
                  <span className="text-[#55675e]">Initial Password:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#203334] select-all">
                      {showAdminPass ? createdAdminCredentials.password : '••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdminPass(!showAdminPass)}
                      className="w-6 h-6 rounded-lg border border-[#9bab99] bg-white hover:bg-[#f4edda] text-[#475950] hover:text-[#203334] flex items-center justify-center transition-colors cursor-pointer"
                      title={showAdminPass ? 'Hide password' : 'Show password'}
                    >
                      <span className="material-symbols-outlined text-[13px]">
                        {showAdminPass ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(createdAdminCredentials.password, 'Password copied')}
                      className="w-6 h-6 rounded-lg border border-[#9bab99] bg-white hover:bg-[#f4edda] text-[#475950] hover:text-[#203334] flex items-center justify-center transition-colors cursor-pointer"
                      title="Copy password"
                    >
                      <span className="material-symbols-outlined text-[13px]">content_copy</span>
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#EBEAE5]">
                  <span className="text-[#55675e]">Role:</span>
                  <span className="font-mono text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#203334] text-[#f4edda]">
                    Administrator (Owner)
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2 border-t border-[#EBEAE5]">
                <button
                  type="button"
                  onClick={() => {
                    if (onAuthSuccess && createdAdminCredentials.token) {
                      onAuthSuccess({
                        token: createdAdminCredentials.token,
                        user: createdAdminCredentials.user,
                      });
                    }
                    setCreatedAdminCredentials(null);
                    showToast(`Signed in as Administrator: ${createdAdminCredentials.fullName}`, 'success');
                  }}
                  className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span className="material-symbols-outlined text-[16px]">login</span>
                  <span>Sign In as Admin Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const text = `ProxiSpeak Admin Credentials for ${selectedOrg?.name}:\nEmail: ${createdAdminCredentials.email}\nUsername: ${createdAdminCredentials.username}\nPassword: ${createdAdminCredentials.password}\nSign In: ${window.location.origin}`;
                    copyText(text, 'Full admin credentials copied');
                    setCreatedAdminCredentials(null);
                    if (onRequestAuth) onRequestAuth();
                  }}
                  className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-white border border-[#9bab99] text-[#203334] text-xs font-semibold hover:bg-[#f4edda] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  <span>Copy & Sign In Manually</span>
                </button>
              </div>
            </div>
          </div>
        </DialogFrame>
      )}

      {/* ─── MODAL 2: ADD USER (ADMIN ONLY) ─────────────────────────────────── */}
      {showAddUserModal && (
        <DialogFrame className="org-dialog" title="Organization member" onClose={()=>setShowAddUserModal(false)} busy={isAddingUser}>
          {feedback?.type==='error' && <p className="org-response" role="alert">{feedback.msg}</p>}
          <div className="w-full max-w-lg bg-[#f4edda] rounded-[26px] border border-[#9bab99] shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col">
            <div className="px-6 py-5 bg-[#f4edda] border-b border-[#EBEAE5] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#9bab99] shadow-2xs text-[#203334] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">person_add</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#55675e]">Team Enrollment</span>
                  </div>
                  <h3 className="text-base font-bold text-[#203334] tracking-tight">Add Colleague to {selectedOrg?.name}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddUserModal(false);
                  setCreatedCredentials(null);
                }}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {createdCredentials ? (
              <div className="p-6 flex flex-col gap-4 bg-white/50">
                <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>User Account Created Successfully</span>
                </div>
                <p className="text-xs text-[#475950] leading-relaxed">
                  The colleague can immediately sign in to ProxiSpeak with these generated credentials:
                </p>

                <div className="p-4 rounded-lg bg-[#f4edda] border border-[#9bab99] font-mono text-xs flex flex-col gap-2 shadow-2xs">
                  <div className="flex justify-between">
                    <span className="text-[#55675e]">Full Name:</span>
                    <span className="font-bold text-[#203334]">{createdCredentials.fullName}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#EBEAE5]">
                    <span className="text-[#55675e]">Official Email:</span>
                    <span className="font-bold text-[#203334] select-all">{createdCredentials.email}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#EBEAE5]">
                    <span className="text-[#55675e]">Username:</span>
                    <span className="font-bold text-[#203334] select-all">@{createdCredentials.username}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#EBEAE5]">
                    <span className="text-[#55675e]">Initial Password:</span>
                    <span className="font-bold text-[#203334] select-all">{createdCredentials.initialPassword}</span>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2 border-t border-[#EBEAE5]">
                  <button
                    type="button"
                    onClick={() => {
                      const text = `ProxiSpeak Credentials for ${selectedOrg?.name}:\nEmail: ${createdCredentials.email}\nUsername: ${createdCredentials.username}\nPassword: ${createdCredentials.initialPassword}\nSign in: ${window.location.origin}`;
                      copyText(text, 'Full credentials copied');
                    }}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    <span>Copy Credentials</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatedCredentials(null)}
                    className="py-2.5 px-4 rounded-xl bg-white border border-[#9bab99] text-[#203334] text-xs font-semibold hover:bg-[#f4edda] transition-colors cursor-pointer shadow-2xs"
                  >
                    Add Another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleAddUser} className="p-6 flex flex-col gap-4 bg-white/50">
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                    Colleague Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh Kumar"
                    value={newUserFullName}
                    onChange={(e) => setNewUserFullName(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                  />
                </div>

                {/* Real-time Email Preview Banner */}
                <div className="p-3.5 rounded-lg bg-[#f4edda] border border-[#9bab99] flex items-center justify-between text-xs shadow-2xs">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#55675e] block">Generated Company Email:</span>
                    <span className="font-mono font-bold text-xs text-[#203334] mt-0.5 block">{derivedUserEmail}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#55675e] px-2 py-1 rounded-lg bg-white border border-[#9bab99]">
                    @{derivedUserHandle || '...'}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] font-semibold">
                      Initial Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const randomPass = 'Proxi' + Math.random().toString(36).substring(2, 8) + '!';
                        setNewUserPassword(randomPass);
                      }}
                      className="text-[10px] font-mono text-[#203334] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[13px]">autorenew</span>
                      <span>Generate Password</span>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 6 characters"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      required
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-mono pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-[#55675e] hover:text-[#203334] transition-colors cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-2 font-semibold">
                    Organization Role
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setNewUserRole('member')}
                      className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${
                        newUserRole === 'member'
                          ? 'border-[#203334] bg-[#203334] text-[#f4edda] shadow-xs'
                          : 'border-[#9bab99] bg-white text-[#475950] hover:bg-[#f4edda]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">person</span>
                      <span>Team Member</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserRole('admin')}
                      className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${
                        newUserRole === 'admin'
                          ? 'border-[#203334] bg-[#203334] text-[#f4edda] shadow-xs'
                          : 'border-[#9bab99] bg-white text-[#475950] hover:bg-[#f4edda]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">shield_person</span>
                      <span>Administrator</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#EBEAE5] flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#475950] hover:text-[#203334] hover:bg-[#f4edda] border border-[#9bab99] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingUser || !newUserFullName.trim() || !newUserPassword}
                    className="px-5 py-2.5 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold disabled:opacity-40 transition-all flex items-center gap-2 cursor-pointer active:scale-[0.99] shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">person_add</span>
                    <span>{isAddingUser ? 'Adding...' : 'Create Account & Add Member'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </DialogFrame>
      )}

      {/* ─── MODAL 3: EDIT USER (ADMIN ONLY) ─────────────────────────────────── */}
      {editingMember && (
        <DialogFrame className="org-dialog" title="Edit member" onClose={()=>setEditingMember(null)} busy={isEditingMember}>
          {feedback?.type==='error' && <p className="org-response" role="alert">{feedback.msg}</p>}
          <div className="w-full max-w-md bg-[#f4edda] rounded-[26px] border border-[#9bab99] shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col">
            <div className="px-6 py-5 bg-[#f4edda] border-b border-[#EBEAE5] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#9bab99] shadow-2xs text-[#203334] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#55675e]">Member Settings</span>
                  </div>
                  <h3 className="text-base font-bold text-[#203334] tracking-tight">Edit Member: {editingMember.username}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEditUser} className="p-6 flex flex-col gap-4 bg-white/50">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Display Name
                </label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Role
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  disabled={editingMember.role === 'owner'}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                >
                  <option value="member">Team Member</option>
                  <option value="admin">Administrator</option>
                  {editingMember.role === 'owner' && <option value="owner">Organization Owner</option>}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Reset Password (Leave blank to keep current)
                </label>
                <input
                  type="password"
                  placeholder="New password (optional)"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-mono"
                />
              </div>

              <div className="pt-4 border-t border-[#EBEAE5] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#475950] hover:text-[#203334] hover:bg-[#f4edda] border border-[#9bab99] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditingMember}
                  className="px-5 py-2.5 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                >
                  {isEditingMember ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}

      {/* ─── MODAL 4: DELETE USER CONFIRMATION ──────────────────────────────── */}
      {deletingMember && (
        <DialogFrame className="org-dialog" title="Remove member" onClose={()=>setDeletingMember(null)} busy={isDeletingMember}>
          {feedback?.type==='error' && <p className="org-response" role="alert">{feedback.msg}</p>}
          <div className="w-full max-w-sm bg-[#f4edda] rounded-[26px] border border-[#9bab99] shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col">
            <div className="px-6 py-5 bg-[#f4edda] border-b border-[#EBEAE5] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 shadow-2xs text-red-600 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">person_remove</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-red-600 font-semibold">Access Revocation</span>
                  </div>
                  <h3 className="text-base font-bold text-[#203334] tracking-tight">Remove Member</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 bg-white/50">
              <p className="text-xs text-[#475950] leading-relaxed">
                Are you sure you want to remove <strong className="text-[#203334]">{deletingMember.displayName || deletingMember.username}</strong> from {selectedOrg?.name}? They will immediately lose access to the organization's workspaces.
              </p>

              <div className="pt-3 border-t border-[#EBEAE5] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeletingMember(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#475950] hover:text-[#203334] hover:bg-[#f4edda] border border-[#9bab99] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemoveUser}
                  disabled={isDeletingMember}
                  className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.99] flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">delete</span>
                  <span>{isDeletingMember ? 'Removing...' : 'Remove User'}</span>
                </button>
              </div>
            </div>
          </div>
        </DialogFrame>
      )}

      {/* ─── MODAL 5: START INSTANT MEETING (TEMPLATE SELECTOR) ─────────────── */}
      {showStartMeetingModal && (
        <DialogFrame className="org-dialog" title="Start meeting" onClose={()=>setShowStartMeetingModal(false)} busy={isStartingMeeting}>
          {feedback?.type==='error' && <p className="org-response" role="alert">{feedback.msg}</p>}
          <div className="w-full max-w-2xl bg-[#f4edda] rounded-[26px] border border-[#9bab99] shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col">
            <div className="px-6 py-5 bg-[#f4edda] border-b border-[#EBEAE5] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#9bab99] shadow-2xs text-[#203334] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">video_call</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#55675e]">Spatial Soundstage</span>
                  </div>
                  <h3 className="text-base font-bold text-[#203334] tracking-tight">Start Instant Spatial Call</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStartMeetingModal(false)}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4 bg-white/50">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Meeting Room Title
                </label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="e.g. Daily Standup or Design Critique"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-2 font-semibold">
                  Choose Architectural Room Template
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
                        className={`p-4 rounded-lg border text-left flex flex-col justify-between gap-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#203334] bg-white ring-2 ring-[#203334]/10 shadow-sm'
                            : 'border-[#9bab99] bg-white/60 hover:bg-white hover:border-[#D0CFC8]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span
                              className="text-[9px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: tmpl.badgeBg, color: tmpl.badgeColor }}
                            >
                              {tmpl.badge}
                            </span>
                            <span className="material-symbols-outlined text-[18px] text-[#475950]">{tmpl.icon}</span>
                          </div>
                          <div className="font-bold text-xs text-[#203334]">{tmpl.name}</div>
                          <p className="text-[11px] text-[#475950] mt-1 line-clamp-2 leading-relaxed">{tmpl.description}</p>
                        </div>
                        <div className="text-[10px] font-mono text-[#55675e] font-semibold pt-2 border-t border-[#EBEAE5]">
                          {tmpl.capacity}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom layouts option if available */}
                {layouts.length > 0 && (
                  <div className="mt-3.5">
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[#55675e] mb-1.5 font-semibold">
                      Or Select Custom Team Canvas
                    </div>
                    <select
                      value={selectedCustomLayoutId}
                      onChange={(e) => {
                        setSelectedCustomLayoutId(e.target.value);
                        if (e.target.value) setSelectedTemplate('custom');
                      }}
                      className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
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

              <div className="pt-4 border-t border-[#EBEAE5] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowStartMeetingModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#475950] hover:text-[#203334] hover:bg-[#f4edda] border border-[#9bab99] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleStartInstantMeeting()}
                  disabled={isStartingMeeting}
                  className="px-6 py-2.5 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  <span className="material-symbols-outlined text-[16px]">rocket_launch</span>
                  <span>{isStartingMeeting ? 'Launching...' : 'Start Meeting Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </DialogFrame>
      )}

      {/* ─── MODAL 6: SCHEDULE MEETING (ADMIN & MEMBERS) ────────────────────── */}
      {showScheduleModal && (
        <DialogFrame className="org-dialog" title="Schedule meeting" onClose={()=>setShowScheduleModal(false)} busy={isScheduling}>
          {feedback?.type==='error' && <p className="org-response" role="alert">{feedback.msg}</p>}
          <div className="w-full max-w-lg bg-[#f4edda] rounded-[26px] border border-[#9bab99] shadow-[0_24px_60px_-12px_rgba(20,20,19,0.22)] overflow-hidden flex flex-col">
            <div className="px-6 py-5 bg-[#f4edda] border-b border-[#EBEAE5] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white border border-[#9bab99] shadow-2xs text-[#203334] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#55675e]">Calendar & Scheduling</span>
                  </div>
                  <h3 className="text-base font-bold text-[#203334] tracking-tight">Schedule Meeting for {selectedOrg.name}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="w-8 h-8 rounded-xl border border-[#9bab99] bg-white hover:bg-[#F5F4EE] text-[#55675e] hover:text-[#203334] transition-colors flex items-center justify-center cursor-pointer"
                title="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleScheduleMeeting} className="p-6 flex flex-col gap-4 bg-white/50">
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Meeting Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Spatial Audio Milestone Review"
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                />
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Description / Agenda (Optional)
                </label>
                <textarea
                  placeholder="Outline the meeting agenda..."
                  value={schedDesc}
                  onChange={(e) => setSchedDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] placeholder:text-[#55675e] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                    Date
                  </label>
                  <input
                    type="date"
                    value={schedDate}
                    onChange={(e) => setSchedDate(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-[#475950] block mb-1.5 font-semibold">
                  Room Template
                </label>
                <select
                  value={schedTemplate}
                  onChange={(e) => setSchedTemplate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl bg-white border border-[#9bab99] text-[#203334] focus:outline-none focus:border-[#203334] focus:ring-2 focus:ring-[#203334]/5 transition-all shadow-2xs font-sans"
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

              <div className="pt-4 border-t border-[#EBEAE5] flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-[#475950] hover:text-[#203334] hover:bg-[#f4edda] border border-[#9bab99] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isScheduling}
                  className="px-5 py-2.5 rounded-xl bg-[#203334] hover:bg-[#252522] text-[#f4edda] text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-[0.99]"
                >
                  {isScheduling ? 'Scheduling...' : 'Schedule Meeting'}
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}
    </div>
  );
}
