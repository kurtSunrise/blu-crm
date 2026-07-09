import { formatDateAwst } from "@/lib/format";

// Registry for every in-app notification type (FR-11.1). Pure module (no db
// import) so the feed page, the preferences UI, and the emit layer can all
// consume it. Display strings and links derive from type + payload at render
// time, so copy fixes apply retroactively to stored rows.

export type NotificationType =
  | "daily_briefing"
  | "follow_up_due"
  | "follow_up_overdue"
  | "handover_to_delivery"
  | "lead_assigned"
  | "quote_viewed"
  | "stale_deal"
  | "weekly_report";

export interface NotificationPayload {
  action?: string;
  dealId?: string;
  dealTitle?: string;
  dueDate?: string;
  followUpId?: string;
  lastContactAt?: string;
  leadId?: string;
  quoteId?: string;
  // Assistant thread carrying a proactive briefing/report; the client opens
  // the assistant dock on it instead of navigating (href stays null).
  threadId?: string;
  valueCents?: number | null;
}

export interface NotificationDescription {
  detail: string | null;
  title: string;
}

interface NotificationTypeMeta {
  describe: (payload: NotificationPayload) => NotificationDescription;
  // Toggle copy for the preferences UI.
  description: string;
  href: (payload: NotificationPayload) => string | null;
  label: string;
}

const dealHref = (payload: NotificationPayload): string | null =>
  payload.dealId ? `/deals/${payload.dealId}` : null;

export const NOTIFICATION_TYPES: Record<
  NotificationType,
  NotificationTypeMeta
> = {
  lead_assigned: {
    label: "Lead assigned to you",
    description: "When a lead from the inbox is assigned to you.",
    describe: (payload) => ({
      title: "New lead assigned to you",
      detail: `${payload.dealTitle ?? "A lead"}${
        payload.leadId ? ` (${payload.leadId})` : ""
      } is yours to work.`,
    }),
    href: dealHref,
  },
  quote_viewed: {
    label: "Quote viewed",
    description: "When a client opens a quote you sent.",
    describe: (payload) => ({
      title: "Quote viewed",
      detail: `The client just opened the quote on ${
        payload.dealTitle ?? "a deal"
      }. Good time to follow up.`,
    }),
    href: dealHref,
  },
  follow_up_due: {
    label: "Follow-up due today",
    description: "A morning heads-up for follow-ups due that day.",
    describe: (payload) => ({
      title: "Follow-up due today",
      detail: `${payload.action ?? "A follow-up"} on ${
        payload.dealTitle ?? "a deal"
      } is due today.`,
    }),
    href: dealHref,
  },
  follow_up_overdue: {
    label: "Follow-up overdue",
    description: "When one of your follow-ups goes past its due date.",
    describe: (payload) => ({
      title: "Follow-up overdue",
      detail: `${payload.action ?? "A follow-up"} on ${
        payload.dealTitle ?? "a deal"
      }${
        payload.dueDate
          ? ` was due ${formatDateAwst(new Date(payload.dueDate))}`
          : ""
      }`,
    }),
    href: dealHref,
  },
  stale_deal: {
    label: "Deal needs attention",
    description:
      "When one of your open deals has had no logged contact past the threshold set in Settings → Alerts.",
    describe: (payload) => ({
      title: "Deal needs attention",
      detail: `${
        payload.dealTitle ?? "A deal"
      } has had no logged contact for a while. Worth a check-in.`,
    }),
    href: dealHref,
  },
  weekly_report: {
    label: "Weekly pipeline report",
    description: "When your Monday pipeline report is ready in the assistant.",
    describe: () => ({
      title: "Your weekly pipeline report is ready",
      detail: "Open it in the assistant for the full pipeline breakdown.",
    }),
    href: () => null,
  },
  daily_briefing: {
    label: "Morning briefing",
    description:
      "A weekday morning briefing of your follow-ups and deals to watch, in the assistant.",
    describe: () => ({
      title: "Your morning briefing",
      detail:
        "Open it in the assistant for today's follow-ups and deals to watch.",
    }),
    href: () => null,
  },
  handover_to_delivery: {
    label: "Handover to delivery",
    description: "When a won deal is flagged for handover to delivery.",
    describe: (payload) => ({
      title: "Handover to delivery",
      detail: `${payload.dealTitle ?? "A deal"} was won. Over to you for delivery.`,
    }),
    href: dealHref,
  },
};

// Display order for the preferences UI.
export const NOTIFICATION_TYPE_ORDER: readonly NotificationType[] = [
  "lead_assigned",
  "quote_viewed",
  "follow_up_due",
  "follow_up_overdue",
  "stale_deal",
  "weekly_report",
  "daily_briefing",
  "handover_to_delivery",
];

export const isKnownNotificationType = (
  type: string
): type is NotificationType => type in NOTIFICATION_TYPES;

// Legacy or retired types still render via a humanised fallback so old rows
// never break.
export const describeNotification = (
  type: string,
  payload: NotificationPayload
): NotificationDescription => {
  if (isKnownNotificationType(type)) {
    return NOTIFICATION_TYPES[type].describe(payload);
  }
  return { title: type.replaceAll("_", " "), detail: null };
};

export const notificationHref = (
  type: string,
  payload: NotificationPayload
): string | null => {
  if (isKnownNotificationType(type)) {
    return NOTIFICATION_TYPES[type].href(payload);
  }
  return dealHref(payload);
};
