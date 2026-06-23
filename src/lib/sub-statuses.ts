import { asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { appSetting, dealSubStatus } from "@/db/schema";
import type { DealSubStatusOption } from "@/lib/labels";

// Where the per-deal status control is offered, stored as two app_setting rows
// using the boolean-as-string convention from src/lib/pipeline-tooltip.ts.
export const SUB_STATUS_SHOW_BOARD_KEY = "sub_status_show_board";
export const SUB_STATUS_SHOW_DEAL_KEY = "sub_status_show_deal";

// Default on so the control stays where it is today once this ships.
const DEFAULT_PLACEMENT = true;

export interface SubStatusPlacement {
  showOnBoard: boolean;
  showOnDealPage: boolean;
}

// A status as managed in Settings, including archived ones and their order.
export interface AdminSubStatus extends DealSubStatusOption {
  archivedAt: Date | null;
  position: number;
}

// Active statuses (not archived), in display order, for the picker, board
// filter chips, and card badges.
export const getActiveSubStatuses = async (): Promise<DealSubStatusOption[]> =>
  await db
    .select({
      id: dealSubStatus.id,
      label: dealSubStatus.label,
      color: dealSubStatus.color,
    })
    .from(dealSubStatus)
    .where(isNull(dealSubStatus.archivedAt))
    .orderBy(asc(dealSubStatus.position));

// Every status, archived included, for the Settings management list and for
// resolving the label of a status a historical deal still references.
export const getAllSubStatuses = async (): Promise<AdminSubStatus[]> =>
  await db
    .select({
      id: dealSubStatus.id,
      label: dealSubStatus.label,
      color: dealSubStatus.color,
      position: dealSubStatus.position,
      archivedAt: dealSubStatus.archivedAt,
    })
    .from(dealSubStatus)
    .orderBy(asc(dealSubStatus.position));

// Resolve a single status row (active or archived) by id, or null. Used by the
// activity log when a sub-status is applied.
export const getSubStatusById = async (
  id: string
): Promise<DealSubStatusOption | null> => {
  const [row] = await db
    .select({
      id: dealSubStatus.id,
      label: dealSubStatus.label,
      color: dealSubStatus.color,
    })
    .from(dealSubStatus)
    .where(eq(dealSubStatus.id, id))
    .limit(1);
  return row ?? null;
};

// Booleans are stored as "true"/"false"; only an explicit "false" turns a
// surface off, so an unset key keeps the default.
const parseFlag = (value: string | undefined): boolean =>
  value === undefined ? DEFAULT_PLACEMENT : value !== "false";

export const getSubStatusPlacement = async (): Promise<SubStatusPlacement> => {
  const rows = await db
    .select({ key: appSetting.key, value: appSetting.value })
    .from(appSetting)
    .where(
      inArray(appSetting.key, [
        SUB_STATUS_SHOW_BOARD_KEY,
        SUB_STATUS_SHOW_DEAL_KEY,
      ])
    );

  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return {
    showOnBoard: parseFlag(byKey.get(SUB_STATUS_SHOW_BOARD_KEY)),
    showOnDealPage: parseFlag(byKey.get(SUB_STATUS_SHOW_DEAL_KEY)),
  };
};
