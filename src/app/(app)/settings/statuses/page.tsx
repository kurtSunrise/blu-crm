import { Tags } from "lucide-react";
import { DealStatusesForm } from "@/components/deal-statuses-form";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { requireSession } from "@/lib/session";
import { getAllSubStatuses, getSubStatusPlacement } from "@/lib/sub-statuses";

export const metadata = {
  title: "Settings · Deal statuses | Blu CRM",
};

export const dynamic = "force-dynamic";

export default async function DealStatusesPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  if (!isAdmin) {
    return (
      <SettingsSection
        description="Sub-statuses flag where a deal sits beyond its pipeline stage, such as on hold or blocked."
        icon={Tags}
        title="Deal statuses"
      >
        <SettingsPanel>
          <p className="text-muted-foreground text-sm">
            Admins only. Ask an admin to change the deal statuses.
          </p>
        </SettingsPanel>
      </SettingsSection>
    );
  }

  const [statuses, placement] = await Promise.all([
    getAllSubStatuses(),
    getSubStatusPlacement(),
  ]);

  return (
    <SettingsSection
      description="Sub-statuses flag where a deal sits beyond its pipeline stage, such as on hold or blocked. Add, rename, recolour, reorder, and archive them here, and choose where the control appears."
      icon={Tags}
      title="Deal statuses"
    >
      <DealStatusesForm placement={placement} statuses={statuses} />
    </SettingsSection>
  );
}
