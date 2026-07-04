import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Literal class strings because Tailwind only generates classes it can see
// (same constraint as SUB_STATUS_PALETTE in lib/labels.ts). Brand `blu` and
// green are excluded: blu is reserved for links/active states and green reads
// as a status signal, not an identity colour.
const AVATAR_COLORS = [
  // amber-800: the -700 shade fails WCAG AA on the light amber fill.
  "bg-amber-500/15 text-amber-800 dark:text-amber-400",
  "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  "bg-teal-500/15 text-teal-700 dark:text-teal-400",
  "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  "bg-slate-500/15 text-slate-700 dark:text-slate-300",
] as const;

const WHITESPACE = /\s+/;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]/gu;

// "Bek (This Space)" → "BT", never "B(" — brackets and punctuation don't
// belong in a monogram.
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(WHITESPACE)
    .map((word) => word.replace(NON_ALPHANUMERIC, ""))
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

// Deterministic pick so a person keeps the same colour on every render and
// surface.
const colorOf = (name: string): string => {
  let hash = 0;
  for (const char of name) {
    hash = (hash + char.charCodeAt(0)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash];
};

export function ContactAvatar({
  name,
  className,
  size,
}: {
  name: string;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Avatar aria-hidden className={className} size={size}>
      <AvatarFallback className={cn("font-medium", colorOf(name))}>
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}
