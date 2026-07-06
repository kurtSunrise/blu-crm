"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { moveDealStage } from "@/lib/actions/deal-actions";
import { formatAudFromCents } from "@/lib/format";
import {
  type DealSubStatusOption,
  type FixedDateType,
  subStatusClasses,
} from "@/lib/labels";
import type { PipelineTooltipSettings } from "@/lib/pipeline-tooltip";
import { cn } from "@/lib/utils";
import { DealCard } from "./deal-card";
import { StageChangeDialog, type StageMoveExtras } from "./stage-change-dialog";

export interface BoardStage {
  id: string;
  isLost: boolean;
  isWon: boolean;
  name: string;
  position: number;
}

export interface BoardDealFollowUp {
  action: string;
  dueDate: string;
}

export interface BoardDeal {
  companyName: string | null;
  expectedCloseDate: string | null;
  fixedDate: string | null;
  fixedDateType: FixedDateType | null;
  id: string;
  lastContactAt: string | null;
  leadId: string;
  nextFollowUp: BoardDealFollowUp | null;
  ownerName: string | null;
  scopeSummary: string | null;
  stageId: string;
  // The deal's current status resolved to a row (may be archived), or null.
  subStatus: DealSubStatusOption | null;
  subStatusNote: string | null;
  title: string;
  valueCents: number;
  valueRange: { maxCents: number; minCents: number } | null;
}

const DRAG_ACTIVATION_DISTANCE_PX = 6;
const TOUCH_DRAG_DELAY_MS = 200;
const TOUCH_DRAG_TOLERANCE_PX = 8;
// A short hold before a card's hover preview appears, so it does not flash
// while the user scans or drags across the board.
const TOOLTIP_DELAY_MS = 400;

// Won / Lost columns link here for their full history; the board itself only
// holds recently closed deals.
const closedViewHref = (stage: BoardStage): string =>
  `/pipeline/closed?stage=${stage.isWon ? "won" : "lost"}`;

function StageColumn({
  stage,
  deals,
  stages,
  onMove,
  tooltip,
  subStatusOptions,
  subStatusEditable,
  closedWindowDays,
  collapsed,
  onToggleCollapse,
}: {
  stage: BoardStage;
  deals: BoardDeal[];
  stages: BoardStage[];
  onMove: (dealId: string, stageId: string) => void;
  tooltip: PipelineTooltipSettings;
  subStatusOptions: DealSubStatusOption[];
  subStatusEditable: boolean;
  closedWindowDays: number;
  // Closed columns start collapsed to a summary; active columns never collapse.
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id });
  const totalCents = deals.reduce((sum, item) => sum + item.valueCents, 0);
  const isClosed = stage.isWon || stage.isLost;

  // Collapsed closed column: a narrow summary that still accepts drops (so a
  // card can be dragged straight onto Won / Lost) and expands on tap.
  if (isClosed && collapsed) {
    return (
      <section
        aria-label={stage.name}
        className={cn(
          "flex w-44 shrink-0 snap-start flex-col gap-2 rounded-lg border bg-card/50 p-3 transition-colors",
          isOver && "border-blu bg-blu/5"
        )}
        ref={setNodeRef}
      >
        <button
          aria-expanded={false}
          className="flex min-h-8 w-full items-center justify-between gap-2 text-left"
          onClick={onToggleCollapse}
          type="button"
        >
          <span className="flex items-center gap-1">
            <ChevronRight
              aria-hidden
              className="size-4 text-muted-foreground"
            />
            <span className="font-heading font-medium text-sm">
              {stage.name}
            </span>
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
            {deals.length}
          </span>
        </button>
        <div className="px-1">
          <p className="font-medium text-sm tabular-nums">
            {formatAudFromCents(totalCents)}
          </p>
          <p className="text-muted-foreground text-xs">
            last {closedWindowDays} days
          </p>
        </div>
        <Link
          className="mt-auto inline-flex min-h-8 items-center gap-1 text-blu text-xs hover:underline"
          href={closedViewHref(stage)}
        >
          View all
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-label={stage.name}
      className={cn(
        "flex w-[85vw] shrink-0 snap-start flex-col gap-2 rounded-lg border bg-card/50 p-3 transition-colors sm:w-80",
        isOver && "border-blu bg-blu/5"
      )}
      ref={setNodeRef}
    >
      <header className="flex items-baseline justify-between gap-2 px-1">
        {isClosed ? (
          <button
            aria-expanded
            className="flex min-h-8 items-center gap-1 text-left"
            onClick={onToggleCollapse}
            type="button"
          >
            <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
            <span className="font-heading font-medium text-sm">
              {stage.name}
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
              {deals.length}
            </span>
          </button>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <h2 className="font-heading font-medium text-sm">{stage.name}</h2>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
              {deals.length}
            </span>
          </div>
        )}
        <p className="text-muted-foreground text-xs tabular-nums">
          {formatAudFromCents(totalCents)}
        </p>
      </header>
      {isClosed && (
        <Link
          className="inline-flex min-h-8 items-center gap-1 px-1 text-blu text-xs hover:underline"
          href={closedViewHref(stage)}
        >
          View all closed (last {closedWindowDays} days shown)
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      )}
      <div className="flex min-h-24 flex-col gap-2">
        {deals.length === 0 && (
          <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs">
            No deals
          </div>
        )}
        {deals.map((item) => (
          <DealCard
            deal={item}
            key={item.id}
            onMove={onMove}
            stages={stages}
            subStatusEditable={subStatusEditable}
            subStatusOptions={subStatusOptions}
            tooltip={tooltip}
          />
        ))}
      </div>
    </section>
  );
}

export function PipelineBoard({
  stages,
  deals,
  tooltip,
  subStatuses,
  subStatusEditable,
  closedWindowDays,
}: {
  stages: BoardStage[];
  deals: BoardDeal[];
  tooltip: PipelineTooltipSettings;
  // Active statuses, in display order, for the filter chips and card picker.
  subStatuses: DealSubStatusOption[];
  // Whether board cards offer the editable status control (admin placement).
  subStatusEditable: boolean;
  // The window (in days) the closed columns load, shown in their summary.
  closedWindowDays: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [boardDeals, setBoardDeals] = useState(deals);
  const [pendingMove, setPendingMove] = useState<{
    dealId: string;
    stage: BoardStage;
  } | null>(null);
  const [subStatusFilter, setSubStatusFilter] = useState<Set<string>>(
    new Set()
  );
  // Which closed columns the user has expanded; closed columns are collapsed
  // to a summary by default so they do not crowd out the active pipeline.
  const [expandedClosed, setExpandedClosed] = useState<Set<string>>(new Set());

  const toggleColumn = (stageId: string) => {
    setExpandedClosed((current) => {
      const next = new Set(current);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  useEffect(() => {
    setBoardDeals(deals);
  }, [deals]);

  const toggleFilter = (value: string) => {
    setSubStatusFilter((current) => {
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  };

  // An empty filter shows everything; otherwise keep only deals carrying one of
  // the selected labels. Stage counts and totals recompute from this list.
  const visibleDeals =
    subStatusFilter.size === 0
      ? boardDeals
      : boardDeals.filter(
          (item) => item.subStatus && subStatusFilter.has(item.subStatus.id)
        );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE_PX },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_DRAG_DELAY_MS,
        tolerance: TOUCH_DRAG_TOLERANCE_PX,
      },
    })
  );

  const applyMove = (
    dealId: string,
    stageId: string,
    extras: StageMoveExtras = {}
  ) => {
    setBoardDeals((current) =>
      current.map((item) => (item.id === dealId ? { ...item, stageId } : item))
    );
    startTransition(async () => {
      await moveDealStage({ dealId, stageId, ...extras });
      router.refresh();
    });
  };

  // Won prompts for handover; Lost / Dormant requires a reason first (FR-1.6).
  const requestMove = (dealId: string, stageId: string) => {
    const stage = stages.find((item) => item.id === stageId);
    if (!stage) {
      return;
    }
    if (stage.isWon || stage.isLost) {
      setPendingMove({ dealId, stage });
      return;
    }
    applyMove(dealId, stageId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const targetStageId = event.over?.id;
    const dealId = event.active.id;
    if (typeof targetStageId !== "string" || typeof dealId !== "string") {
      return;
    }
    const moved = boardDeals.find((item) => item.id === dealId);
    if (!moved || moved.stageId === targetStageId) {
      return;
    }
    requestMove(dealId, targetStageId);
  };

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      {subStatuses.length > 0 && (
        // Sticky under the h-14 mobile app-shell header (desktop has a
        // sidebar, so top-0 there); a wrapping div carries overflow-x-auto
        // because the fieldset UA min-inline-size defeats shrinking.
        <div className="sticky top-14 z-10 flex items-center overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur md:top-0">
          <fieldset className="flex items-center gap-2 md:flex-wrap">
            <legend className="sr-only">Filter by status</legend>
            <span
              aria-hidden
              className="shrink-0 text-muted-foreground text-xs"
            >
              Status
            </span>
            {subStatuses.map((option) => {
              const active = subStatusFilter.has(option.id);
              const classes = subStatusClasses(option.color);
              return (
                <button
                  aria-pressed={active}
                  className={cn(
                    "flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs transition-colors",
                    active
                      ? cn("ring-1 ring-current", classes.badge)
                      : "text-muted-foreground hover:border-foreground/30"
                  )}
                  key={option.id}
                  onClick={() => toggleFilter(option.id)}
                  type="button"
                >
                  <span
                    aria-hidden
                    className={cn("size-2 shrink-0 rounded-full", classes.dot)}
                  />
                  {option.label}
                </button>
              );
            })}
            {subStatusFilter.size > 0 && (
              <button
                className="min-h-8 shrink-0 whitespace-nowrap text-muted-foreground text-xs underline-offset-2 hover:underline"
                onClick={() => setSubStatusFilter(new Set())}
                type="button"
              >
                Clear
              </button>
            )}
          </fieldset>
        </div>
      )}
      <TooltipProvider delay={TOOLTIP_DELAY_MS}>
        <section
          aria-label="Pipeline stages"
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable even when it holds no focusable cards (axe: scrollable-region-focusable)
          tabIndex={0}
        >
          {stages.map((stage) => {
            const isClosed = stage.isWon || stage.isLost;
            return (
              <StageColumn
                closedWindowDays={closedWindowDays}
                collapsed={isClosed && !expandedClosed.has(stage.id)}
                deals={visibleDeals.filter((item) => item.stageId === stage.id)}
                key={stage.id}
                onMove={requestMove}
                onToggleCollapse={() => toggleColumn(stage.id)}
                stage={stage}
                stages={stages}
                subStatusEditable={subStatusEditable}
                subStatusOptions={subStatuses}
                tooltip={tooltip}
              />
            );
          })}
        </section>
      </TooltipProvider>
      <StageChangeDialog
        onCancel={() => setPendingMove(null)}
        onConfirm={(extras) => {
          if (pendingMove) {
            applyMove(pendingMove.dealId, pendingMove.stage.id, extras);
          }
          setPendingMove(null);
        }}
        stage={pendingMove?.stage ?? null}
      />
    </DndContext>
  );
}
