import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

initOpenNextCloudflareForDev();

// Baseline security headers for every route. A script-src CSP is future
// work: App Router hydration relies on inline scripts (plus the theme
// polyfill), so it needs nonce plumbing; frame-ancestors covers the
// clickjacking risk without it. The attachment routes additionally set
// their own stricter CSP ("sandbox") on the streamed response.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    // microphone=(self): the assistant's voice-input feature needs
    // getUserMedia on our own origin; an empty allowlist blocks it for every
    // origin, including this page. Camera/geolocation stay fully disabled.
    value: "camera=(), microphone=(self), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
};

export default nextConfig;
