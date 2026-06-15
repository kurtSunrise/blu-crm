import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";
import { SIDEBAR_COLLAPSED_COOKIE } from "@/lib/sidebar-prefs";

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

  return (
    <AppShell
      defaultCollapsed={defaultCollapsed}
      userEmail={session.user.email}
      userName={session.user.name}
    >
      {children}
    </AppShell>
  );
}
