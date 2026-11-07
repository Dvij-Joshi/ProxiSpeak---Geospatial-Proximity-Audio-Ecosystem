import { useState, useEffect } from 'react';
import { SERVER_URL } from '../config';

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
  const [layouts, setLayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgDesc, setNewOrgDesc] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [feedback, setFeedback] = useState(null);

  // Fetch organizations
  const fetchOrgs = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/organizations`);
      if (res.ok) {
        const data = await res.json();
        setOrganizations(data);
        if (!selectedOrg && data.length > 0) {
          setSelectedOrg(data[0]);
        }
      }
    } catch (_e) {
      // Fallback local org
      setOrganizations([
        { orgId: 'acme-corp', name: 'Acme Corporation', slug: 'acme-corp', officeCount: 3, owner: 'dvijjoshi' },
        { orgId: 'deepmind-lab', name: 'DeepMind Research Lab', slug: 'deepmind-lab', officeCount: 1, owner: 'dvijjoshi' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  // Fetch layouts for active org
  useEffect(() => {
    if (!selectedOrg) return;
    fetch(`${SERVER_URL}/api/organizations/${selectedOrg.orgId}/layouts`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLayouts(data))
      .catch(() => setLayouts([]));
  }, [selectedOrg]);

  // Handle Create Organization
  const handleCreateOrg = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    try {
      const res = await fetch(`${SERVER_URL}/api/organizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newOrgName.trim(),
          description: newOrgDesc.trim(),
          owner: user?.username || 'Team Admin',
        }),
      });

      if (res.ok) {
        const created = await res.json();
        setOrganizations((prev) => [created, ...prev]);
        setSelectedOrg(created);
        setShowCreateModal(false);
        setNewOrgName('');
        setNewOrgDesc('');
        setFeedback({ type: 'success', msg: `Organization "${created.name}" created!` });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (_err) {
      setFeedback({ type: 'error', msg: 'Failed to create organization' });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  // Handle Invite Member
  const handleInviteMember = async (e) => {
    e.preventDefault();
    if (!inviteUsername.trim() || !selectedOrg) return;

    try {
      const res = await fetch(`${SERVER_URL}/api/organizations/${selectedOrg.orgId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: inviteUsername.trim(),
          role: inviteRole,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedOrg(updated);
        setInviteUsername('');
        setFeedback({ type: 'success', msg: `Invited ${inviteUsername} as ${inviteRole}!` });
        setTimeout(() => setFeedback(null), 3000);
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', msg: err.error || 'Failed to add member' });
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (_e) {
      setFeedback({ type: 'error', msg: 'Network error inviting member' });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#FAF9F5] rounded-2xl border border-[#D9D7D0] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-[#E9E8E4] flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#2563eb] text-[22px]">corporate_fare</span>
            <div>
              <h2 className="text-base font-bold text-[#1c1b1b]">Organizations & Office Headquarters</h2>
              <p className="text-xs text-[#8C8880]">Manage team work hubs and design bespoke spatial floor plans</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8C8880] hover:text-[#1c1b1b] hover:bg-[#F4F3EF] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-6 py-2 text-xs font-semibold flex items-center gap-2 ${
              feedback.type === 'success' ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#fee2e2] text-[#b91c1c]'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {feedback.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{feedback.msg}</span>
          </div>
        )}

        {/* Content Body: Sidebar + Main Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Organization Selector */}
          <div className="w-64 border-r border-[#E9E8E4] bg-[#F7F6F2] p-4 flex flex-col gap-2 overflow-y-auto">
            <div className="text-[11px] font-bold text-[#8C8880] uppercase tracking-wider px-2 py-1">
              Your Organizations
            </div>

            {loading ? (
              <div className="text-xs text-[#8C8880] px-2 py-4">Loading organizations...</div>
            ) : (
              organizations.map((org) => {
                const isSelected = selectedOrg?.orgId === org.orgId;
                return (
                  <button
                    key={org.orgId}
                    onClick={() => {
                      setSelectedOrg(org);
                      if (onSelectOrg) onSelectOrg(org);
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all flex items-center gap-3 border ${
                      isSelected
                        ? 'bg-white border-[#2563eb] shadow-sm text-[#1c1b1b]'
                        : 'border-transparent hover:bg-white/60 text-[#5e5f5c]'
                    }`}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs text-white"
                      style={{ backgroundColor: org.logoColor || '#2563eb' }}
                    >
                      {org.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs truncate text-[#1c1b1b]">{org.name}</div>
                      <div className="text-[10px] text-[#8C8880]">{org.officeCount || 1} office(s)</div>
                    </div>
                  </button>
                );
              })
            )}

            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-2 w-full py-2 px-3 rounded-xl border border-dashed border-[#D9D7D0] hover:border-[#2563eb] text-xs font-semibold text-[#2563eb] hover:bg-[#e0f2fe]/40 transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              <span>New Organization</span>
            </button>
          </div>

          {/* Right: Selected Org Details & Offices */}
          <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-6 bg-white">
            {selectedOrg && (
              <>
                {/* Org Summary Card */}
                <div className="flex items-center justify-between pb-4 border-b border-[#E9E8E4]">
                  <div>
                    <h3 className="text-lg font-bold text-[#1c1b1b]">{selectedOrg.name}</h3>
                    <p className="text-xs text-[#8C8880] mt-0.5">{selectedOrg.description || 'Enterprise spatial workspace hub'}</p>
                  </div>

                  <button
                    onClick={() => onOpenDesigner && onOpenDesigner(selectedOrg)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
                  >
                    <span className="material-symbols-outlined text-[16px]">draw</span>
                    <span>Design New Office</span>
                  </button>
                </div>

                {/* Offices Grid */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-[#1c1b1b] uppercase tracking-wider">
                      Deployed Office Layouts ({layouts.length})
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {layouts.length === 0 ? (
                      <div className="col-span-2 p-6 rounded-xl border border-dashed border-[#D9D7D0] text-center text-xs text-[#8C8880]">
                        No custom offices yet. Click "Design New Office" to create an office layout!
                      </div>
                    ) : (
                      layouts.map((layout) => (
                        <div
                          key={layout.layoutId}
                          className="p-4 rounded-xl border border-[#D9D7D0] hover:border-[#2563eb] hover:shadow-md transition-all bg-[#FAF9F5] flex flex-col justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-sm text-[#1c1b1b]">{layout.name}</span>
                              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-[#E9E8E4] text-[#5e5f5c]">
                                {layout.theme || 'custom'}
                              </span>
                            </div>
                            <p className="text-xs text-[#8C8880] line-clamp-2">
                              {layout.description || 'Custom spatial layout with acoustic boundaries.'}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-[#E9E8E4]/60">
                            <span className="text-[10px] text-[#8C8880]">
                              {layout.walls?.length || 10} walls • {layout.doors?.length || 1} door(s)
                            </span>

                            <button
                              onClick={() => {
                                if (onLaunchOffice) {
                                  onLaunchOffice({
                                    roomId: layout.layoutId,
                                    name: layout.name,
                                    theme: layout.theme || 'office',
                                    layout,
                                  });
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#10b981] hover:bg-[#059669] text-white text-xs font-semibold flex items-center gap-1 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[14px]">login</span>
                              <span>Enter Office</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Team Members & Invitation */}
                <div className="pt-4 border-t border-[#E9E8E4]">
                  <h4 className="text-xs font-bold text-[#1c1b1b] uppercase tracking-wider mb-3">
                    Team Members ({selectedOrg.members?.length || 1})
                  </h4>

                  {/* Members list */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(selectedOrg.members || [
                      { username: selectedOrg.owner || 'dvijjoshi', role: 'owner' }
                    ]).map((m) => (
                      <div
                        key={m.username}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#F4F3EF] border border-[#D9D7D0] text-xs text-[#1c1b1b]"
                      >
                        <div className="w-5 h-5 rounded-full bg-[#2563eb] text-white font-bold text-[10px] flex items-center justify-center">
                          {m.username.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium">{m.username}</span>
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-white text-[#5e5f5c]">
                          {m.role}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Invite form */}
                  <form onSubmit={handleInviteMember} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Colleague username"
                      value={inviteUsername}
                      onChange={(e) => setInviteUsername(e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="px-2 py-1.5 text-xs rounded-lg border border-[#D9D7D0] bg-white"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-[#1c1b1b] hover:bg-[#333] text-white text-xs font-semibold"
                    >
                      Invite
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Modal: Create Organization */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="w-full max-w-md bg-white rounded-2xl p-6 border border-[#D9D7D0] shadow-xl flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-[#1c1b1b]">Create Organization</h3>
                <button onClick={() => setShowCreateModal(false)} className="text-[#8C8880] hover:text-black">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateOrg} className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-bold text-[#5e5f5c] uppercase">Organization Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Corporation"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs rounded-lg border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-[#5e5f5c] uppercase">Description</label>
                  <textarea
                    rows={2}
                    placeholder="Brief mission or department overview..."
                    value={newOrgDesc}
                    onChange={(e) => setNewOrgDesc(e.target.value)}
                    className="w-full mt-1 px-3 py-2 text-xs rounded-lg border border-[#D9D7D0] focus:outline-none focus:border-[#2563eb]"
                  />
                </div>

                <div className="flex justify-end gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-1.5 text-xs text-[#5e5f5c] hover:bg-[#F4F3EF] rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold bg-[#2563eb] text-white rounded-lg hover:bg-[#1d4ed8]"
                  >
                    Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
