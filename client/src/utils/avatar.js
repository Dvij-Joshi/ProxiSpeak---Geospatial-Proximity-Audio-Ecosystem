/**
 * Derives 2-letter uppercase avatar initials from a full name.
 * e.g. "Dvij Joshi" -> "DJ"
 *      "Ramesh Kumar" -> "RK"
 *      "Alice" -> "AL"
 */
export function getInitials(name) {
  if (!name || typeof name !== 'string') return '??';
  const clean = name.trim();
  if (!clean) return '??';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
