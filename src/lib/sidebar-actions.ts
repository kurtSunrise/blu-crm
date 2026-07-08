"use server";

import { cookies } from "next/headers";
import {
  ASSISTANT_WIDE_COOKIE,
  ASSISTANT_WIDE_MAX_AGE_SECONDS,
  SIDEBAR_COLLAPSED_COOKIE,
  SIDEBAR_COLLAPSED_MAX_AGE_SECONDS,
} from "@/lib/sidebar-prefs";

// Persist the collapsed state via a server action rather than writing to
// `document.cookie` directly (the latter is disallowed by the team
// constitution / Biome). Called fire-and-forget from the toggle handler.
export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SIDEBAR_COLLAPSED_COOKIE, String(collapsed), {
    path: "/",
    maxAge: SIDEBAR_COLLAPSED_MAX_AGE_SECONDS,
    sameSite: "lax",
  });
}

// Persist the assistant "wide" state, same best-effort server-action pattern
// as setSidebarCollapsed. Called fire-and-forget from the dock's toggle.
export async function setAssistantWide(wide: boolean): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ASSISTANT_WIDE_COOKIE, String(wide), {
    path: "/",
    maxAge: ASSISTANT_WIDE_MAX_AGE_SECONDS,
    sameSite: "lax",
  });
}
