"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CompanyField } from "@/components/company-field";
import { ContactField, type ContactOption } from "@/components/contact-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  type ActionState,
  createQuickAddDeal,
} from "@/lib/actions/deal-actions";

const PROJECT_TYPE_OPTIONS = [
  { value: "fit_out", label: "Fit-out" },
  { value: "retail_display", label: "Retail display" },
  { value: "event_stand", label: "Event stand" },
  { value: "exhibition", label: "Exhibition" },
  { value: "install", label: "Install" },
  { value: "themed_build", label: "Themed build" },
  { value: "other", label: "Other" },
];

export function QuickAddForm({
  owners,
  companies,
  contacts,
}: {
  owners: { id: string; name: string }[];
  companies: string[];
  contacts: ContactOption[];
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createQuickAddDeal,
    {}
  );

  // Success redirects to the pipeline (confirmed by a flash toast there); a
  // failure stays put, so surface it as a toast. The inline message stays for
  // accessibility.
  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state.error]);

  const [companyName, setCompanyName] = useState("");
  const [contactInputValue, setContactInputValue] = useState("");
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(
    null
  );
  const [phoneValue, setPhoneValue] = useState("");
  const [emailValue, setEmailValue] = useState("");

  // Narrow suggestions to the typed company once one is entered, so picking
  // a client doesn't mean searching the whole contact book. Contacts with no
  // company on file stay visible either way, since they may still be
  // relevant to a new client.
  const companyNeedle = companyName.trim().toLowerCase();
  const filteredContacts = useMemo(
    () =>
      companyNeedle === ""
        ? contacts
        : contacts.filter(
            (candidate) =>
              candidate.companyName === null ||
              candidate.companyName.toLowerCase().includes(companyNeedle)
          ),
    [contacts, companyNeedle]
  );

  const handleSelectContact = (contact: ContactOption) => {
    setSelectedContact(contact);
    setPhoneValue(contact.phone ?? "");
    setEmailValue(contact.email ?? "");
    if (contact.companyName) {
      setCompanyName(contact.companyName);
    }
  };

  const handleChangeContact = () => {
    setSelectedContact(null);
    setContactInputValue("");
    setPhoneValue("");
    setEmailValue("");
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="contactId" type="hidden" value={selectedContact?.id ?? ""} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="companyName">Client / brand *</Label>
        <CompanyField
          autoFocus
          companies={companies}
          defaultValue=""
          id="companyName"
          onValueChange={setCompanyName}
          placeholder="e.g. Westfield"
          required
          value={companyName}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="contactName">Contact name</Label>
        {selectedContact ? (
          <div className="flex items-center gap-2">
            <Input
              className="h-11"
              id="contactName"
              name="contactName"
              readOnly
              value={selectedContact.name}
            />
            <Button
              onClick={handleChangeContact}
              type="button"
              variant="outline"
            >
              Change contact
            </Button>
          </div>
        ) : (
          <ContactField
            contacts={filteredContacts}
            id="contactName"
            inputValue={contactInputValue}
            onInputValueChange={setContactInputValue}
            onSelectedContactChange={handleSelectContact}
            placeholder="Type a name to search or add new"
          />
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="contactPhone">Phone</Label>
          <Input
            className="h-11"
            id="contactPhone"
            inputMode="tel"
            name="contactPhone"
            onChange={(event) => setPhoneValue(event.target.value)}
            readOnly={Boolean(selectedContact)}
            type="tel"
            value={phoneValue}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="contactEmail">Email</Label>
          <Input
            className="h-11"
            id="contactEmail"
            name="contactEmail"
            onChange={(event) => setEmailValue(event.target.value)}
            readOnly={Boolean(selectedContact)}
            type="email"
            value={emailValue}
          />
        </div>
      </div>
      <p className="-mt-2 text-muted-foreground text-xs">
        Phone or email — at least one.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="projectType">Project type</Label>
          <NativeSelect defaultValue="" id="projectType" name="projectType">
            <option value="">Not sure yet</option>
            {PROJECT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="fixedDate">Fixed date (install / event)</Label>
          <Input className="h-11" id="fixedDate" name="fixedDate" type="date" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="estimatedValueDollars">Value guess min (AUD)</Label>
          <Input
            className="h-11"
            id="estimatedValueDollars"
            inputMode="numeric"
            min="0"
            name="estimatedValueDollars"
            step="any"
            type="number"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="estimatedValueMaxDollars">
            Value guess max (AUD)
          </Label>
          <Input
            className="h-11"
            id="estimatedValueMaxDollars"
            inputMode="numeric"
            min="0"
            name="estimatedValueMaxDollars"
            step="any"
            type="number"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ownerId">Owner</Label>
        <NativeSelect defaultValue="" id="ownerId" name="ownerId">
          <option value="">Unassigned</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="scopeSummary">What do they want?</Label>
        <Textarea
          id="scopeSummary"
          name="scopeSummary"
          placeholder="Christmas retail display at Carousel…"
          rows={3}
        />
      </div>
      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}
      <Button className="h-12 text-base" disabled={isPending} type="submit">
        {isPending ? "Adding…" : "Add lead"}
      </Button>
    </form>
  );
}
