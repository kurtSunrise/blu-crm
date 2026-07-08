"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// A horizontally scrollable row that adds the two affordances a plain
// overflow-x-auto row lacks on phones:
//   1. Scrolls its active child ([aria-current="page"]) into view on mount, so a
//      current tab that starts off-screen (e.g. "Daily", the 6th report pill)
//      is revealed instead of hidden.
//   2. Fades whichever edge still has content off-screen, cueing that the row
//      scrolls sideways. The fade is mobile-only; desktop rows wrap, so md:
//      clears the mask and the overflow.
// Reused by the pill sub-nav and the pipeline status-filter row so the pattern
// lives in one place. Purely presentational — callers supply the semantics
// (the <nav>/<fieldset> wrapper) and the flex/layout classes via className.
export function ScrollRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    const updateOverflow = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      const atStart = el.scrollLeft > 1;
      const atEnd = el.scrollLeft < maxScroll - 1;
      let overflow: "none" | "start" | "end" | "both" = "none";
      if (atStart && atEnd) {
        overflow = "both";
      } else if (atStart) {
        overflow = "start";
      } else if (atEnd) {
        overflow = "end";
      }
      el.dataset.overflow = overflow;
    };

    // Reveal the active item if it starts off-screen. inline/block "nearest"
    // and instant behavior keep it from animating or nudging the page
    // vertically on load.
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({
      behavior: "instant",
      inline: "nearest",
      block: "nearest",
    });

    updateOverflow();
    el.addEventListener("scroll", updateOverflow, { passive: true });
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", updateOverflow);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className={cn(
        "overflow-x-auto",
        // Edge fade cues (phones only): mask fades the side(s) with more content.
        "data-[overflow=start]:[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]",
        "data-[overflow=end]:[mask-image:linear-gradient(to_left,transparent,black_1.5rem)]",
        "data-[overflow=both]:[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]",
        "md:overflow-visible md:[mask-image:none]",
        className
      )}
      ref={ref}
    >
      {children}
    </div>
  );
}
