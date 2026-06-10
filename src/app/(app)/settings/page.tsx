import { asc } from "drizzle-orm";
import {
  ArrowRight,
  Bell,
  Building2,
  FileUp,
  Globe,
  Inbox,
  Mail,
  Percent,
  SunMoon,
} from "lucide-react";
import Link from "next/link";
import { AlertThresholdsForm } from "@/components/alert-thresholds-form";
import { CopyLinkButton } from "@/components/copy-link-button";
import { StageWeightingsForm } from "@/components/stage-weightings-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { pipelineStage } from "@/db/schema";
import { getAlertThresholds } from "@/lib/alerts";

export const metadata = {
  title: "Settings | Blu CRM",
};

export const dynamic = "force-dynamic";

const WORKSPACE_FACTS = [
  { label: "Business", value: "Blu.Builders Pty Ltd" },
  { label: "Based in", value: "Malaga, Western Australia" },
  { label: "Currency", value: "AUD" },
  { label: "Timezone", value: "AWST (Perth)" },
] as const;

function SettingsCard({
  icon: Icon,
  title,
  description,
  label,
  children,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-blu/10 text-blu">
          <Icon aria-hidden className="size-4.5" />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-heading font-semibold text-lg">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function SettingsPage() {
  const thresholds = await getAlertThresholds();
  const stages = await db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      weighting: pipelineStage.weighting,
    })
    .from(pipelineStage)
    .orderBy(asc(pipelineStage.position));

  const emailIntakeConfigured = Boolean(process.env.EMAIL_INTAKE_TOKEN);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:max-w-6xl">
      <header className="flex flex-col gap-1">
        <p className="font-medium text-blu text-xs uppercase tracking-widest">
          Blu Builders · The Creative Build Company
        </p>
        <h1 className="font-semibold text-2xl tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Workspace-wide preferences. Changes apply to everyone straight away;
          role-based access arrives with sign-in.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-6">
          <SettingsCard
            description="When deals surface on the dashboard and tasks page as needing attention or closing soon."
            icon={Bell}
            label="Alert thresholds"
            title="Alerts"
          >
            <AlertThresholdsForm
              closingSoonDays={thresholds.closingSoonDays}
              staleDays={thresholds.staleDays}
            />
          </SettingsCard>

          <SettingsCard
            description="How much of each stage's value counts towards the weighted forecast on the dashboard and reports."
            icon={Percent}
            label="Forecast weightings"
            title="Forecast weightings"
          >
            <StageWeightingsForm stages={stages} />
          </SettingsCard>
        </div>

        <div className="flex flex-col gap-6">
          <SettingsCard
            description="Every channel lands in the same Inbox, so no enquiry depends on someone checking email."
            icon={Inbox}
            label="Lead intake"
            title="Lead intake"
          >
            <ul className="flex flex-col gap-2">
              <li className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <Globe aria-hidden className="size-4.5 shrink-0 text-blu" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">Public enquiry form</p>
                  <p className="text-muted-foreground text-xs">
                    Share this link on the website or socials; submissions
                    arrive in the Inbox tagged Web.
                  </p>
                </div>
                <div className="flex gap-2">
                  <CopyLinkButton path="/enquire" />
                  <Link
                    className="flex h-11 items-center rounded-md border px-4 text-sm transition-colors hover:border-blu"
                    href="/enquire"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open
                  </Link>
                </div>
              </li>
              <li className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <Mail aria-hidden className="size-4.5 shrink-0 text-blu" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">Email-to-lead</p>
                  <p className="text-muted-foreground text-xs">
                    Forwarded enquiry emails become raw Inbox leads with the
                    original message on the timeline.
                  </p>
                </div>
                <Badge
                  variant={emailIntakeConfigured ? "secondary" : "outline"}
                >
                  {emailIntakeConfigured ? "Connected" : "Not configured"}
                </Badge>
              </li>
            </ul>
            <Link
              className="flex w-fit items-center gap-1 text-blu text-sm underline-offset-2 hover:underline"
              href="/inbox"
            >
              Review the Inbox
              <ArrowRight aria-hidden className="size-3" />
            </Link>
          </SettingsCard>

          <SettingsCard
            description="Bring existing records across from spreadsheets. Deletes everywhere in the app are soft, so history is never lost."
            icon={FileUp}
            label="Data"
            title="Data"
          >
            <Link
              className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-blu"
              href="/settings/import"
            >
              <FileUp aria-hidden className="size-4.5 shrink-0 text-blu" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm">CSV import</span>
                <span className="block text-muted-foreground text-xs">
                  Bulk-load contacts and open deals from a spreadsheet.
                </span>
              </span>
              <ArrowRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
            </Link>
          </SettingsCard>

          <SettingsCard
            description="Light suits the office, dark suits early starts and site visits."
            icon={SunMoon}
            label="Appearance"
            title="Appearance"
          >
            <div className="rounded-lg border p-1.5">
              <ThemeToggle withLabel />
            </div>
            <p className="text-muted-foreground text-xs">
              The theme follows this device's system preference until you pick
              one, and is remembered per device.
            </p>
          </SettingsCard>

          <SettingsCard
            description="Where this workspace is anchored. Users and roles become editable once sign-in lands."
            icon={Building2}
            label="Workspace"
            title="Workspace"
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
              {WORKSPACE_FACTS.map((fact) => (
                <div className="flex flex-col" key={fact.label}>
                  <dt className="text-muted-foreground text-xs">
                    {fact.label}
                  </dt>
                  <dd className="text-sm">{fact.value}</dd>
                </div>
              ))}
            </dl>
            <Link
              className="flex w-fit items-center gap-1 text-blu text-sm underline-offset-2 hover:underline"
              href="/help"
            >
              How the team uses Blu CRM
              <ArrowRight aria-hidden className="size-3" />
            </Link>
          </SettingsCard>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-muted-foreground text-xs">
        <span>Blu.Builders Pty Ltd · Malaga, Western Australia</span>
        <span className="flex gap-3">
          <Link className="underline-offset-2 hover:underline" href="/">
            Dashboard
          </Link>
          <Link className="underline-offset-2 hover:underline" href="/reports">
            Reports
          </Link>
          <Link className="underline-offset-2 hover:underline" href="/help">
            Help
          </Link>
        </span>
      </footer>
    </main>
  );
}
