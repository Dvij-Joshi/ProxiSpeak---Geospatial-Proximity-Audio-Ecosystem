// Standard public/consumer webmail domains
export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'zoho.com', 'mail.com',
  'gmx.com', 'yandex.com', 'fastmail.com',
]);

/**
 * Checks whether an email belongs to an organization/corporate domain.
 * Returns false for public consumer webmail providers (e.g. Gmail, Yahoo, Outlook).
 */
export function isCompanyEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return false;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  return Boolean(domain && !PUBLIC_EMAIL_DOMAINS.has(domain));
}

/**
 * Classifies an account as 'organization' or 'personal' based on organization membership
 * and email domain attributes.
 */
export function classifyUserAccount(user, primaryOrg = null) {
  if (!user) return 'guest';
  if (primaryOrg && (primaryOrg.orgId || primaryOrg.id)) return 'organization';
  if (isCompanyEmail(user.email)) return 'organization';
  return 'personal';
}
