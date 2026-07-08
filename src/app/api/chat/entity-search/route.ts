import { and, eq, ilike, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { company, contact, deal } from "@/db/schema";
import { resolveAssistantUser } from "@/lib/ai/assistant-user";

// Typeahead for composer @-mentions (Assistant v3 Phase 4): a thin,
// session-gated lookup of deals and contacts by name. Small result sets by
// design; the composer shows at most five of each.

const RESULT_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

const escapeLike = (value: string): string =>
  value.replaceAll(/[%_\\]/g, "\\$&");

export async function GET(request: Request): Promise<Response> {
  const assistantUser = await resolveAssistantUser(request);
  if (!assistantUser) {
    return NextResponse.json(
      { error: "Sign in to use the assistant" },
      { status: 401 }
    );
  }
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ contacts: [], deals: [] });
  }
  const pattern = `%${escapeLike(query)}%`;

  const [deals, contacts] = await Promise.all([
    db
      .select({ id: deal.id, leadId: deal.leadId, title: deal.title })
      .from(deal)
      .where(
        and(
          isNull(deal.deletedAt),
          or(ilike(deal.title, pattern), ilike(deal.leadId, pattern))
        )
      )
      .limit(RESULT_LIMIT),
    db
      .select({
        companyName: company.name,
        id: contact.id,
        name: contact.name,
      })
      .from(contact)
      .leftJoin(company, eq(contact.companyId, company.id))
      .where(and(isNull(contact.deletedAt), ilike(contact.name, pattern)))
      .limit(RESULT_LIMIT),
  ]);

  return NextResponse.json({ contacts, deals });
}
