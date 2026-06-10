"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// next-themes (unmaintained since 2025-03) bootstraps the theme with an
// inline <script> rendered inside its provider. React 19.2 logs a dev-only
// false positive for any script element rendered on the client, even though
// this one runs from the server HTML before hydration. Filter that single
// message so real errors keep surfacing; remove if next-themes is replaced.
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
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
    >
      {children}
    </NextThemesProvider>
  );
}
