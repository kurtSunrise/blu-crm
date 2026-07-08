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
  // Entities @-mentioned in the composer (Assistant v3 Phase 4). Only ids
  // travel from the client; the headers are looked up here like everything
  // else. Capped at MAX_MENTIONED_ENTITIES each.
  mentionedContactIds?: string[];
  mentionedDealIds?: string[];
  pathname: string;
}

const MAX_MENTIONED_ENTITIES = 5;

// The URL is the reliable source of truth for the open entity: the client may
// not register it (e.g. the chat was opened on another page first), but the
// pathname always carries the id. These derive the internal id from the path so
// the assistant knows which deal/contact/company the user is viewing.
const DEAL_PATH = /^\/deals\/([^/]+)$/;
const CONTACT_PATH = /^\/contacts\/([^/]+)$/;
const COMPANY_PATH = /^\/companies\/([^/]+)$/;

const dealIdFromPath = (pathname: string): string | undefined => {
  const id = DEAL_PATH.exec(pathname)?.[1];
  // /deals/new is the quick-add form, not a deal id.
  return id === "new" ? undefined : id;
};

const contactIdFromPath = (pathname: string): string | undefined =>
  CONTACT_PATH.exec(pathname)?.[1];

const companyIdFromPath = (pathname: string): string | undefined =>
  COMPANY_PATH.exec(pathname)?.[1];

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

// "viewing" is the open page's entity; "mentioned" is an @-mention typed
// into the composer. Same lookup, different framing in the prompt.
type EntityRelation = "mentioned" | "viewing";

const dealHeader = async (
  dealId: string,
  relation: EntityRelation
): Promise<string | null> => {
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

  if (relation === "mentioned") {
    return `The user mentioned deal ${parts.join(", ")}. Use get_deal for its full record.`;
  }
  return `The user is viewing deal ${parts.join(", ")}. Use get_deal for its full record before answering detailed questions about it.`;
};

const contactHeader = async (
  contactId: string,
  relation: EntityRelation
): Promise<string | null> => {
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
  if (relation === "mentioned") {
    return `The user mentioned contact ${row.name}${suffix}. Use get_contact for their full record.`;
  }
  return `The user is viewing contact ${row.name}${suffix}. Use get_contact for their full record.`;
};

const companyHeader = async (companyId: string): Promise<string | null> => {
  const rows = await db
    .select({ kind: company.kind, name: company.name })
    .from(company)
    .where(eq(company.id, companyId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }
  const suffix = row.kind ? ` (${row.kind})` : "";
  return `The user is viewing company ${row.name}${suffix}. Use get_company for its full record.`;
};

export const buildPageContext = async (
  input: PageContextInput,
  userName: string,
  // Server-derived ids of audio chat_attachments on this message. The audio
  // itself never reaches the model, so this line is the ONLY way it can learn
  // the id log_activity needs to file the recording (FR-7.7).
  voiceNoteAttachmentIds: string[] = []
): Promise<string> => {
  const lines: string[] = [
    `Today is ${formatDateAwst(new Date())} (AWST).`,
    `You are talking to ${userName}.`,
    `They are looking at ${describePage(input.pathname)}.`,
  ];

  // Prefer the client-registered id, fall back to the id in the pathname.
  const dealId = input.dealId ?? dealIdFromPath(input.pathname);
  const contactId = input.contactId ?? contactIdFromPath(input.pathname);
  const companyId = companyIdFromPath(input.pathname);

  // Mentions duplicating the viewed entity add nothing; drop them. The zod
  // layer already caps these, the slice is defensive for other callers.
  const mentionedDealIds = (input.mentionedDealIds ?? [])
    .filter((id) => id !== dealId)
    .slice(0, MAX_MENTIONED_ENTITIES);
  const mentionedContactIds = (input.mentionedContactIds ?? [])
    .filter((id) => id !== contactId)
    .slice(0, MAX_MENTIONED_ENTITIES);

  // Every header lookup is independent; fan them out together (sequential
  // Neon awaits in one request are what caused the deal-page 503s).
  const [viewedDeal, viewedContact, viewedCompany, ...mentioned] =
    await Promise.all([
      dealId ? dealHeader(dealId, "viewing") : Promise.resolve(null),
      contactId ? contactHeader(contactId, "viewing") : Promise.resolve(null),
      companyId ? companyHeader(companyId) : Promise.resolve(null),
      ...mentionedDealIds.map((id) => dealHeader(id, "mentioned")),
      ...mentionedContactIds.map((id) => contactHeader(id, "mentioned")),
    ]);

  for (const header of [
    viewedDeal,
    viewedContact,
    viewedCompany,
    ...mentioned,
  ]) {
    if (header) {
      lines.push(header);
    }
  }

  for (const id of voiceNoteAttachmentIds.slice(0, MAX_MENTIONED_ENTITIES)) {
    lines.push(
      `A voice note is attached to this message (audioAttachmentId: ${id}). When the user asks to file or log this note as an activity, pass this id to log_activity's audioAttachmentId so the recording is attached.`
    );
  }

  return `<page_context>\n${lines.join("\n")}\n</page_context>`;
};
