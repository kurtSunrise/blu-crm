// Name of the cookie that persists the desktop sidebar collapsed state.
// Read server-side in the app layout so the first paint matches the user's
// last choice (no expand/collapse flash on navigation).
export const SIDEBAR_COLLAPSED_COOKIE = "sidebar_collapsed";

export const SIDEBAR_COLLAPSED_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// Name of the cookie that persists the desktop AI assistant "wide" state.
// Read server-side in the app layout for the same reason as the sidebar
// cookie: the assistant width drives the main content's right padding, so
// the first paint must match the user's last choice (no padding flash).
export const ASSISTANT_WIDE_COOKIE = "assistant_wide";

export const ASSISTANT_WIDE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
