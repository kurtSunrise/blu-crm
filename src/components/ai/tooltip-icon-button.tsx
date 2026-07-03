"use client";

import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Small icon-button + tooltip pairing used across the assistant dock header
// and composer, matching the app's Base UI TooltipTrigger `render` pattern
// (not Radix's `asChild`).
export function TooltipIconButton({
  tooltip,
  side = "bottom",
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={tooltip}
            className={cn("size-9 rounded-full", className)}
            size="icon"
            type="button"
            variant="ghost"
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
