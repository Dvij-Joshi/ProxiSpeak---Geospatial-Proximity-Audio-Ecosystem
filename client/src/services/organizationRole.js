export function organizationRole(user,org) {
  if (!user || !org) return null;
  const same = (a,b) => !!a && !!b && a.trim().toLowerCase()===b.trim().toLowerCase();
  if (same(user.username,org.owner) || same(user.email,org.ownerEmail)) return 'admin';
  const member = org.members?.find(m => same(user.username,m.username) || same(user.email,m.email));
  if (!member) return null;
  return ['admin','owner'].includes(member.role) ? 'admin' : 'member';
}
