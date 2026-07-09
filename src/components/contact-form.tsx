"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { CompanyField } from "@/components/company-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ContactActionState,
  createContact,
} from "@/lib/actions/contact-actions";

// Inputs are uncontrolled (so values typed before hydration survive), and the
// action echoes submitted values back via state: React resets the form after
// a server action, and the reset restores these defaultValues, which keeps
// the form filled through the duplicate-warning round trip.
export function ContactForm({
  companies,
  defaultCompanyName = "",
}: {
  companies: string[];
  defaultCompanyName?: string;
}) {
  const [state, formAction, isPending] = useActionState<
    ContactActionState,
    FormData
  >(createContact, {});

  // Success redirects to the new contact (confirmed by a flash toast there);
  // a failure stays put, so surface it as a toast. The inline message and the
  // duplicate warning stay in place.
  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state.error]);

  const hasDuplicates = (state.duplicates?.length ?? 0) > 0;

  let submitLabel = "Add contact";
  if (isPending) {
    submitLabel = "Saving…";
  } else if (hasDuplicates) {
    submitLabel = "Create anyway";
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          autoFocus
          className="h-11"
          defaultValue={state.values?.name ?? ""}
          id="name"
          name="name"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            className="h-11"
            defaultValue={state.values?.email ?? ""}
            id="email"
            name="email"
            type="email"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            className="h-11"
            defaultValue={state.values?.phone ?? ""}
            id="phone"
            inputMode="tel"
            name="phone"
            type="tel"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Role / title</Label>
          <Input
            className="h-11"
            defaultValue={state.values?.title ?? ""}
            id="title"
            name="title"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="companyName">Company</Label>
          <CompanyField
            companies={companies}
            defaultValue={state.values?.companyName ?? defaultCompanyName}
            id="companyName"
            key={state.values?.companyName ?? "initial"}
          />
        </div>
      </div>

      {hasDuplicates && (
        <div
          className="flex flex-col gap-2 rounded-md border border-warning/50 bg-warning/10 p-3"
          role="alert"
        >
          <p className="flex items-center gap-2 font-medium text-sm text-warning">
            <TriangleAlert aria-hidden className="size-4" />
            This looks like an existing contact
          </p>
          <ul className="flex flex-col gap-1">
            {state.duplicates?.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  className="text-sm underline underline-offset-2"
                  href={`/contacts/${candidate.id}`}
                >
                  {candidate.name}
                  {candidate.email ? ` · ${candidate.email}` : ""}
                  {candidate.phone ? ` · ${candidate.phone}` : ""}
                  {candidate.exact ? " (exact match)" : ""}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            Open the existing contact, or create a new one anyway.
          </p>
        </div>
      )}

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      <input
        name="allowDuplicate"
        type="hidden"
        value={hasDuplicates ? "true" : "false"}
      />
      <Button className="h-12 text-base" disabled={isPending} type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}
