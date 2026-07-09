"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

// Success messages keyed by the ?flash=<key> marker that a redirecting server
// action appends to its destination. Forms and archive actions redirect on
// success, so they can't toast in place (redirect() throws to navigate); this
// confirms on the page they land on instead.
const FLASH_MESSAGES: Record<string, string> = {
  "deal-created": "Lead added",
  "contact-created": "Contact added",
  "contact-updated": "Contact saved",
  "company-updated": "Company saved",
  "contact-archived": "Contact archived",
  "company-archived": "Company archived",
};

// Fires a one-off success toast after a redirect carrying ?flash=<key>, then
// strips the marker so a refresh or back-navigation doesn't replay it. Mounted
// once in the (app) layout, so it covers every redirect target.
export function ToastFlash() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const flash = searchParams.get("flash");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!flash || handled.current === flash) {
      return;
    }
    handled.current = flash;
    const message = FLASH_MESSAGES[flash];
    if (message) {
      toast.success(message);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("flash");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [flash, pathname, router, searchParams]);

  return null;
}
