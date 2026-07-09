import { cookies } from "next/headers";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { ToastFlash } from "@/components/toast-flash";
import { requireSession } from "@/lib/session";
import {
  ASSISTANT_WIDE_COOKIE,
  SIDEBAR_COLLAPSED_COOKIE,
} from "@/lib/sidebar-prefs";

// Everything in the app shell requires a signed-in team member; the public
// surfaces (sign-in, enquiry form, quote view) live in the (public) group.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();
  const cookieStore = await cookies();
  const defaultCollapsed =
    cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "true";
  const defaultWide = cookieStore.get(ASSISTANT_WIDE_COOKIE)?.value === "true";

  return (
    <AppShell
      defaultCollapsed={defaultCollapsed}
      defaultWide={defaultWide}
      userEmail={session.user.email}
      userImage={session.user.image ?? null}
      userName={session.user.name}
    >
      <Suspense>
        <ToastFlash />
      </Suspense>
      {children}
    </AppShell>
  );
}
