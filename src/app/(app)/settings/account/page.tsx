import { BookMarked } from "lucide-react";
import { AccountSettings } from "@/components/account/account-settings";
import { AssistantMemorySection } from "@/components/assistant-memory-section";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { listMemories, toAssistantMemoryItems } from "@/lib/ai/memory";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · Account | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const session = await requireSession();
  // The assistant-memory list lives here as well as on /settings/ai because
  // that page is admin-gated and memories are per-user: sales needs a place
  // to review and remove their own.
  const memories = await listMemories(session.user.id);
  const memoryItems = toAssistantMemoryItems(memories);

  return (
    <>
      <AccountSettings
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image ?? null,
        }}
      />
      <SettingsSection
        description="Facts the assistant has saved from chats and uses to personalise its answers."
        icon={BookMarked}
        title="Assistant memory"
      >
        <SettingsPanel>
          <AssistantMemorySection
            canManageTeamMemories={session.user.role === "admin"}
            memories={memoryItems}
          />
        </SettingsPanel>
      </SettingsSection>
    </>
  );
}
