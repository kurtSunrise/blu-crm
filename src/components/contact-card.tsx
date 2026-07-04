import { Mail, MessageSquare, Phone } from "lucide-react";
import Link from "next/link";
import { ContactAvatar } from "@/components/contact-avatar";
import type { DirectoryPerson } from "@/components/contacts-directory";
import { Badge } from "@/components/ui/badge";
import {
  awstDayDiff,
  formatAudFromCents,
  relativeDayLabel,
} from "@/lib/format";
import { SUB_STATUS_PALETTE } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Quick actions are sibling anchors, never nested inside the card link:
// valid HTML and each keeps its own 44px touch target.
const quickActionClasses =
  "flex size-11 shrink-0 items-center justify-center rounded-md border text-blu transition-colors hover:border-blu";

const isFollowUpDue = (person: DirectoryPerson, now: Date): boolean =>
  person.nextFollowUpAt !== null &&
  awstDayDiff(new Date(person.nextFollowUpAt), now) <= 0;

const lastContactLabel = (person: DirectoryPerson, now: Date): string => {
  if (person.lastContactAt === null) {
    return "Never contacted";
  }
  return `Contacted ${relativeDayLabel(
    awstDayDiff(new Date(person.lastContactAt), now)
  )}`;
};

export function ContactCard({
  person,
  now,
}: {
  person: DirectoryPerson;
  now: Date;
}) {
  const subtitle =
    [person.title, person.companyName].filter(Boolean).join(" · ") ||
    [person.email, person.phone].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-blu">
      <div className="flex items-center gap-2">
        <Link
          className="flex min-w-0 flex-1 items-center gap-3"
          href={`/contacts/${person.id}`}
        >
          <ContactAvatar name={person.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-sm">
              {person.name}
            </span>
            {subtitle && (
              <span className="block truncate text-muted-foreground text-xs">
                {subtitle}
              </span>
            )}
          </span>
        </Link>
        {person.phone && (
          <a
            aria-label={`Call ${person.name}`}
            className={quickActionClasses}
            href={`tel:${person.phone}`}
          >
            <Phone aria-hidden className="size-4.5" />
          </a>
        )}
        {person.phone && (
          <a
            aria-label={`Text ${person.name}`}
            className={quickActionClasses}
            href={`sms:${person.phone}`}
          >
            <MessageSquare aria-hidden className="size-4.5" />
          </a>
        )}
        {person.email && (
          <a
            aria-label={`Email ${person.name}`}
            className={quickActionClasses}
            href={`mailto:${person.email}`}
          >
            <Mail aria-hidden className="size-4.5" />
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground text-xs">
          {lastContactLabel(person, now)}
        </span>
        {isFollowUpDue(person, now) && (
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 font-medium text-xs",
              SUB_STATUS_PALETTE.amber.badge
            )}
          >
            Follow-up due
          </span>
        )}
        {person.openDeals > 0 && (
          <>
            {person.topOpenStage && (
              <Badge variant="secondary">{person.topOpenStage}</Badge>
            )}
            <span className="text-muted-foreground text-xs tabular-nums">
              {person.openDeals} open ·{" "}
              {formatAudFromCents(person.openValueCents)}
            </span>
          </>
        )}
        {person.ownerName && (
          <span className="ml-auto text-muted-foreground text-xs">
            {person.ownerName.split(" ")[0]}
          </span>
        )}
      </div>
    </li>
  );
}
