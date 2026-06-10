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
import { LostReasonDialog } from "@/components/lost-reason-dialog";
import { moveDealStage } from "@/lib/actions/deal-actions";
import { formatAudFromCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DealCard } from "./deal-card";

export interface BoardStage {
  id: string;
  name: string;
  position: number;
  isWon: boolean;
  isLost: boolean;
}

export interface BoardDeal {
  companyName: string | null;
  fixedDate: string | null;
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
        "flex w-[85vw] shrink-0 snap-start flex-col gap-2 rounded-lg border bg-card/50 p-3 sm:w-80",
        isOver && "border-blu"
      )}
      ref={setNodeRef}
    >
      <header className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="font-heading font-medium text-sm">{stage.name}</h2>
        <p className="text-muted-foreground text-xs">
          {deals.length} · {formatAudFromCents(totalCents)}
        </p>
      </header>
      <div className="flex min-h-24 flex-col gap-2">
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

  const [pendingLostMove, setPendingLostMove] = useState<{
    dealId: string;
    stageId: string;
  } | null>(null);

  const applyMove = (dealId: string, stageId: string, lostReason?: string) => {
    setBoardDeals((current) =>
      current.map((item) => (item.id === dealId ? { ...item, stageId } : item))
    );
    startTransition(async () => {
      await moveDealStage({ dealId, stageId, lostReason });
      router.refresh();
    });
  };

  // Moving into Lost / Dormant requires a reason (FR-1.6), so the move is
  // held until the user picks one in the dialog.
  const requestMove = (dealId: string, stageId: string) => {
    const target = stages.find((stage) => stage.id === stageId);
    if (target?.isLost) {
      setPendingLostMove({ dealId, stageId });
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
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4">
        {stages.map((stage) => (
          <StageColumn
            deals={boardDeals.filter((item) => item.stageId === stage.id)}
            key={stage.id}
            onMove={requestMove}
            stage={stage}
            stages={stages}
          />
        ))}
      </div>
      <LostReasonDialog
        onCancel={() => setPendingLostMove(null)}
        onConfirm={(reason) => {
          if (pendingLostMove) {
            applyMove(pendingLostMove.dealId, pendingLostMove.stageId, reason);
          }
          setPendingLostMove(null);
        }}
        open={pendingLostMove !== null}
      />
    </DndContext>
  );
}
