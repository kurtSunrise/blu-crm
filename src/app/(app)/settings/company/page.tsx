import {
  ArrowRight,
  Building2,
  FileUp,
  Globe,
  Inbox,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { CopyLinkButton } from "@/components/copy-link-button";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · Company | Blu CRM",
};

export const dynamic = "force-dynamic";

const WORKSPACE_FACTS = [
  { label: "Business", value: "Blu.Builders Pty Ltd" },
  { label: "Based in", value: "Malaga, Western Australia" },
  { label: "Currency", value: "AUD" },
  { label: "Timezone", value: "AWST (Perth)" },
] as const;

export default async function CompanySettingsPage() {
  await requireSession();
  const emailIntakeConfigured = Boolean(process.env.EMAIL_INTAKE_TOKEN);

  return (
    <>
      <SettingsSection
        description="Where this workspace is anchored. These details appear on quotes and shared links."
        icon={Building2}
        title="Company"
      >
        <SettingsPanel>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {WORKSPACE_FACTS.map((fact) => (
              <div className="flex flex-col" key={fact.label}>
                <dt className="text-muted-foreground text-xs">{fact.label}</dt>
                <dd className="text-sm">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="Every channel lands in the same Inbox, so no enquiry depends on someone checking email."
        icon={Inbox}
        title="Lead intake"
      >
        <SettingsPanel>
          <ul className="flex flex-col gap-2">
            <li className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <Globe aria-hidden className="size-4.5 shrink-0 text-blu" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm">Public enquiry form</p>
                <p className="text-muted-foreground text-xs">
                  Share this link on the website or socials; submissions arrive
                  in the Inbox tagged Web.
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
              <Badge variant={emailIntakeConfigured ? "secondary" : "outline"}>
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
        </SettingsPanel>
      </SettingsSection>

      <SettingsSection
        description="Bring existing records across from spreadsheets. Deletes everywhere in the app are soft, so history is never lost."
        icon={FileUp}
        title="Data"
      >
        <SettingsPanel>
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
        </SettingsPanel>
      </SettingsSection>
    </>
  );
}
