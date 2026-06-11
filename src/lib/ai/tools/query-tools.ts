import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  activity,
  company,
  contact,
  deal,
  followUp,
  pipelineStage,
  quote,
  user,
} from "@/db/schema";
import type { ArtifactPayload } from "@/lib/ai/stream-protocol";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import {
  awstDayDiff,
  formatAudFromCents,
  formatDateAwst,
  MS_PER_DAY,
} from "@/lib/format";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ACTIVITY_LIMIT = 10;
const CENTS_PER_DOLLAR = 100;

export interface DealSummary {
  company: string | null;
  contact: string | null;
  daysSinceContact: number | null;
  expectedCloseDate: string | null;
  fixedDate: string | null;
  fixedDateType: string | null;
  id: string;
  leadId: string;
  owner: string | null;
  stage: string;
  title: string;
  value: string | null;
}

const dealValue = sql<
  number | null
>`coalesce(${deal.quotedValueCents}, ${deal.estimatedValueCents})`;

const lastTouch = sql<Date>`coalesce(${deal.lastContactAt}, ${deal.createdAt})`;

const dealSummaryColumns = {
  companyName: company.name,
  contactName: contact.name,
  expectedCloseDate: deal.expectedCloseDate,
  fixedDate: deal.fixedDate,
  fixedDateType: deal.fixedDateType,
  id: deal.id,
  lastContactAt: deal.lastContactAt,
  createdAt: deal.createdAt,
  leadId: deal.leadId,
  ownerName: user.name,
  stageName: pipelineStage.name,
  title: deal.title,
  valueCents: dealValue,
};

interface DealSummaryRow {
  companyName: string | null;
  contactName: string | null;
  createdAt: Date;
  expectedCloseDate: Date | null;
  fixedDate: Date | null;
  fixedDateType: string | null;
  id: string;
  lastContactAt: Date | null;
  leadId: string;
  ownerName: string | null;
  stageName: string;
  title: string;
  valueCents: number | null;
}

const toDealSummary = (row: DealSummaryRow): DealSummary => ({
  company: row.companyName,
  contact: row.contactName,
  daysSinceContact: -awstDayDiff(row.lastContactAt ?? row.createdAt),
  expectedCloseDate: row.expectedCloseDate
    ? formatDateAwst(row.expectedCloseDate)
    : null,
  fixedDate: row.fixedDate ? formatDateAwst(row.fixedDate) : null,
  fixedDateType: row.fixedDateType,
  id: row.id,
  leadId: row.leadId,
  owner: row.ownerName,
  stage: row.stageName,
  title: row.title,
  value: row.valueCents === null ? null : formatAudFromCents(row.valueCents),
});

const dealListArtifact = (
  title: string,
  deals: DealSummary[]
): ArtifactPayload => ({
  artifactType: "deal_list",
  data: { deals, title },
  type: "artifact",
});

const queryDealsSchema = z.object({
  closingWithinDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Only deals whose fixed date or expected close date falls within this many days"
    ),
  limit: z.number().int().positive().max(MAX_LIMIT).optional(),
  maxValueDollars: z.number().positive().optional(),
  minValueDollars: z.number().positive().optional(),
  ownerName: z
    .string()
    .optional()
    .describe("Filter to deals owned by this team member (partial name ok)"),
  search: z
    .string()
    .optional()
    .describe("Match against deal title, lead ID, or company name"),
  staleDays: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Only deals with no logged contact for at least this many days"),
  stageName: z
    .string()
    .optional()
    .describe("Filter by stage name (partial ok)"),
  status: z
    .enum(["open", "won", "lost", "all"])
    .optional()
    .describe("Defaults to open (not won, not lost)"),
});

const queryDeals = defineTool({
  description:
    "Search and filter deals in the pipeline. Call this when the user asks about groups of deals: quiet or stale deals, deals closing soon, a team member's deals, deals over a value, or a text search. Returns matching deals and shows them to the user as cards.",
  execute: (input) => runQueryDeals(input),
  isWrite: false,
  name: "query_deals",
  schema: queryDealsSchema,
});

const queryOrder = (input: z.infer<typeof queryDealsSchema>) => {
  if (input.staleDays !== undefined) {
    return asc(lastTouch);
  }
  if (input.closingWithinDays !== undefined) {
    return asc(sql`least(${deal.fixedDate}, ${deal.expectedCloseDate})`);
  }
  return desc(deal.createdAt);
};

const runQueryDeals = async (input: z.infer<typeof queryDealsSchema>) => {
  const conditions: SQL[] = [isNull(deal.deletedAt)];

  const status = input.status ?? "open";
  if (status === "open") {
    conditions.push(
      eq(pipelineStage.isWon, false),
      eq(pipelineStage.isLost, false)
    );
  } else if (status === "won") {
    conditions.push(eq(pipelineStage.isWon, true));
  } else if (status === "lost") {
    conditions.push(eq(pipelineStage.isLost, true));
  }

  if (input.stageName) {
    conditions.push(ilike(pipelineStage.name, `%${input.stageName}%`));
  }
  if (input.ownerName) {
    conditions.push(ilike(user.name, `%${input.ownerName}%`));
  }
  if (input.search) {
    const term = `%${input.search}%`;
    const searchCondition = or(
      ilike(deal.title, term),
      ilike(deal.leadId, term),
      ilike(company.name, term)
    );
    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }
  if (input.staleDays !== undefined) {
    const cutoff = new Date(Date.now() - input.staleDays * MS_PER_DAY);
    conditions.push(sql`${lastTouch} <= ${cutoff}`);
  }
  if (input.closingWithinDays !== undefined) {
    const horizon = new Date(Date.now() + input.closingWithinDays * MS_PER_DAY);
    const closingCondition = or(
      sql`${deal.fixedDate} <= ${horizon}`,
      sql`${deal.expectedCloseDate} <= ${horizon}`
    );
    if (closingCondition) {
      conditions.push(closingCondition);
    }
  }
  if (input.minValueDollars !== undefined) {
    conditions.push(
      sql`${dealValue} >= ${input.minValueDollars * CENTS_PER_DOLLAR}`
    );
  }
  if (input.maxValueDollars !== undefined) {
    conditions.push(
      sql`${dealValue} <= ${input.maxValueDollars * CENTS_PER_DOLLAR}`
    );
  }

  const rows = await db
    .select(dealSummaryColumns)
    .from(deal)
    .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
    .leftJoin(company, eq(deal.companyId, company.id))
    .leftJoin(contact, eq(deal.contactId, contact.id))
    .leftJoin(user, eq(deal.ownerId, user.id))
    .where(and(...conditions))
    .orderBy(queryOrder(input))
    .limit(input.limit ?? DEFAULT_LIMIT);

  const deals = rows.map(toDealSummary);
  if (deals.length === 0) {
    return { resultText: "No deals matched these filters." };
  }
  return {
    artifacts: [dealListArtifact("Matching deals", deals)],
    resultText: JSON.stringify(deals),
  };
};

const getDealSchema = z
  .object({
    dealId: z.string().optional().describe("Internal deal id"),
    leadId: z.string().optional().describe("Lead reference like BLU-2026-014"),
  })
  .refine((value) => Boolean(value.dealId ?? value.leadId), {
    message: "Provide dealId or leadId",
  });

const getDeal = defineTool({
  description:
    "Fetch one deal's full record: fields, recent activity timeline, open follow-ups, and quotes. Call this before summarising, discussing, or proposing changes to a specific deal.",
  execute: async (input) => {
    const matcher = input.dealId
      ? eq(deal.id, input.dealId)
      : eq(deal.leadId, input.leadId ?? "");

    const rows = await db
      .select({
        ...dealSummaryColumns,
        decisionMakerConfirmed: deal.decisionMakerConfirmed,
        notes: deal.notes,
        projectType: deal.projectType,
        scopeSummary: deal.scopeSummary,
        source: deal.source,
        venue: deal.venue,
      })
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .leftJoin(company, eq(deal.companyId, company.id))
      .leftJoin(contact, eq(deal.contactId, contact.id))
      .leftJoin(user, eq(deal.ownerId, user.id))
      .where(matcher)
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { resultText: "No deal found for that id." };
    }

    const [activities, followUps, quotes] = await Promise.all([
      db
        .select({
          content: activity.content,
          createdAt: activity.createdAt,
          type: activity.type,
        })
        .from(activity)
        .where(eq(activity.dealId, row.id))
        .orderBy(desc(activity.createdAt))
        .limit(ACTIVITY_LIMIT),
      db
        .select({
          action: followUp.action,
          completedAt: followUp.completedAt,
          dueDate: followUp.dueDate,
          ownerName: user.name,
        })
        .from(followUp)
        .innerJoin(user, eq(followUp.ownerId, user.id))
        .where(eq(followUp.dealId, row.id))
        .orderBy(desc(followUp.dueDate)),
      db
        .select({
          sentAt: quote.sentAt,
          status: quote.status,
          valueCents: quote.valueCents,
        })
        .from(quote)
        .where(eq(quote.dealId, row.id))
        .orderBy(desc(quote.createdAt)),
    ]);

    const detail = {
      ...toDealSummary(row),
      activities: activities.map((entry) => ({
        content: entry.content,
        date: formatDateAwst(entry.createdAt),
        type: entry.type,
      })),
      decisionMakerConfirmed: row.decisionMakerConfirmed,
      followUps: followUps.map((entry) => ({
        action: entry.action,
        done: entry.completedAt !== null,
        dueDate: formatDateAwst(entry.dueDate),
        owner: entry.ownerName,
      })),
      notes: row.notes,
      projectType: row.projectType,
      quotes: quotes.map((entry) => ({
        sentAt: entry.sentAt ? formatDateAwst(entry.sentAt) : null,
        status: entry.status,
        value:
          entry.valueCents === null
            ? null
            : formatAudFromCents(entry.valueCents),
      })),
      scopeSummary: row.scopeSummary,
      source: row.source,
      venue: row.venue,
    };

    return {
      artifacts: [
        { artifactType: "deal_card", data: detail, type: "artifact" },
      ],
      resultText: JSON.stringify(detail),
    };
  },
  isWrite: false,
  name: "get_deal",
  schema: getDealSchema,
});

const getContactSchema = z
  .object({
    contactId: z.string().optional(),
    name: z.string().optional().describe("Contact name (partial ok)"),
  })
  .refine((value) => Boolean(value.contactId ?? value.name), {
    message: "Provide contactId or name",
  });

const getContact = defineTool({
  description:
    "Fetch a contact with their company and deals. Call this before summarising a client or drafting communication addressed to them.",
  execute: async (input) => {
    const matcher = input.contactId
      ? eq(contact.id, input.contactId)
      : ilike(contact.name, `%${input.name ?? ""}%`);

    const rows = await db
      .select({
        companyName: company.name,
        email: contact.email,
        id: contact.id,
        name: contact.name,
        notes: contact.notes,
        phone: contact.phone,
        title: contact.title,
      })
      .from(contact)
      .leftJoin(company, eq(contact.companyId, company.id))
      .where(and(matcher, isNull(contact.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { resultText: "No contact found." };
    }

    const dealRows = await db
      .select(dealSummaryColumns)
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .leftJoin(company, eq(deal.companyId, company.id))
      .leftJoin(contact, eq(deal.contactId, contact.id))
      .leftJoin(user, eq(deal.ownerId, user.id))
      .where(and(eq(deal.contactId, row.id), isNull(deal.deletedAt)))
      .orderBy(desc(deal.createdAt))
      .limit(DEFAULT_LIMIT);

    const result = { ...row, deals: dealRows.map(toDealSummary) };
    return { resultText: JSON.stringify(result) };
  },
  isWrite: false,
  name: "get_contact",
  schema: getContactSchema,
});

const getCompanySchema = z
  .object({
    companyId: z.string().optional(),
    name: z.string().optional().describe("Company name (partial ok)"),
  })
  .refine((value) => Boolean(value.companyId ?? value.name), {
    message: "Provide companyId or name",
  });

const getCompany = defineTool({
  description:
    "Fetch a company with its contacts and deals. Call this before summarising a client organisation.",
  execute: async (input) => {
    const matcher = input.companyId
      ? eq(company.id, input.companyId)
      : ilike(company.name, `%${input.name ?? ""}%`);

    const rows = await db
      .select({
        id: company.id,
        kind: company.kind,
        name: company.name,
        notes: company.notes,
        website: company.website,
      })
      .from(company)
      .where(and(matcher, isNull(company.deletedAt)))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return { resultText: "No company found." };
    }

    const [contacts, dealRows] = await Promise.all([
      db
        .select({
          email: contact.email,
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          title: contact.title,
        })
        .from(contact)
        .where(and(eq(contact.companyId, row.id), isNull(contact.deletedAt))),
      db
        .select(dealSummaryColumns)
        .from(deal)
        .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
        .leftJoin(company, eq(deal.companyId, company.id))
        .leftJoin(contact, eq(deal.contactId, contact.id))
        .leftJoin(user, eq(deal.ownerId, user.id))
        .where(and(eq(deal.companyId, row.id), isNull(deal.deletedAt)))
        .orderBy(desc(deal.createdAt))
        .limit(DEFAULT_LIMIT),
    ]);

    const result = { ...row, contacts, deals: dealRows.map(toDealSummary) };
    return { resultText: JSON.stringify(result) };
  },
  isWrite: false,
  name: "get_company",
  schema: getCompanySchema,
});

const listPipelineStages = defineTool({
  description:
    "List the pipeline stages with their ids, order, forecast weighting, and won/lost flags. Call this before referring to a stage by name or proposing a stage move.",
  execute: async () => {
    const rows = await db
      .select({
        id: pipelineStage.id,
        isLost: pipelineStage.isLost,
        isWon: pipelineStage.isWon,
        name: pipelineStage.name,
        position: pipelineStage.position,
        weighting: pipelineStage.weighting,
      })
      .from(pipelineStage)
      .orderBy(asc(pipelineStage.position));
    return { resultText: JSON.stringify(rows) };
  },
  isWrite: false,
  name: "list_pipeline_stages",
  schema: z.object({}),
});

const listTeamMembers = defineTool({
  description:
    "List the team members with their ids, names, and roles. Call this before assigning an owner or filtering by a person.",
  execute: async () => {
    const rows = await db
      .select({ id: user.id, name: user.name, role: user.role })
      .from(user)
      .orderBy(asc(user.name));
    return { resultText: JSON.stringify(rows) };
  },
  isWrite: false,
  name: "list_team_members",
  schema: z.object({}),
});

const getInboxLeads = defineTool({
  description:
    "List the unassigned leads sitting in the inbox awaiting triage. Call this when the user asks what is in the inbox or wants help triaging.",
  execute: async () => {
    const rows = await db
      .select(dealSummaryColumns)
      .from(deal)
      .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
      .leftJoin(company, eq(deal.companyId, company.id))
      .leftJoin(contact, eq(deal.contactId, contact.id))
      .leftJoin(user, eq(deal.ownerId, user.id))
      .where(and(isNull(deal.deletedAt), isNull(deal.ownerId)))
      .orderBy(desc(deal.createdAt))
      .limit(MAX_LIMIT);

    const deals = rows.map(toDealSummary);
    if (deals.length === 0) {
      return { resultText: "The inbox is empty: no unassigned leads." };
    }
    return {
      artifacts: [dealListArtifact("Inbox: unassigned leads", deals)],
      resultText: JSON.stringify(deals),
    };
  },
  isWrite: false,
  name: "get_inbox_leads",
  schema: z.object({}),
});

export const queryTools: AiTool[] = [
  queryDeals,
  getDeal,
  getContact,
  getCompany,
  listPipelineStages,
  listTeamMembers,
  getInboxLeads,
];
