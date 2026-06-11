"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CompanyField } from "@/components/company-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type ContactActionState,
  updateContact,
} from "@/lib/actions/contact-actions";

export interface EditableContact {
  companyName: string;
  email: string;
  id: string;
  name: string;
  notes: string;
  phone: string;
  title: string;
}

// Same uncontrolled-inputs pattern as ContactForm: the action echoes
// submitted values back so a validation error doesn't wipe the fields.
export function ContactEditForm({
  contact,
  companies,
}: {
  contact: EditableContact;
  companies: string[];
}) {
  const [state, formAction, isPending] = useActionState<
    ContactActionState,
    FormData
  >(updateContact, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="contactId" type="hidden" value={contact.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          className="h-11"
          defaultValue={state.values?.name ?? contact.name}
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
            defaultValue={state.values?.email ?? contact.email}
            id="email"
            name="email"
            type="email"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            className="h-11"
            defaultValue={state.values?.phone ?? contact.phone}
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
            defaultValue={state.values?.title ?? contact.title}
            id="title"
            name="title"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="companyName">Company</Label>
          <CompanyField
            companies={companies}
            defaultValue={state.values?.companyName ?? contact.companyName}
            id="companyName"
            key={state.values?.companyName ?? "initial"}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          defaultValue={state.values?.notes ?? contact.notes}
          id="notes"
          name="notes"
          rows={4}
        />
      </div>

      {state.error && (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          className="h-12 flex-1 text-base"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          className="h-12"
          nativeButton={false}
          render={<Link href={`/contacts/${contact.id}`}>Cancel</Link>}
          variant="outline"
        />
      </div>
    </form>
  );
}
