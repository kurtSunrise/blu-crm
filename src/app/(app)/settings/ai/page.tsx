import { Cpu, Sparkles } from "lucide-react";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · AI Preferences | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function AiPreferencesPage() {
  await requireSession();
  const visionConfigured = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ZAI_API_KEY
  );

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
        description="Drafting replies, summarising deals, and the in-app assistant."
        icon={Sparkles}
        title="AI assistant"
      >
        <SettingsPanel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-sm">Assistant features</p>
              <p className="text-muted-foreground text-xs">
                Planned for a later release. Preferences will appear here once
                the assistant ships.
              </p>
            </div>
            <Badge variant="outline">Coming soon</Badge>
          </div>
        </SettingsPanel>
      </SettingsSection>
    </>
  );
}
