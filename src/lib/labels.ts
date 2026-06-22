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

// A distinct colour per label so a held or blocked deal reads at a glance.
// Brand `blu` is reserved for links and active/filter states, so it is not used
// here. Class strings are written in full (never interpolated) so Tailwind's
// scanner generates them; the soft `bg-*/10 text-*` style mirrors the
// destructive badge, and the -700/-400 text tones keep WCAG AA in both themes.
export const SUB_STATUS_COLOR: Record<
  SubStatus,
  { badge: string; dot: string }
> = {
  on_hold_third_party: {
    badge:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  blocked_external: {
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  on_hold_client: {
    badge: "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400",
    dot: "bg-teal-500",
  },
  on_hold_internal: {
    badge:
      "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
  },
};
