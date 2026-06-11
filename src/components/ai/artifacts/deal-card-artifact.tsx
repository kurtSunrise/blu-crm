"use client";

import Link from "next/link";
import type { DealSummaryData } from "@/components/ai/artifacts/deal-list-artifact";

export interface DealCardData extends DealSummaryData {
  activities: { content: string | null; date: string; type: string }[];
  decisionMakerConfirmed: boolean;
  followUps: {
    action: string;
    done: boolean;
    dueDate: string;
    owner: string;
  }[];
  notes: string | null;
  projectType: string | null;
  quotes: { sentAt: string | null; status: string; value: string | null }[];
  scopeSummary: string | null;
  source: string | null;
  venue: string | null;
}

const RECENT_ACTIVITY_COUNT = 3;

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return null;
  }
  return (
    <div className="flex flex-col">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export function DealCardArtifact({ data }: { data: DealCardData }) {
  const openFollowUps = data.followUps.filter((entry) => !entry.done);
  return (
    <section
      aria-label={`Deal ${data.leadId}`}
      className="my-2 rounded-lg border bg-muted/30 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            className="font-medium text-sm underline-offset-2 hover:underline"
            href={`/deals/${data.id}`}
          >
            {data.title}
          </Link>
          <p className="text-muted-foreground text-xs">
            {data.leadId} · {data.stage}
          </p>
        </div>
        {data.value ? (
          <span className="shrink-0 font-semibold text-blu text-sm">
            {data.value}
          </span>
        ) : null}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Company" value={data.company} />
        <Field label="Contact" value={data.contact} />
        <Field label="Owner" value={data.owner ?? "Unassigned"} />
        <Field label="Venue" value={data.venue} />
        <Field
          label="Fixed date"
          value={
            data.fixedDate
              ? `${data.fixedDate}${data.fixedDateType ? ` (${data.fixedDateType})` : ""}`
              : null
          }
        />
        <Field label="Expected close" value={data.expectedCloseDate} />
      </dl>

      {data.scopeSummary ? (
        <p className="mt-3 text-muted-foreground text-sm">
          {data.scopeSummary}
        </p>
      ) : null}

      {openFollowUps.length > 0 ? (
        <div className="mt-3">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Next actions
          </h4>
          <ul className="mt-1 flex flex-col gap-1">
            {openFollowUps.map((entry) => (
              <li
                className="text-sm"
                key={`${entry.action}-${entry.dueDate}`}
              >
                {entry.action}{" "}
                <span className="text-muted-foreground text-xs">
                  ({entry.owner}, due {entry.dueDate})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.activities.length > 0 ? (
        <div className="mt-3">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Recent activity
          </h4>
          <ul className="mt-1 flex flex-col gap-1">
            {data.activities.slice(0, RECENT_ACTIVITY_COUNT).map((entry) => (
              <li
                className="text-muted-foreground text-xs"
                key={`${entry.type}-${entry.date}-${entry.content ?? ""}`}
              >
                <span className="font-medium text-foreground">
                  {entry.type.replaceAll("_", " ")}
                </span>{" "}
                {entry.date}
                {entry.content ? ` — ${entry.content}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
