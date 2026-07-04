import { asc, count, eq } from "drizzle-orm";
import {
  Bell,
  KanbanSquare,
  MousePointer2,
  Percent,
  SunMoon,
} from "lucide-react";
import { AlertThresholdsForm } from "@/components/alert-thresholds-form";
import { PipelineTooltipForm } from "@/components/pipeline-tooltip-form";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { StageManager } from "@/components/stage-manager";
import { StageWeightingsForm } from "@/components/stage-weightings-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { db } from "@/db";
import { deal, pipelineStage } from "@/db/schema";
import { getAlertThresholds } from "@/lib/alerts";
import { getPipelineTooltipSettings } from "@/lib/pipeline-tooltip";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · General | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function GeneralSettingsPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  if (!isAdmin) {
    return (
      <>
        <SettingsSection
          description="Pipeline stages, forecast weightings, alerts, and pipeline card details for the whole workspace."
          icon={KanbanSquare}
          title="Workspace settings"
        >
          <SettingsPanel>
            <p className="text-muted-foreground text-sm">
              Admins only. Ask an admin to change the workspace settings.
            </p>
          </SettingsPanel>
        </SettingsSection>

        <SettingsSection
          description="Light suits the office, dark suits early starts and site visits. The theme follows this device until you pick one, and is remembered per device."
          icon={SunMoon}
          title="Appearance"
        >
          <SettingsPanel>
            <div className="rounded-lg border p-1.5">
              <ThemeToggle withLabel />
            </div>
          </SettingsPanel>
        </SettingsSection>
      </>
    );
  }

  const thresholds = await getAlertThresholds();
  const tooltip = await getPipelineTooltipSettings();
  // Deal counts include discarded deals: they still reference their stage,
  // so removing a stage has to move them too (FR-1.3 AC).
  const stages = await db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      weighting: pipelineStage.weighting,
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
      dealCount: count(deal.id),
    })
    .from(pipelineStage)
    .leftJoin(deal, eq(deal.stageId, pipelineStage.id))
    .groupBy(pipelineStage.id)
    .orderBy(asc(pipelineStage.position));

  return (
    <>
      <SettingsSection
        description="Rename, reorder, add, or remove the board's stages. Won and Lost / Dormant stay fixed at the end so closing flows keep working."
        icon={KanbanSquare}
        title="Pipeline stages"
      >
        <SettingsPanel>
          <StageManager
            stages={stages.map((stage) => ({
              id: stage.id,
              name: stage.name,
              isWon: stage.isWon,
              isLost: stage.isLost,
              dealCount: stage.dealCount,
            }))}
          />
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="How much of each stage's value counts towards the weighted forecast on the dashboard and reports."
        icon={Percent}
        title="Forecast weightings"
      >
        <SettingsPanel>
          <StageWeightingsForm stages={stages} />
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="When deals surface on the dashboard and tasks page as needing attention or closing soon."
        icon={Bell}
        title="Alerts"
      >
        <SettingsPanel>
          <AlertThresholdsForm
            closingSoonDays={thresholds.closingSoonDays}
            staleDays={thresholds.staleDays}
          />
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="Hover a deal on the pipeline board (mouse only) to preview more about it. Choose whether the preview shows, and which details it includes."
        icon={MousePointer2}
        title="Pipeline card details"
      >
        <SettingsPanel>
          <PipelineTooltipForm
            contact={tooltip.contact}
            enabled={tooltip.enabled}
            followUp={tooltip.followUp}
            scope={tooltip.scope}
          />
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="Light suits the office, dark suits early starts and site visits. The theme follows this device until you pick one, and is remembered per device."
        icon={SunMoon}
        title="Appearance"
      >
        <SettingsPanel>
          <div className="rounded-lg border p-1.5">
            <ThemeToggle withLabel />
          </div>
        </SettingsPanel>
      </SettingsSection>
    </>
  );
}
