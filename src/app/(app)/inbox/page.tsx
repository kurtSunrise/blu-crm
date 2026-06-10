import { and, asc, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { InboxTriage } from "@/components/inbox-triage";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { contact, deal, user } from "@/db/schema";
import { formatDateTimeAwst } from "@/lib/format";
import { LEAD_SOURCE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

// Leads inbox (FR-3.5): new and unassigned leads from every intake channel
// land here for triage: assign an owner, open to qualify, or discard.
export default async function InboxPage() {
  const users = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(user.name));

  const leads = await db
    .select({
      id: deal.id,
      leadId: deal.leadId,
      title: deal.title,
      source: deal.source,
      scopeSummary: deal.scopeSummary,
      createdAt: deal.createdAt,
      contactName: contact.name,
      contactEmail: contact.email,
    })
    .from(deal)
    .leftJoin(contact, eq(deal.contactId, contact.id))
    .where(and(isNull(deal.ownerId), isNull(deal.deletedAt)))
    .orderBy(desc(deal.createdAt));

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">Inbox</h1>
        <p className="text-muted-foreground text-sm">
          New and unassigned leads from every channel. Assign an owner, open to
          qualify, or discard.
        </p>
      </header>

      {leads.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Inbox zero. New web enquiries and forwarded emails will land here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {leads.map((lead) => (
            <li
              className="flex flex-col gap-3 rounded-lg border bg-card p-4"
              key={lead.id}
            >
              <Link className="flex flex-col gap-1" href={`/deals/${lead.id}`}>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-muted-foreground text-xs">
                    {lead.leadId}
                  </p>
                  <Badge variant="secondary">
                    {LEAD_SOURCE_LABELS[lead.source] ?? lead.source}
                  </Badge>
                </div>
                <h2 className="font-medium text-sm">{lead.title}</h2>
                <p className="truncate text-muted-foreground text-xs">
                  {lead.contactName ?? "No contact"}
                  {lead.contactEmail ? ` · ${lead.contactEmail}` : ""}
                  {` · ${formatDateTimeAwst(lead.createdAt)}`}
                </p>
                {lead.scopeSummary && (
                  <p className="line-clamp-2 text-muted-foreground text-sm">
                    {lead.scopeSummary}
                  </p>
                )}
              </Link>
              <InboxTriage
                dealId={lead.id}
                dealTitle={lead.title}
                users={users}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
