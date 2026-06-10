"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ContactActionState,
  createContact,
} from "@/lib/actions/contact-actions";

// Inputs are controlled so values survive the duplicate-warning round trip —
// React 19 resets uncontrolled fields after a form action completes.
export function ContactForm() {
  const [state, formAction, isPending] = useActionState<
    ContactActionState,
    FormData
  >(createContact, {});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");

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
          id="name"
          name="name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            className="h-11"
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            value={email}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            className="h-11"
            id="phone"
            inputMode="tel"
            name="phone"
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            value={phone}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">Role / title</Label>
          <Input
            className="h-11"
            id="title"
            name="title"
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="companyName">Company</Label>
          <Input
            className="h-11"
            id="companyName"
            name="companyName"
            onChange={(event) => setCompanyName(event.target.value)}
            value={companyName}
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
