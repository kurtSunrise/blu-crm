"use client";

import Link from "next/link";

// Client mirror of the server's DealSummary serialization (formatted
// strings; no live Date/cents values cross the wire).
export interface DealSummaryData {
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

export interface DealListData {
  deals: DealSummaryData[];
  title?: string;
}

function DealRow({ deal }: { deal: DealSummaryData }) {
  return (
    <li>
      <Link
        className="flex min-h-14 flex-col justify-center gap-0.5 rounded-md border bg-background px-3 py-2 transition-colors hover:border-blu/50"
        href={`/deals/${deal.id}`}
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium text-sm">{deal.title}</span>
          {deal.value ? (
            <span className="shrink-0 font-medium text-blu text-sm">
              {deal.value}
            </span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
          <span>{deal.leadId}</span>
          <span aria-hidden>·</span>
          <span>{deal.stage}</span>
          {deal.company ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{deal.company}</span>
            </>
          ) : null}
          {deal.fixedDate ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {deal.fixedDateType ?? "fixed"} {deal.fixedDate}
              </span>
            </>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function DealListArtifact({ data }: { data: DealListData }) {
  if (data.deals.length === 0) {
    return null;
  }
  return (
    <section
      aria-label={data.title ?? "Deals"}
      className="my-2 rounded-lg border bg-muted/30 p-2"
    >
      {data.title ? (
        <h3 className="px-1 pb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {data.title}
        </h3>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {data.deals.map((deal) => (
          <DealRow deal={deal} key={deal.id} />
        ))}
      </ul>
    </section>
  );
}
