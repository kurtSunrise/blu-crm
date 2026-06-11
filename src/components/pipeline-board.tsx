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
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { moveDealStage } from "@/lib/actions/deal-actions";
import { formatAudFromCents } from "@/lib/format";
import type { FixedDateType } from "@/lib/labels";
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

export interface BoardDeal {
  companyName: string | null;
  fixedDate: string | null;
  fixedDateType: FixedDateType | null;
  id: string;
  leadId: string;
  ownerName: string | null;
  stageId: string;
  title: string;
  valueCents: number;
}

const DRAG_ACTIVATION_DISTANCE_PX = 6;
const TOUCH_DRAG_DELAY_MS = 200;
const TOUCH_DRAG_TOLERANCE_PX = 8;

function StageColumn({
  stage,
  deals,
  stages,
  onMove,
}: {
  stage: BoardStage;
  deals: BoardDeal[];
  stages: BoardStage[];
  onMove: (dealId: string, stageId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id });
  const totalCents = deals.reduce((sum, item) => sum + item.valueCents, 0);

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
        <div className="flex items-baseline gap-1.5">
          <h2 className="font-heading font-medium text-sm">{stage.name}</h2>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
            {deals.length}
          </span>
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          {formatAudFromCents(totalCents)}
        </p>
      </header>
      <div className="flex min-h-24 flex-col gap-2">
        {deals.length === 0 && (
          <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed text-muted-foreground text-xs">
            No deals
          </div>
        )}
        {deals.map((item) => (
          <DealCard deal={item} key={item.id} onMove={onMove} stages={stages} />
        ))}
      </div>
    </section>
  );
}

export function PipelineBoard({
  stages,
  deals,
}: {
  stages: BoardStage[];
  deals: BoardDeal[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [boardDeals, setBoardDeals] = useState(deals);
  const [pendingMove, setPendingMove] = useState<{
    dealId: string;
    stage: BoardStage;
  } | null>(null);

  useEffect(() => {
    setBoardDeals(deals);
  }, [deals]);

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
      <section
        aria-label="Pipeline stages"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be keyboard-focusable even when it holds no focusable cards (axe: scrollable-region-focusable)
        tabIndex={0}
      >
        {stages.map((stage) => (
          <StageColumn
            deals={boardDeals.filter((item) => item.stageId === stage.id)}
            key={stage.id}
            onMove={requestMove}
            stage={stage}
            stages={stages}
          />
        ))}
      </section>
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
