"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes (unmaintained since 2025-03) bootstraps the theme with an
// inline <script> rendered inside its provider. React 19.2 logs a dev-only
// false positive for any script element rendered on the client, even though
// this one runs from the server HTML before hydration. Filter that single
// message so real errors keep surfacing; remove if next-themes is replaced.
// next-themes inlines its bootstrap function via `fn.toString()`. Our
// OpenNext/esbuild bundle keeps function names, so that stringified function
// contains an `__name(...)` call (esbuild's keepNames helper) that is never
// defined in the inline <script>'s scope, throwing "__name is not defined" in
// the browser. Define a global identity `__name` before next-themes' script
// runs. Emitted from this client component (the same path next-themes uses)
// and placed first so it executes before the theme script. Static, no input.
const NAME_HELPER_POLYFILL =
  "globalThis.__name||(globalThis.__name=function(t){return t});";

const SCRIPT_TAG_WARNING =
  "Encountered a script tag while rendering React component";
const FILTER_FLAG = Symbol.for("blu.themeScriptWarningFiltered");

type FlaggedWindow = Window & { [FILTER_FLAG]?: boolean };

const isDev = process.env.NODE_ENV === "development";
if (
  isDev &&
  typeof window !== "undefined" &&
  !(window as FlaggedWindow)[FILTER_FLAG]
) {
  (window as FlaggedWindow)[FILTER_FLAG] = true;
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes(SCRIPT_TAG_WARNING)) {
      return;
    }
    originalConsoleError(...args);
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static __name polyfill (see NAME_HELPER_POLYFILL), no user input */}
      <script dangerouslySetInnerHTML={{ __html: NAME_HELPER_POLYFILL }} />
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        disableTransitionOnChange
        enableSystem
      >
        {children}
      </NextThemesProvider>
    </>
  );
}
