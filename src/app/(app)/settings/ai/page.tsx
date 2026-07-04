import { Bot, Cpu, Image as ImageIcon, Sparkles } from "lucide-react";
import { AiModelForm } from "@/components/ai-model-form";
import { AssistantInstructionsForm } from "@/components/assistant-instructions-form";
import { AttachmentDescriptionModeForm } from "@/components/attachment-description-mode-form";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { Badge } from "@/components/ui/badge";
import { getAssistantInstructions } from "@/lib/ai/assistant-instructions";
import { getAttachmentDescriptionMode } from "@/lib/ai/attachment-describe";
import { getStoredAiModel } from "@/lib/ai/client";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · AI Preferences | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function AiPreferencesPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  if (!isAdmin) {
    return (
      <SettingsSection
        description="How Blu CRM uses AI across your workspace."
        icon={Cpu}
        title="AI Preferences"
      >
        <SettingsPanel>
          <p className="text-muted-foreground text-sm">
            Admins only. Ask an admin to change the AI preferences.
          </p>
        </SettingsPanel>
      </SettingsSection>
    );
  }

  const visionConfigured = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ZAI_API_KEY
  );
  const descriptionMode = await getAttachmentDescriptionMode();
  const assistantInstructions = await getAssistantInstructions();
  const aiModel = await getStoredAiModel();
  const aiModelEnvOverride = Boolean(process.env.AI_MODEL);

  return (
    <>
      <SettingsSection
        description="How Blu CRM uses AI across your workspace."
        icon={Cpu}
        title="AI Preferences"
      >
        <SettingsPanel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">Photo vision search</p>
              <p className="text-muted-foreground text-xs">
                Describes and matches uploaded photos so attachments are
                searchable.
              </p>
            </div>
            <Badge variant={visionConfigured ? "secondary" : "outline"}>
              {visionConfigured ? "Connected" : "Not configured"}
            </Badge>
          </div>
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="Which Claude model powers the in-app assistant for everyone in your workspace."
        icon={Bot}
        title="Assistant model"
      >
        <SettingsPanel>
          <AiModelForm envOverride={aiModelEnvOverride} model={aiModel} />
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="When the assistant generates and caches descriptions of deal files and photos."
        icon={ImageIcon}
        title="Deal file descriptions"
      >
        <SettingsPanel>
          <AttachmentDescriptionModeForm mode={descriptionMode} />
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="Custom guidance for the in-app assistant when it answers and drafts client communication."
        icon={Sparkles}
        title="AI assistant"
      >
        <SettingsPanel>
          <AssistantInstructionsForm instructions={assistantInstructions} />
        </SettingsPanel>
      </SettingsSection>
    </>
  );
}
