import { formatAudFromCents } from "@/lib/format";
import { cn } from "@/lib/utils";

// Shared range-vs-single-value rendering, used anywhere a deal's headline
// figure is shown, so the pipeline card and closed-deals list can't drift.
export function DealValueDisplay({
  valueCents,
  valueRange,
  className,
}: {
  valueCents: number;
  valueRange: { maxCents: number; minCents: number } | null;
  className?: string;
}) {
  if (valueRange) {
    return (
      <p className={cn("font-medium text-sm", className)}>
        {`${formatAudFromCents(valueRange.minCents)} – ${formatAudFromCents(valueRange.maxCents)}`}
      </p>
    );
  }
  if (valueCents > 0) {
    return (
      <p className={cn("font-medium text-sm", className)}>
        {formatAudFromCents(valueCents)}
      </p>
    );
  }
  return null;
}
