import { eq } from "drizzle-orm";
import { db } from "@/db";
import { company, contact, deal, pipelineStage } from "@/db/schema";
import { formatAudFromCents, formatDateAwst } from "@/lib/format";

// Least-context principle (PRD §9.3): the client sends only ids and a
// pathname; this module looks up minimal entity headers server-side. Client
// supplied entity *data* is never trusted, and no bulk records enter the
// prompt. The block lives in the user turn so the cached system prefix stays
// byte-stable.

export interface PageContextInput {
  contactId?: string;
  dealId?: string;
  pathname: string;
}

const PAGE_DESCRIPTIONS: Record<string, string> = {
  "/": "the dashboard (today's follow-ups, alerts, pipeline summary)",
  "/calendar": "the calendar of fixed dates and follow-ups",
  "/contacts": "the contacts directory",
  "/deals/new": "the quick-add form for capturing a new lead",
  "/inbox": "the inbox of unassigned leads awaiting triage",
  "/pipeline": "the pipeline kanban board",
  "/reports": "the reports view",
  "/tasks": "the follow-up task list",
};

const describePage = (pathname: string): string => {
  const exact = PAGE_DESCRIPTIONS[pathname];
  if (exact) {
    return exact;
  }
  if (pathname.startsWith("/deals/")) {
    return "a deal detail page";
  }
  if (pathname.startsWith("/contacts/")) {
    return "a contact detail page";
  }
  if (pathname.startsWith("/companies/")) {
    return "a company detail page";
  }
  return "the app";
};

const dealHeader = async (dealId: string): Promise<string | null> => {
  const rows = await db
    .select({
      companyName: company.name,
      contactName: contact.name,
      estimatedValueCents: deal.estimatedValueCents,
      fixedDate: deal.fixedDate,
      leadId: deal.leadId,
      quotedValueCents: deal.quotedValueCents,
      stageName: pipelineStage.name,
      title: deal.title,
    })
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .leftJoin(contact, eq(deal.contactId, contact.id))
    .where(eq(deal.id, dealId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const valueCents = row.quotedValueCents ?? row.estimatedValueCents;
  const parts = [
    `${row.leadId} "${row.title}"`,
    `stage: ${row.stageName}`,
    row.companyName ? `company: ${row.companyName}` : null,
    row.contactName ? `contact: ${row.contactName}` : null,
    valueCents === null ? null : `value: ${formatAudFromCents(valueCents)}`,
    row.fixedDate ? `fixed date: ${formatDateAwst(row.fixedDate)}` : null,
  ].filter((part): part is string => part !== null);

  return `The user is viewing deal ${parts.join(", ")}. Use get_deal for its full record before answering detailed questions about it.`;
};

const contactHeader = async (contactId: string): Promise<string | null> => {
  const rows = await db
    .select({ companyName: company.name, name: contact.name })
    .from(contact)
    .leftJoin(company, eq(contact.companyId, company.id))
    .where(eq(contact.id, contactId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  const suffix = row.companyName ? ` (${row.companyName})` : "";
  return `The user is viewing contact ${row.name}${suffix}. Use get_contact for their full record.`;
};

export const buildPageContext = async (
  input: PageContextInput,
  userName: string
): Promise<string> => {
  const lines: string[] = [
    `Today is ${formatDateAwst(new Date())} (AWST).`,
    `You are talking to ${userName}.`,
    `They are looking at ${describePage(input.pathname)}.`,
  ];

  if (input.dealId) {
    const header = await dealHeader(input.dealId);
    if (header) {
      lines.push(header);
    }
  }
  if (input.contactId) {
    const header = await contactHeader(input.contactId);
    if (header) {
      lines.push(header);
    }
  }

  return `<page_context>\n${lines.join("\n")}\n</page_context>`;
};
