"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

// Light / dark toggle. Renders a stable placeholder until mounted because
// the resolved theme is unknown during SSR.
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      aria-label={label}
      className={
        withLabel
          ? "flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-muted-foreground text-sm transition-colors hover:bg-accent/50 hover:text-foreground"
          : "flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
      }
      onClick={() => setTheme(isDark ? "light" : "dark")}
      type="button"
    >
      {isDark ? (
        <Sun aria-hidden className={withLabel ? "size-4.5" : "size-5"} />
      ) : (
        <Moon aria-hidden className={withLabel ? "size-4.5" : "size-5"} />
      )}
      {withLabel && (mounted ? label : "Theme")}
    </button>
  );
}
