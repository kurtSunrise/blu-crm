// Name of the cookie that persists the desktop sidebar collapsed state.
// Read server-side in the app layout so the first paint matches the user's
// last choice (no expand/collapse flash on navigation).
export const SIDEBAR_COLLAPSED_COOKIE = "sidebar_collapsed";

export const SIDEBAR_COLLAPSED_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
