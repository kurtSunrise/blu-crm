"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  type CompanyActionState,
  updateCompany,
} from "@/lib/actions/company-actions";
import { COMPANY_KINDS } from "@/lib/validation/company";

export interface EditableCompany {
  abn: string;
  id: string;
  kind: string;
  legalName: string;
  name: string;
  notes: string;
  website: string;
}

interface AbnMatch {
  abn: string;
  name: string;
  postcode: string | null;
  state: string | null;
}

// Same uncontrolled-inputs pattern as the contact forms: the action
// echoes submitted values back so a validation error keeps the input.
// ABN and legal name are the exception (controlled) so the ABR lookup
// can fill them in place.
export function CompanyEditForm({ company }: { company: EditableCompany }) {
  const [state, formAction, isPending] = useActionState<
    CompanyActionState,
    FormData
  >(updateCompany, {});
  const [abn, setAbn] = useState(state.values?.abn ?? company.abn);
  const [legalName, setLegalName] = useState(
    state.values?.legalName ?? company.legalName
  );
  const [matches, setMatches] = useState<AbnMatch[]>([]);
  const [lookupPending, setLookupPending] = useState(false);

  // Success redirects back to the company (confirmed by a flash toast there);
  // a failure stays put, so surface it as a toast. The inline message stays
  // for accessibility.
  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state.error]);

  const applyMatch = (match: AbnMatch): void => {
    setAbn(match.abn);
    setLegalName(match.name);
    setMatches([]);
  };

  const lookUpAbn = async (form: HTMLFormElement | null): Promise<void> => {
    const nameValue = form ? String(new FormData(form).get("name") ?? "") : "";
    const query = abn.trim() || nameValue.trim();
    if (query.length < 2) {
      toast.error("Enter an ABN or a company name first");
      return;
    }
    setLookupPending(true);
    setMatches([]);
    try {
      const response = await fetch(
        `/api/abn-lookup?q=${encodeURIComponent(query)}`
      );
      const payload = (await response.json()) as {
        error?: string;
        matches?: AbnMatch[];
      };
      if (!response.ok) {
        toast.error(payload.error ?? "ABN lookup failed");
        return;
      }
      const found = payload.matches ?? [];
      if (found.length === 0) {
        toast.error("No ABN register match found");
        return;
      }
      if (found.length === 1 && found[0]) {
        applyMatch(found[0]);
        toast.success("ABN details filled from the register");
        return;
      }
      setMatches(found);
    } catch {
      toast.error("ABN lookup failed; check your connection");
    } finally {
      setLookupPending(false);
    }
  };

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
          <NativeSelect
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
          </NativeSelect>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="abn">ABN</Label>
          <div className="flex gap-2">
            <Input
              className="h-11"
              id="abn"
              inputMode="numeric"
              name="abn"
              onChange={(event) => setAbn(event.target.value)}
              placeholder="11 digits"
              value={abn}
            />
            <Button
              className="h-11 shrink-0"
              disabled={lookupPending}
              onClick={(event) => lookUpAbn(event.currentTarget.form)}
              type="button"
              variant="outline"
            >
              {lookupPending ? "Searching…" : "Look up"}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="legalName">Legal name</Label>
          <Input
            className="h-11"
            id="legalName"
            name="legalName"
            onChange={(event) => setLegalName(event.target.value)}
            placeholder="Registered entity name"
            value={legalName}
          />
        </div>
      </div>
      {matches.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs">
            ABN register matches. Pick one to fill the ABN and legal name:
          </p>
          <ul className="flex flex-col gap-1">
            {matches.map((match) => (
              <li key={`${match.abn}-${match.name}`}>
                <button
                  className="flex min-h-11 w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                  onClick={() => applyMatch(match)}
                  type="button"
                >
                  <span className="font-medium">{match.name}</span>
                  <span className="text-muted-foreground text-xs">
                    ABN {match.abn}
                    {match.state ? ` · ${match.state}` : ""}
                    {match.postcode ? ` ${match.postcode}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
