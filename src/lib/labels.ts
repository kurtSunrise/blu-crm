import type { LOST_REASONS, PROJECT_TYPES } from "@/lib/validation/deal";

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

export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price: "Price",
  timing: "Timing",
  went_elsewhere: "Went elsewhere",
  no_response: "No response",
  parked: "Parked",
};
