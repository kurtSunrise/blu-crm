import { AccountSettings } from "@/components/account/account-settings";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · Account | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const session = await requireSession();

  return (
    <AccountSettings
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
      }}
    />
  );
}
