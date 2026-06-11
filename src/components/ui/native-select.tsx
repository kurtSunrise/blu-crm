import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// A styled native <select>, visually matched to the Select trigger in
// ./select.tsx. The browser indicator is suppressed (appearance-none) and the
// chevron drawn inset, so it never touches the control's border. Use this for
// plain form fields — it keeps FormData semantics, required validation, and
// the platform picker on phones; reach for ./select.tsx when a styled popup
// is worth the extra wiring.
function NativeSelect({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<"select"> & { containerClassName?: string }) {
  return (
    <span
      className={cn("relative block w-full", containerClassName)}
      data-slot="native-select-container"
    >
      <select
        className={cn(
          "flex h-11 w-full appearance-none items-center rounded-lg border border-input bg-transparent py-2 pr-9 pl-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50",
          className
        )}
        data-slot="native-select"
        {...props}
      />
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}

export { NativeSelect };
