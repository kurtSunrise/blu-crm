"use client";

import { Combobox } from "@base-ui/react/combobox";
import { useState } from "react";
import { Input } from "@/components/ui/input";

const MAX_CONTACT_NAME_LENGTH = 500;

export interface ContactOption {
  companyName: string | null;
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
}

const contactMatchesQuery = (
  contact: ContactOption,
  query: string
): boolean => {
  const needle = query.trim().toLowerCase();
  if (needle === "") {
    return true;
  }
  return (
    contact.name.toLowerCase().includes(needle) ||
    Boolean(contact.email?.toLowerCase().includes(needle)) ||
    Boolean(contact.phone?.toLowerCase().includes(needle))
  );
};

const contactSecondaryText = (contact: ContactOption): string =>
  [contact.email, contact.phone, contact.companyName]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

// Contact linking via Base UI's Combobox, generalizing CompanyField's
// autocomplete skeleton to object items with a genuine selection (unlike
// CompanyField's "type or create" free text, this reports a real Contact
// back to the parent so it can lock phone/email and auto-fill the company).
export function ContactField({
  autoFocus = false,
  contacts,
  id,
  inputValue,
  onInputValueChange,
  onSelectedContactChange,
  placeholder,
}: {
  autoFocus?: boolean;
  contacts: ContactOption[];
  id: string;
  inputValue: string;
  onInputValueChange: (value: string) => void;
  onSelectedContactChange: (contact: ContactOption) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Combobox.Root
        defaultValue={null}
        filter={contactMatchesQuery}
        inputValue={inputValue}
        items={contacts}
        itemToStringLabel={(contact: ContactOption) => contact.name}
        onInputValueChange={onInputValueChange}
        onOpenChange={setOpen}
        onValueChange={(contact: ContactOption | null) => {
          if (contact) {
            onSelectedContactChange(contact);
          }
        }}
        open={open}
        openOnInputClick
      >
        <Combobox.Input
          render={
            <Input
              autoFocus={autoFocus}
              className="h-11"
              id={id}
              maxLength={MAX_CONTACT_NAME_LENGTH}
              name="contactName"
              placeholder={placeholder}
            />
          }
        />
        <Combobox.Portal>
          <Combobox.Positioner className="isolate z-50" sideOffset={4}>
            <Combobox.Popup className="data-open:fade-in-0 data-closed:fade-out-0 relative isolate z-50 max-h-[min(20rem,var(--available-height))] w-(--anchor-width) origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-closed:animate-out data-open:animate-in">
              <Combobox.Empty className="px-3 py-2 text-muted-foreground text-sm">
                No matching contacts; this will create a new one.
              </Combobox.Empty>
              <Combobox.List>
                {(contact: ContactOption) => (
                  <Combobox.Item
                    className="flex min-h-11 cursor-default select-none flex-col justify-center gap-0.5 rounded-md px-3 py-1.5 text-sm data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    key={contact.id}
                    value={contact}
                  >
                    <span>{contact.name}</span>
                    {contactSecondaryText(contact) && (
                      <span className="text-muted-foreground text-xs">
                        {contactSecondaryText(contact)}
                      </span>
                    )}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      <p className="text-muted-foreground text-xs">
        Existing contacts appear as you type; a new name creates one.
      </p>
    </div>
  );
}
