"use client";

import {
  ArrowRightLeft,
  CheckCircle2,
  FileText,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  StickyNote,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDateTimeAwst, formatRelativeDayAwst } from "@/lib/format";
import { cn } from "@/lib/utils";

// Hovering a timeline row surfaces how long ago it happened, relative to today.
// The exact timestamp already shows on the row, so the tooltip is relative-only
// ("Today", "Yesterday", "5 days ago").
function RelativeDayTooltip({
  date,
  children,
}: {
  date: Date;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{formatRelativeDayAwst(date)}</TooltipContent>
    </Tooltip>
  );
}

export interface TimelineEntry {
  authorName: string | null;
  content: string | null;
  // Where the entry happened, when the timeline spans records (a contact's
  // history covers several deals); omitted on the deal page itself.
  context?: { href: string; label: string };
  createdAt: Date;
  id: string;
  type: string;
}

interface EntryStyle {
  icon: typeof Phone;
  label: string;
  // Marker colouring: brand for pipeline movement, quote tint for quotes,
  // neutral for day-to-day contact logging.
  marker: string;
}

const ENTRY_STYLES: Record<string, EntryStyle> = {
  call: { label: "Call", icon: Phone, marker: "" },
  email: { label: "Email", icon: Mail, marker: "" },
  site_visit: { label: "Site visit", icon: MapPin, marker: "" },
  meeting: { label: "Meeting", icon: Users, marker: "" },
  note: { label: "Note", icon: StickyNote, marker: "" },
  stage_change: {
    label: "Stage change",
    icon: ArrowRightLeft,
    marker: "border-blu/40 bg-blu/10 text-blu",
  },
  quote_event: {
    label: "Quote",
    icon: FileText,
    marker: "border-success/40 bg-success/10 text-success",
  },
  follow_up: {
    label: "Follow-up completed",
    icon: CheckCircle2,
    marker: "border-success/40 bg-success/10 text-success",
  },
};

const FALLBACK_STYLE: EntryStyle = {
  label: "Activity",
  icon: StickyNote,
  marker: "",
};

// Shared so other surfaces (e.g. the daily status report) render an activity
// with the same icon, label, and marker colour as the deal-page timeline.
export const getEntryStyle = (type: string): EntryStyle =>
  ENTRY_STYLES[type] ?? FALLBACK_STYLE;

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const style = getEntryStyle(entry.type);
  const Icon = style.icon;

  return (
    // The "Lead created" marker always follows, so every activity row keeps
    // its connecting line down to the next item.
    <li className="relative flex gap-3 pb-5">
      <span
        aria-hidden
        className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border"
      />
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground",
          style.marker
        )}
      >
        <Icon aria-hidden className="size-3.5" />
      </span>
      <RelativeDayTooltip date={entry.createdAt}>
        <div className="flex min-w-0 flex-1 cursor-help flex-col gap-0.5 pt-1">
          <p className="text-xs">
            <span className="font-medium">{style.label}</span>
            <span className="text-muted-foreground">
              {entry.authorName ? ` · ${entry.authorName}` : ""}
              {` · ${formatDateTimeAwst(entry.createdAt)}`}
            </span>
          </p>
          {entry.content && (
            <p className="break-words text-sm">{entry.content}</p>
          )}
          {entry.context && (
            <Link
              className="w-fit text-blu text-xs underline-offset-2 hover:underline"
              href={entry.context.href}
            >
              {entry.context.label}
            </Link>
          )}
        </div>
      </RelativeDayTooltip>
    </li>
  );
}

export function DealTimeline({
  entries,
  leadCreatedAt,
  footerLabel = "Lead created",
}: {
  entries: TimelineEntry[];
  leadCreatedAt: Date;
  footerLabel?: string;
}) {
  return (
    <ol className="flex flex-col">
      {entries.map((entry) => (
        <TimelineItem entry={entry} key={entry.id} />
      ))}
      <li className="relative flex gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-blu/40 bg-blu/10 text-blu">
          <Sparkles aria-hidden className="size-3.5" />
        </span>
        <RelativeDayTooltip date={leadCreatedAt}>
          <div className="flex min-w-0 flex-1 cursor-help flex-col gap-0.5 pt-1">
            <p className="text-xs">
              <span className="font-medium">{footerLabel}</span>
              <span className="text-muted-foreground">
                {` · ${formatDateTimeAwst(leadCreatedAt)}`}
              </span>
            </p>
          </div>
        </RelativeDayTooltip>
      </li>
    </ol>
  );
}
