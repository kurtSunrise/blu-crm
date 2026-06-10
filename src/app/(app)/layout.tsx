import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";

// Everything in the app shell requires a signed-in team member; the public
// surfaces (sign-in, enquiry form, quote view) live in the (public) group.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();

  return <AppShell userName={session.user.name}>{children}</AppShell>;
}
