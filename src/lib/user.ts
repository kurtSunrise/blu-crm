const WHITESPACE_RE = /\s+/;

// Initials for an avatar fallback: first + last name initials, else the first
// two name characters, else the first two email characters.
export function getUserInitials(name: string, email: string): string {
  const trimmedName = name.trim();
  if (trimmedName) {
    const parts = trimmedName.split(WHITESPACE_RE);
    if (parts.length >= 2) {
      const first = parts[0].charAt(0);
      const last = (parts.at(-1) ?? "").charAt(0);
      return `${first}${last}`.toUpperCase();
    }
    return trimmedName.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "?";
}
