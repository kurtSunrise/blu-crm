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
  awstDayDiff,
  formatAudFromCents,
  formatDateAwst,
  relativeDayLabel,
} from "@/lib/format";
import { FIXED_DATE_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { BoardDeal, BoardStage } from "./pipeline-board";

const CLOSING_SOON_DAYS = 14;

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
}: {
  deal: BoardDeal;
  stages: BoardStage[];
  onMove: (dealId: string, stageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const fixedDayDiff = deal.fixedDate
    ? awstDayDiff(new Date(deal.fixedDate))
    : null;

  return (
    <article
      className={cn(
        "rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md",
        isDragging && "z-50 opacity-90 ring-2 ring-blu"
      )}
      ref={setNodeRef}
      style={style}
    >
      <div className="flex items-start gap-2">
        <button
          aria-label={`Drag ${deal.title}`}
          className="flex min-h-11 min-w-8 touch-none items-center justify-center text-muted-foreground"
          type="button"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <Link className="block" href={`/deals/${deal.id}`}>
            <p className="font-mono text-muted-foreground text-xs">
              {deal.leadId}
            </p>
            <h3 className="truncate font-medium text-sm">{deal.title}</h3>
            <p className="truncate text-muted-foreground text-xs">
              {deal.companyName ?? "No company"}
              {deal.ownerName ? ` · ${deal.ownerName.split(" ")[0]}` : ""}
            </p>
          </Link>
          <div className="mt-1 flex items-center gap-2">
            {deal.valueCents > 0 && (
              <p className="font-medium text-sm">
                {formatAudFromCents(deal.valueCents)}
              </p>
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
    </article>
  );
}
