import { and, asc, eq } from "drizzle-orm";
import { BellRing, Route } from "lucide-react";
import { HandoverRecipientsForm } from "@/components/handover-recipients-form";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { db } from "@/db";
import { user } from "@/db/schema";
import {
  getHandoverRecipientIds,
  getNotificationPreferenceMap,
} from "@/lib/notifications";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · Notifications | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  const [preferences, activeUsers, handoverRecipientIds] = await Promise.all([
    getNotificationPreferenceMap(session.user.id),
    isAdmin
      ? db
          .select({ id: user.id, name: user.name, email: user.email })
          .from(user)
          .where(and(eq(user.disabled, false)))
          .orderBy(asc(user.name))
      : Promise.resolve([]),
    isAdmin ? getHandoverRecipientIds() : Promise.resolve([]),
  ]);

  return (
    <>
      <SettingsSection
        description="Choose which events land in your notification feed. These apply to you only."
        icon={BellRing}
        title="Notification types"
      >
        <SettingsPanel>
          <NotificationPreferencesForm preferences={preferences} />
        </SettingsPanel>
      </SettingsSection>

      {isAdmin && (
        <SettingsSection
          description="Who receives the handover notification when a won deal is flagged for delivery. Until set, all admins receive it."
          icon={Route}
          title="Company event routing"
        >
          <SettingsPanel>
            <HandoverRecipientsForm
              selectedIds={handoverRecipientIds}
              users={activeUsers}
            />
          </SettingsPanel>
        </SettingsSection>
      )}
    </>
  );
}
