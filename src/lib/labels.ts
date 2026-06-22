import type {
  LOST_REASONS,
  PROJECT_TYPES,
  SUB_STATUSES,
} from "@/lib/validation/deal";

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  fit_out: "Fit-out",
  retail_display: "Retail display",
  event_stand: "Event stand",
  exhibition: "Exhibition",
  install: "Install",
  themed_build: "Themed build",
  other: "Other",
};

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  web: "Web",
  instagram: "Instagram",
  referral: "Referral",
  repeat_client: "Repeat client",
  other: "Other",
};

export type FixedDateType = "install" | "event" | "launch";

export const FIXED_DATE_TYPE_LABELS: Record<FixedDateType, string> = {
  install: "Install",
  event: "Event",
  launch: "Launch",
};

export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: "Price",
  timing: "Timing",
  went_elsewhere: "Went elsewhere",
  no_response: "No response",
  parked: "Parked",
};

export type SubStatus = (typeof SUB_STATUSES)[number];

export const SUB_STATUS_LABELS: Record<SubStatus, string> = {
  on_hold_third_party: "On Hold – Awaiting Third Party",
  blocked_external: "Blocked – External Dependency",
  on_hold_client: "On Hold – Awaiting Client",
  on_hold_internal: "On Hold – Internal Review",
};

// Blocked reads as the harder stop, so it takes the destructive (red) badge;
// the on-hold labels share the calmer secondary tone.
export const SUB_STATUS_TONE: Record<SubStatus, "destructive" | "secondary"> = {
  on_hold_third_party: "secondary",
  blocked_external: "destructive",
  on_hold_client: "secondary",
  on_hold_internal: "secondary",
};
