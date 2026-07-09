import {
  ArrowRightLeft,
  CheckCircle2,
  FileText,
  Mail,
  MapPin,
  Phone,
  StickyNote,
  Users,
} from "lucide-react";

// Framework-neutral timeline data and helpers, deliberately kept out of the
// "use client" deal-timeline module so server components (e.g. the daily status
// report) can call getEntryStyle during render. Exports of a "use client"
// module become client references that throw when invoked on the server.

export interface TimelineEntry {
  authorName: string | null;
  content: string | null;
  // Where the entry happened, when the timeline spans records (a contact's
  // history covers several deals); omitted on the deal page itself.
  context?: { href: string; label: string };
  createdAt: Date;
  id: string;
  type: string;
}

export interface EntryStyle {
  icon: typeof Phone;
  label: string;
  // Marker colouring: brand for pipeline movement, quote tint for quotes,
  // neutral for day-to-day contact logging.
  marker: string;
}

const ENTRY_STYLES: Record<string, EntryStyle> = {
  call: { label: "Call", icon: Phone, marker: "" },
  email: { label: "Email", icon: Mail, marker: "" },
  site_visit: { label: "Site visit", icon: MapPin, marker: "" },
  meeting: { label: "Meeting", icon: Users, marker: "" },
  note: { label: "Note", icon: StickyNote, marker: "" },
  stage_change: {
    label: "Stage change",
    icon: ArrowRightLeft,
    marker: "border-blu/40 bg-blu/10 text-blu",
  },
  quote_event: {
    label: "Quote",
    icon: FileText,
    marker: "border-success/40 bg-success/10 text-success",
  },
  follow_up: {
    label: "Follow-up completed",
    icon: CheckCircle2,
    marker: "border-success/40 bg-success/10 text-success",
  },
};

const FALLBACK_STYLE: EntryStyle = {
  label: "Activity",
  icon: StickyNote,
  marker: "",
};

// Shared so other surfaces (e.g. the daily status report) render an activity
// with the same icon, label, and marker colour as the deal-page timeline.
export const getEntryStyle = (type: string): EntryStyle =>
  ENTRY_STYLES[type] ?? FALLBACK_STYLE;
