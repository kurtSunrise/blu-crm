"use client";

import "./globals.css";

// Last-resort boundary: it replaces the root layout entirely, so it must
// render its own <html> and <body> and stay dependency-free (no theme
// provider, no next/font, no shadcn imports).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            justifyContent: "center",
            minHeight: "100dvh",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", fontSize: "0.875rem" }}>
            Blu CRM could not load. Try again in a moment.
            {error.digest ? ` (Reference: ${error.digest})` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              background: "#111",
              border: 0,
              borderRadius: "0.5rem",
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.875rem",
              padding: "0.75rem 1.5rem",
            }}
            type="button"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
