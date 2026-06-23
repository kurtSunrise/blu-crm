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

// Deal sub-statuses are admin-configurable (label, colour, order) and stored in
// the deal_sub_status table, so a status is carried around as this row shape
// rather than a fixed union. `color` is one of the palette keys below.
export interface DealSubStatusOption {
  color: string;
  id: string;
  label: string;
}

// The fixed colour palette an admin picks from. A raw hex picker can't work:
// Tailwind only generates class names it can see as literal strings, so colours
// must map to pre-written classes. The palette also guarantees WCAG-AA contrast
// in both themes (the soft `bg-*/10` fill with -700/-400 text mirrors the
// destructive badge). Brand `blu` and green are excluded on purpose: `blu` is
// reserved for links/active/filter states, and green reads as "healthy", the
// wrong signal for a paused deal.
export const SUB_STATUS_COLORS = [
  "red",
  "amber",
  "orange",
  "teal",
  "sky",
  "violet",
  "rose",
  "slate",
] as const;

export type SubStatusColor = (typeof SUB_STATUS_COLORS)[number];

interface SubStatusColorClasses {
  badge: string;
  dot: string;
}

export const SUB_STATUS_PALETTE: Record<SubStatusColor, SubStatusColorClasses> =
  {
    red: {
      badge: "border-destructive/30 bg-destructive/10 text-destructive",
      dot: "bg-destructive",
    },
    amber: {
      badge:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      dot: "bg-amber-500",
    },
    orange: {
      badge:
        "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
      dot: "bg-orange-500",
    },
    teal: {
      badge:
        "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400",
      dot: "bg-teal-500",
    },
    sky: {
      badge: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
      dot: "bg-sky-500",
    },
    violet: {
      badge:
        "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
      dot: "bg-violet-500",
    },
    rose: {
      badge:
        "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
      dot: "bg-rose-500",
    },
    slate: {
      badge:
        "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
      dot: "bg-slate-500",
    },
  };

// Semantic guidance shown beside each colour in the admin picker, ordered to
// match SUB_STATUS_COLORS.
export const SUB_STATUS_COLOR_HINTS: Record<SubStatusColor, string> = {
  red: "Blocked / at risk",
  amber: "Waiting / caution",
  orange: "Strong caution",
  teal: "Waiting (alternative)",
  sky: "Informational",
  violet: "Internal / other",
  rose: "Needs attention",
  slate: "Parked / neutral",
};

// A removed/unknown colour key falls back to neutral so a badge never renders
// without classes.
export const subStatusClasses = (color: string): SubStatusColorClasses =>
  SUB_STATUS_PALETTE[color as SubStatusColor] ?? SUB_STATUS_PALETTE.slate;
