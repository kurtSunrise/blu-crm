import { createAuthClient } from "better-auth/react";

// baseURL must be the origin the app is actually served from. Do NOT take it
// from NEXT_PUBLIC_APP_URL: that is inlined at build time, so a build made with
// a localhost (or other-domain) value makes the browser POST sign-in to the
// wrong host and login silently fails. In the browser we always know the real
// origin from window.location; on the server this client is not used for calls.
export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? undefined : window.location.origin,
});
