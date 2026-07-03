"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { deal, pipelineStage } from "@/db/schema";
import { getSessionUserId } from "@/lib/session";
import { stageNameSchema } from "@/lib/validation/settings";

// Customisable pipeline stages (FR-1.3): rename, reorder, add, remove.
// Won and Lost / Dormant carry the is_won / is_lost flags that the close
// flows and reports depend on, so they can be renamed but never removed,
// and they stay at the end of the board.

export interface StageActionState {
  error?: string;
  message?: string;
}

// Stage names and order surface on every one of these routes.
const STAGE_SURFACES = [
  "/",
  "/pipeline",
  "/tasks",
  "/reports",
  "/reports/weekly",
  "/settings",
];

const revalidateStageSurfaces = (): void => {
  for (const path of STAGE_SURFACES) {
    revalidatePath(path);
  }
};

interface StageRow {
  id: string;
  isLost: boolean;
  isWon: boolean;
  name: string;
  position: number;
}

const loadStages = (): Promise<StageRow[]> =>
  db
    .select({
      id: pipelineStage.id,
      name: pipelineStage.name,
      position: pipelineStage.position,
      isWon: pipelineStage.isWon,
      isLost: pipelineStage.isLost,
    })
    .from(pipelineStage)
    .orderBy(asc(pipelineStage.position));

const isClosed = (stage: StageRow): boolean => stage.isWon || stage.isLost;

const nameTaken = (stages: StageRow[], name: string, exceptId?: string) =>
  stages.some(
    (stage) =>
      stage.id !== exceptId && stage.name.toLowerCase() === name.toLowerCase()
  );

const addStage = async (formData: FormData): Promise<StageActionState> => {
  const parsed = stageNameSchema.safeParse(formData.get("name"));
  if (!parsed.success) {
    return { error: "Stage names must be 1 to 60 characters." };
  }

  const stages = await loadStages();
  if (nameTaken(stages, parsed.data)) {
    return { error: "A stage with that name already exists." };
  }

  // New stages join the end of the open stages, ahead of Won and Lost.
  const closedStages = stages.filter(isClosed);
  const insertPosition =
    closedStages.length > 0
      ? Math.min(...closedStages.map((stage) => stage.position))
      : (stages.at(-1)?.position ?? 0) + 1;

  for (const stage of stages.filter((row) => row.position >= insertPosition)) {
    await db
      .update(pipelineStage)
      .set({ position: stage.position + 1, updatedAt: new Date() })
      .where(eq(pipelineStage.id, stage.id));
  }
  await db
    .insert(pipelineStage)
    .values({ name: parsed.data, position: insertPosition });

  return { message: "Stage added." };
};

const renameStage = async (formData: FormData): Promise<StageActionState> => {
  const stageId = formData.get("stageId");
  const parsed = stageNameSchema.safeParse(formData.get("name"));
  if (typeof stageId !== "string" || !parsed.success) {
    return { error: "Stage names must be 1 to 60 characters." };
  }

  const stages = await loadStages();
  const stage = stages.find((row) => row.id === stageId);
  if (!stage) {
    return { error: "That stage no longer exists." };
  }
  if (nameTaken(stages, parsed.data, stageId)) {
    return { error: "A stage with that name already exists." };
  }

  // Deals reference stages by ID, so renaming preserves history (FR-1.3 AC).
  await db
    .update(pipelineStage)
    .set({ name: parsed.data, updatedAt: new Date() })
    .where(eq(pipelineStage.id, stageId));

  return { message: "Stage renamed." };
};

const moveStage = async (formData: FormData): Promise<StageActionState> => {
  const stageId = formData.get("stageId");
  const direction = formData.get("direction");
  if (
    typeof stageId !== "string" ||
    (direction !== "up" && direction !== "down")
  ) {
    return { error: "That move isn't possible." };
  }

  const stages = await loadStages();
  const index = stages.findIndex((row) => row.id === stageId);
  if (index === -1) {
    return { error: "That stage no longer exists." };
  }
  const neighbour = stages[direction === "up" ? index - 1 : index + 1];
  if (!neighbour) {
    return { error: "That stage is already at the edge of the board." };
  }
  if (isClosed(stages[index]) !== isClosed(neighbour)) {
    return { error: "Won and Lost / Dormant stay at the end of the board." };
  }

  const stage = stages[index];
  await db
    .update(pipelineStage)
    .set({ position: neighbour.position, updatedAt: new Date() })
    .where(eq(pipelineStage.id, stage.id));
  await db
    .update(pipelineStage)
    .set({ position: stage.position, updatedAt: new Date() })
    .where(eq(pipelineStage.id, neighbour.id));

  return { message: "Stage order updated." };
};

const deleteStage = async (formData: FormData): Promise<StageActionState> => {
  const stageId = formData.get("stageId");
  if (typeof stageId !== "string") {
    return { error: "That stage no longer exists." };
  }

  const stages = await loadStages();
  const stage = stages.find((row) => row.id === stageId);
  if (!stage) {
    return { error: "That stage no longer exists." };
  }
  if (isClosed(stage)) {
    return {
      error: "Won and Lost / Dormant are built in and can't be removed.",
    };
  }
  if (stages.filter((row) => !isClosed(row)).length <= 1) {
    return { error: "Keep at least one open stage on the board." };
  }

  // Discarded deals still reference their stage, so count every deal.
  const [dealCount] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(deal)
    .where(eq(deal.stageId, stageId));

  if (dealCount.value > 0) {
    const reassignTo = formData.get("reassignToStageId");
    const destination = stages.find((row) => row.id === reassignTo);
    if (!destination || destination.id === stageId) {
      // Removing a stage requires reassigning its deals (FR-1.3 AC).
      return { error: "Choose a stage to move this stage's deals to." };
    }
    // Record the forced transition for every affected deal in one round trip
    // before the bulk move wipes their stage_id. The deleted stage survives in
    // history only through the from_stage_name snapshot.
    const changedBy = await getSessionUserId();
    await db.execute(sql`
      insert into deal_stage_event
        (id, deal_id, from_stage_id, from_stage_name,
         to_stage_id, to_stage_name, source, changed_by)
      select gen_random_uuid(), d.id, d.stage_id, ${stage.name},
        ${destination.id}, ${destination.name}, 'stage_delete', ${changedBy}
      from deal d
      where d.stage_id = ${stageId}
    `);
    await db
      .update(deal)
      .set({ stageId: destination.id, updatedAt: new Date() })
      .where(eq(deal.stageId, stageId));
  }

  await db.delete(pipelineStage).where(eq(pipelineStage.id, stageId));

  // Compact positions back to 1..n so future inserts stay predictable.
  const remaining = await loadStages();
  for (const [index, row] of remaining.entries()) {
    if (row.position !== index + 1) {
      await db
        .update(pipelineStage)
        .set({ position: index + 1, updatedAt: new Date() })
        .where(eq(pipelineStage.id, row.id));
    }
  }

  return { message: "Stage removed." };
};

// Single dispatcher so the stage manager surfaces one status line; each
// form posts an `intent` field alongside its inputs.
export const manageStages = async (
  _prevState: StageActionState,
  formData: FormData
): Promise<StageActionState> => {
  const intent = formData.get("intent");

  let result: StageActionState;
  switch (intent) {
    case "add":
      result = await addStage(formData);
      break;
    case "rename":
      result = await renameStage(formData);
      break;
    case "move":
      result = await moveStage(formData);
      break;
    case "delete":
      result = await deleteStage(formData);
      break;
    default:
      result = { error: "Unknown stage action." };
  }

  if (result.message) {
    revalidateStageSurfaces();
  }
  return result;
};
