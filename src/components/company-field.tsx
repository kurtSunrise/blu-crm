"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

const MAX_COMPANY_NAME_LENGTH = 500;

// Company linking via Base UI's Autocomplete. The visible input is the
// form field (named companyName), one stable DOM node from SSR onward, so
// typing always lands somewhere real and the server's find-or-create works
// even without JavaScript. Base UI controls the input once hydrated, which
// would reset anything typed earlier on a slow connection; the mount
// effect below adopts the DOM value into state first, so nothing is lost.
export function CompanyField({
  autoFocus = false,
  companies,
  defaultValue,
  id,
  placeholder,
  required = false,
}: {
  autoFocus?: boolean;
  companies: string[];
  defaultValue: string;
  id: string;
  placeholder?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const typed = inputRef.current?.value;
    if (typed !== undefined && typed !== defaultValue) {
      setValue(typed);
    }
  }, [defaultValue]);

  const needle = value.trim().toLowerCase();
  const hasMatches =
    needle === ""
      ? companies.length > 0
      : companies.some((name) => name.toLowerCase().includes(needle));

  return (
    <div className="flex flex-col gap-2">
      <Autocomplete.Root
        items={companies}
        onOpenChange={setOpen}
        onValueChange={setValue}
        open={open && hasMatches}
        openOnInputClick
        value={value}
      >
        <Autocomplete.Input
          render={
            <Input
              autoFocus={autoFocus}
              className="h-11"
              id={id}
              maxLength={MAX_COMPANY_NAME_LENGTH}
              name="companyName"
              placeholder={placeholder}
              ref={inputRef}
              required={required}
            />
          }
        />
        <Autocomplete.Portal>
          <Autocomplete.Positioner className="isolate z-50" sideOffset={4}>
            <Autocomplete.Popup className="data-open:fade-in-0 data-closed:fade-out-0 relative isolate z-50 max-h-[min(20rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in">
              <Autocomplete.List>
                {(name: string) => (
                  <Autocomplete.Item
                    className="flex min-h-11 cursor-default select-none items-center rounded-md px-3 text-sm data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    key={name}
                    value={name}
                  >
                    {name}
                  </Autocomplete.Item>
                )}
              </Autocomplete.List>
            </Autocomplete.Popup>
          </Autocomplete.Positioner>
        </Autocomplete.Portal>
      </Autocomplete.Root>
      <p className="text-muted-foreground text-xs">
        Existing companies appear as you type; a new name creates one.
      </p>
    </div>
  );
}
