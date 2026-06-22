"use client";

import { useDraggable } from "@dnd-kit/core";
import { CalendarClock, GripVertical, MoveRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  awstDayDiff,
  formatAudFromCents,
  formatDateAwst,
  relativeDayLabel,
} from "@/lib/format";
import { FIXED_DATE_TYPE_LABELS } from "@/lib/labels";
import type { PipelineTooltipSettings } from "@/lib/pipeline-tooltip";
import { cn } from "@/lib/utils";
import { DealSubStatusControl } from "./deal-sub-status-control";
import type { BoardDeal, BoardStage } from "./pipeline-board";

const CLOSING_SOON_DAYS = 14;

interface TooltipRow {
  label: string;
  value: string;
}

const formatDateWithRelative = (iso: string): string => {
  const date = new Date(iso);
  return `${formatDateAwst(date)} · ${relativeDayLabel(awstDayDiff(date))}`;
};

// The detail rows for a card's hover preview, honouring which fields the user
// has enabled and skipping anything the deal has no data for.
const buildTooltipRows = (
  deal: BoardDeal,
  tooltip: PipelineTooltipSettings
): TooltipRow[] => {
  const rows: TooltipRow[] = [];
  if (tooltip.scope && deal.scopeSummary) {
    rows.push({ label: "Scope", value: deal.scopeSummary });
  }
  if (tooltip.contact) {
    if (deal.lastContactAt) {
      rows.push({
        label: "Last contact",
        value: formatDateWithRelative(deal.lastContactAt),
      });
    }
    if (deal.expectedCloseDate) {
      rows.push({
        label: "Expected close",
        value: formatDateWithRelative(deal.expectedCloseDate),
      });
    }
  }
  if (tooltip.followUp && deal.nextFollowUp) {
    rows.push({
      label: "Next follow-up",
      value: `${deal.nextFollowUp.action} · ${formatDateWithRelative(deal.nextFollowUp.dueDate)}`,
    });
  }
  return rows;
};

const fixedDateClass = (dayDiff: number): string => {
  if (dayDiff < 0) {
    return "text-destructive";
  }
  if (dayDiff <= CLOSING_SOON_DAYS) {
    return "text-warning";
  }
  return "text-muted-foreground";
};

export function DealCard({
  deal,
  stages,
  onMove,
  tooltip,
}: {
  deal: BoardDeal;
  stages: BoardStage[];
  onMove: (dealId: string, stageId: string) => void;
  tooltip: PipelineTooltipSettings;
}) {
  // attributes are unused: no KeyboardSensor is wired, so the keyboard /
  // screen-reader path for moving a deal is the dropdown menu below.
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const fixedDayDiff = deal.fixedDate
    ? awstDayDiff(new Date(deal.fixedDate))
    : null;

  const tooltipRows = tooltip.enabled ? buildTooltipRows(deal, tooltip) : [];
  // Suppress the preview mid-drag so it does not follow the card around.
  const showTooltip = tooltipRows.length > 0 && !isDragging;

  const cardBody = (
    <div className="flex items-start gap-2">
      <span
        aria-hidden
        className="flex min-h-11 min-w-8 items-center justify-center text-muted-foreground"
      >
        <GripVertical className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <Link className="block" draggable={false} href={`/deals/${deal.id}`}>
          <p className="font-mono text-muted-foreground text-xs">
            {deal.leadId}
          </p>
          <h3 className="truncate font-medium text-sm">{deal.title}</h3>
          <p className="truncate text-muted-foreground text-xs">
            {deal.companyName ?? "No company"}
            {deal.ownerName ? ` · ${deal.ownerName.split(" ")[0]}` : ""}
          </p>
        </Link>
        <DealSubStatusControl
          className="mt-1.5"
          dealId={deal.id}
          note={deal.subStatusNote}
          subStatus={deal.subStatus}
        />
        <div className="mt-1 flex items-center gap-2">
          {deal.valueRange ? (
            <p className="font-medium text-sm">
              {`${formatAudFromCents(deal.valueRange.minCents)} – ${formatAudFromCents(deal.valueRange.maxCents)}`}
            </p>
          ) : (
            deal.valueCents > 0 && (
              <p className="font-medium text-sm">
                {formatAudFromCents(deal.valueCents)}
              </p>
            )
          )}
          {deal.fixedDate && fixedDayDiff !== null && (
            <p
              className={cn(
                "flex items-center gap-1 text-xs",
                fixedDateClass(fixedDayDiff)
              )}
            >
              <CalendarClock aria-hidden className="size-3.5" />
              {deal.fixedDateType
                ? `${FIXED_DATE_TYPE_LABELS[deal.fixedDateType]} `
                : ""}
              {formatDateAwst(new Date(deal.fixedDate))}
              {fixedDayDiff <= CLOSING_SOON_DAYS &&
                ` · ${relativeDayLabel(fixedDayDiff)}`}
            </p>
          )}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={`Move ${deal.title} to another stage`}
              className="min-h-11 min-w-11"
              size="icon"
              variant="ghost"
            >
              <MoveRight aria-hidden className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          {stages
            .filter((stage) => stage.id !== deal.stageId)
            .map((stage) => (
              <DropdownMenuItem
                key={stage.id}
                onClick={() => onMove(deal.id, stage.id)}
              >
                {stage.name}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    // The whole card is the drag surface (drag-by-handle-only reads as
    // broken). Pointer drags need 6px of travel and touch drags a 200ms
    // hold, so taps and clicks inside the card keep working, and
    // touch-manipulation leaves one-finger column scrolling to the browser.
    // The dropdown menu remains the non-drag way to move a deal.
    <article
      className={cn(
        "cursor-grab touch-manipulation select-none rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "z-50 cursor-grabbing opacity-90 ring-2 ring-blu"
      )}
      ref={setNodeRef}
      style={style}
      {...listeners}
    >
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger render={cardBody} />
          <TooltipContent align="start" className="max-w-xs" side="right">
            <dl className="flex flex-col gap-1.5 text-left">
              {tooltipRows.map((row) => (
                <div key={row.label}>
                  <dt className="font-medium">{row.label}</dt>
                  <dd className="text-background/70">{row.value}</dd>
                </div>
              ))}
            </dl>
          </TooltipContent>
        </Tooltip>
      ) : (
        cardBody
      )}
    </article>
  );
}
