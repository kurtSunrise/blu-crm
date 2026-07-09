"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { db } from "@/db";
import { company } from "@/db/schema";
import { runAction } from "@/lib/actions/run-action";
import { requireActionSession } from "@/lib/session";
import { updateCompanySchema } from "@/lib/validation/company";

export interface CompanyActionState {
  error?: string;
  // Submitted values echoed back so the (uncontrolled) form keeps the
  // user's input after a validation error.
  values?: {
    name: string;
    kind: string;
    website: string;
    notes: string;
  };
}

const submittedValues = (
  formData: FormData
): NonNullable<CompanyActionState["values"]> => ({
  name: String(formData.get("name") ?? ""),
  kind: String(formData.get("kind") ?? ""),
  website: String(formData.get("website") ?? ""),
  notes: String(formData.get("notes") ?? ""),
});

export const updateCompany = async (
  _prevState: CompanyActionState,
  formData: FormData
): Promise<CompanyActionState> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const companyId = formData.get("companyId");
    const values = submittedValues(formData);
    if (typeof companyId !== "string") {
      return { error: "This company no longer exists", values };
    }

    const parsed = updateCompanySchema.safeParse({
      name: formData.get("name"),
      kind: formData.get("kind") ?? undefined,
      website: formData.get("website") ?? undefined,
      notes: formData.get("notes") ?? undefined,
    });
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        values,
      };
    }

    const [existing] = await db
      .select({ id: company.id })
      .from(company)
      .where(and(eq(company.id, companyId), isNull(company.deletedAt)))
      .limit(1);
    if (!existing) {
      return { error: "This company no longer exists", values };
    }

    const input = parsed.data;
    await db
      .update(company)
      .set({
        name: input.name,
        kind: input.kind ?? null,
        website: input.website ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(company.id, companyId));

    revalidatePath("/contacts");
    revalidatePath(`/companies/${companyId}`);
    redirect(`/companies/${companyId}?flash=company-updated`);
  });

// Soft delete per PRD §7: the company leaves the directory, but its
// people, deals, and history keep their records.
export const archiveCompany = async (companyId: string): Promise<void> => {
  const auth = await requireActionSession();
  if (!auth.ok) {
    return;
  }
  try {
    await db
      .update(company)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(company.id, companyId), isNull(company.deletedAt)));

    revalidatePath("/contacts");
    revalidatePath("/companies");
    redirect("/companies?flash=company-archived");
  } catch (error) {
    unstable_rethrow(error); // archive actions redirect on success
    console.error("[action-error]", error);
  }
};
