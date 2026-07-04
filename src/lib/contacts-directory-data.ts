import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type {
  DirectoryCompany,
  DirectoryPerson,
} from "@/components/contacts-directory";
import { db } from "@/db";
import {
  activity,
  company,
  contact,
  deal,
  followUp,
  pipelineStage,
  user,
} from "@/db/schema";

const openDealFilter = sql`not (${pipelineStage.isWon} or ${pipelineStage.isLost})`;

// Deal value follows FR-1.4: quoted value wins over the estimate.
const openDealCount = sql<number>`count(*) filter (where ${openDealFilter})::int`;
const openDealValue = sql<number>`coalesce(sum(coalesce(${deal.quotedValueCents}, ${deal.estimatedValueCents}, 0)) filter (where ${openDealFilter}), 0)::int`;

// Activities tag a contact directly (contact_id) or reach one through their
// deal; either way it counts as touching the person.
const activityContactId = sql<string>`coalesce(${activity.contactId}, ${deal.contactId})`;

// Only real communication counts as "contacted" — stage changes, notes, and
// system events move a deal, not the relationship. Mirrors the quick-log set
// that stamps deal.last_contact_at.
const TOUCH_ACTIVITY_TYPES = [
  "call",
  "email",
  "site_visit",
  "meeting",
] as const;

// The Neon HTTP driver returns raw timestamptz aggregates as ISO strings while
// the local pg driver parses them into Dates; normalise both for the client.
const toIsoOrNull = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  return new Date(value as string | Date).toISOString();
};

const laterIso = (a: string | null, b: string | null): string | null => {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return a > b ? a : b;
};

export interface ContactsDirectoryData {
  companies: DirectoryCompany[];
  people: DirectoryPerson[];
}

// Everything the directory needs, gathered as small parallel aggregates: one
// round trip of simple queries beats a single fan-out-prone mega-join on the
// serverless driver, and each rollup stays independently reviewable.
export const getContactsDirectoryData =
  async (): Promise<ContactsDirectoryData> => {
    const [
      peopleRows,
      dealRollups,
      activityRollups,
      followUpRollups,
      companyRows,
      companyPeople,
      companyDeals,
    ] = await Promise.all([
      db
        .select({
          id: contact.id,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          title: contact.title,
          companyName: company.name,
        })
        .from(contact)
        .leftJoin(company, eq(contact.companyId, company.id))
        .where(isNull(contact.deletedAt))
        .orderBy(contact.name),
      db
        .select({
          contactId: deal.contactId,
          openDeals: openDealCount,
          openValueCents: openDealValue,
          // The most advanced open stage becomes the row's stage chip; stage
          // names are read via the join, never stored (no FK by design).
          topOpenStage: sql<
            string | null
          >`(array_agg(${pipelineStage.name} order by ${pipelineStage.position} desc) filter (where ${openDealFilter}))[1]`,
          lastDealContactAt: sql<unknown>`max(${deal.lastContactAt})`,
          // Owner of the most recently touched open deal doubles as the
          // "whose relationship is this" signal without a contact.owner_id.
          ownerName: sql<
            string | null
          >`(array_agg(${user.name} order by ${deal.updatedAt} desc) filter (where ${openDealFilter} and ${user.name} is not null))[1]`,
        })
        .from(deal)
        .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
        .leftJoin(user, eq(deal.ownerId, user.id))
        .where(and(isNull(deal.deletedAt), isNotNull(deal.contactId)))
        .groupBy(deal.contactId),
      db
        .select({
          contactId: activityContactId,
          lastActivityAt: sql<unknown>`max(${activity.createdAt})`,
        })
        .from(activity)
        .innerJoin(deal, eq(activity.dealId, deal.id))
        .where(
          and(
            isNotNull(activityContactId),
            inArray(activity.type, [...TOUCH_ACTIVITY_TYPES])
          )
        )
        .groupBy(activityContactId),
      db
        .select({
          contactId: deal.contactId,
          nextFollowUpAt: sql<unknown>`min(${followUp.dueDate})`,
        })
        .from(followUp)
        .innerJoin(deal, eq(followUp.dealId, deal.id))
        .where(
          and(
            isNull(followUp.completedAt),
            isNull(deal.deletedAt),
            isNotNull(deal.contactId)
          )
        )
        .groupBy(deal.contactId),
      db
        .select({ id: company.id, name: company.name, kind: company.kind })
        .from(company)
        .where(isNull(company.deletedAt))
        .orderBy(company.name),
      db
        .select({
          companyId: contact.companyId,
          value: sql<number>`count(${contact.id})::int`,
        })
        .from(contact)
        .where(and(isNull(contact.deletedAt), isNotNull(contact.companyId)))
        .groupBy(contact.companyId),
      db
        .select({ companyId: deal.companyId, openValueCents: openDealValue })
        .from(deal)
        .innerJoin(pipelineStage, eq(deal.stageId, pipelineStage.id))
        .where(and(isNull(deal.deletedAt), isNotNull(deal.companyId)))
        .groupBy(deal.companyId),
    ]);

    const dealsByContact = new Map(
      dealRollups.map((row) => [row.contactId, row])
    );
    const lastActivityByContact = new Map(
      activityRollups.map((row) => [row.contactId, row.lastActivityAt])
    );
    const followUpByContact = new Map(
      followUpRollups.map((row) => [row.contactId, row.nextFollowUpAt])
    );

    const people: DirectoryPerson[] = peopleRows.map((row) => {
      const deals = dealsByContact.get(row.id);
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        title: row.title,
        companyName: row.companyName,
        openDeals: deals?.openDeals ?? 0,
        openValueCents: deals?.openValueCents ?? 0,
        topOpenStage: deals?.topOpenStage ?? null,
        ownerName: deals?.ownerName ?? null,
        lastContactAt: laterIso(
          toIsoOrNull(deals?.lastDealContactAt),
          toIsoOrNull(lastActivityByContact.get(row.id))
        ),
        nextFollowUpAt: toIsoOrNull(followUpByContact.get(row.id)),
      };
    });

    const peopleByCompany = new Map(
      companyPeople.map((row) => [row.companyId, row.value])
    );
    const valueByCompany = new Map(
      companyDeals.map((row) => [row.companyId, row.openValueCents])
    );
    const companies: DirectoryCompany[] = companyRows.map((entry) => ({
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      peopleCount: peopleByCompany.get(entry.id) ?? 0,
      openValueCents: valueByCompany.get(entry.id) ?? 0,
    }));

    return { companies, people };
  };
