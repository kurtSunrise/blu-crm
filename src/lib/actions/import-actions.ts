"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contact, pipelineStage, user } from "@/db/schema";
import { runAction } from "@/lib/actions/run-action";
import { findDuplicateContacts } from "@/lib/duplicates";
import { dollarsToCents } from "@/lib/format";
import { createLead, findOrCreateCompany } from "@/lib/intake";
import { requireActionSession } from "@/lib/session";
import {
  contactImportRowsSchema,
  dealImportRowsSchema,
} from "@/lib/validation/import";

// CSV import (FR-3.4): the client maps CSV columns onto field names and
// sends plain row objects; the server re-validates everything.

export interface ImportPreviewRow {
  // Names of existing contacts this row would duplicate (FR-2.3 rules).
  duplicateOf: string[];
  index: number;
}

export interface ImportPreviewResult {
  error?: string;
  rows?: ImportPreviewRow[];
}

export const previewContactImport = async (
  input: unknown
): Promise<ImportPreviewResult> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = contactImportRowsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid rows" };
    }

    const rows: ImportPreviewRow[] = [];
    for (const [index, row] of parsed.data.entries()) {
      const duplicates = await findDuplicateContacts(row);
      rows.push({ index, duplicateOf: duplicates.map((dup) => dup.name) });
    }
    return { rows };
  });

export interface ImportCommitResult {
  created?: number;
  error?: string;
  skippedDuplicates?: number;
}

export const commitContactImport = async (input: {
  rows: unknown;
  importDuplicates: boolean;
}): Promise<ImportCommitResult> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = contactImportRowsSchema.safeParse(input.rows);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid rows" };
    }

    let created = 0;
    let skippedDuplicates = 0;

    for (const row of parsed.data) {
      if (!input.importDuplicates) {
        const duplicates = await findDuplicateContacts(row);
        if (duplicates.length > 0) {
          skippedDuplicates += 1;
          continue;
        }
      }

      const companyId = row.companyName
        ? await findOrCreateCompany(row.companyName, undefined)
        : undefined;
      await db.insert(contact).values({
        name: row.name,
        email: row.email,
        phone: row.phone,
        title: row.title,
        companyId,
      });
      created += 1;
    }

    revalidatePath("/contacts");
    return { created, skippedDuplicates };
  });

export const commitDealImport = async (input: {
  rows: unknown;
}): Promise<ImportCommitResult> =>
  runAction(async () => {
    const auth = await requireActionSession();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = dealImportRowsSchema.safeParse(input.rows);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid rows" };
    }

    const stages = await db
      .select({ id: pipelineStage.id, name: pipelineStage.name })
      .from(pipelineStage);
    const stageByName = new Map(
      stages.map((stage) => [stage.name.toLowerCase(), stage.id])
    );

    const users = await db
      .select({ id: user.id, email: user.email })
      .from(user);
    const userByEmail = new Map(
      users.map((person) => [person.email.toLowerCase(), person.id])
    );

    let created = 0;
    for (const row of parsed.data) {
      const ownerId = row.ownerEmail
        ? userByEmail.get(row.ownerEmail.toLowerCase())
        : undefined;
      const stageId = row.stageName
        ? stageByName.get(row.stageName.toLowerCase())
        : undefined;

      const dealId = await createLead({
        companyName: row.companyName,
        contactName: row.contactName,
        contactEmail: row.contactEmail,
        contactPhone: row.contactPhone,
        projectType: row.projectType,
        scopeSummary: row.scopeSummary,
        estimatedValueCents: row.estimatedValueDollars
          ? dollarsToCents(row.estimatedValueDollars)
          : undefined,
        fixedDate: row.fixedDate,
        ownerId,
        source: "other",
        title: row.title,
        stageId,
      });
      if (dealId) {
        created += 1;
      }
    }

    revalidatePath("/pipeline");
    revalidatePath("/contacts");
    return { created, skippedDuplicates: 0 };
  });
