"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Theme-aware toaster wrapper (matches the app's next-themes setup). Mounted
// once in the root layout; call `toast.success(...)` / `toast.error(...)` from
// client components to surface feedback after a mutation.
export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      className="toaster group"
      position="top-center"
      theme={theme as ToasterProps["theme"]}
      {...props}
    />
  );
}
