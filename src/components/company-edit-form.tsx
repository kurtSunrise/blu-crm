"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  type CompanyActionState,
  updateCompany,
} from "@/lib/actions/company-actions";
import { COMPANY_KINDS } from "@/lib/validation/company";

export interface EditableCompany {
  id: string;
  kind: string;
  name: string;
  notes: string;
  website: string;
}

// Same uncontrolled-inputs pattern as the contact forms: the action
// echoes submitted values back so a validation error keeps the input.
export function CompanyEditForm({ company }: { company: EditableCompany }) {
  const [state, formAction, isPending] = useActionState<
    CompanyActionState,
    FormData
  >(updateCompany, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input name="companyId" type="hidden" value={company.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          className="h-11"
          defaultValue={state.values?.name ?? company.name}
          id="name"
          name="name"
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="kind">Kind</Label>
          <select
            className="flex h-11 rounded-md border border-input bg-transparent px-3 text-sm"
            defaultValue={state.values?.kind ?? company.kind}
            id="kind"
            name="kind"
          >
            <option value="">Not set</option>
            {COMPANY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="website">Website</Label>
          <Input
            className="h-11"
            defaultValue={state.values?.website ?? company.website}
            id="website"
            inputMode="url"
            name="website"
            placeholder="https://"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          defaultValue={state.values?.notes ?? company.notes}
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
          render={<Link href={`/companies/${company.id}`}>Cancel</Link>}
          variant="outline"
        />
      </div>
    </form>
  );
}
