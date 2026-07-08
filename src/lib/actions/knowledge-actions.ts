"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/actions/run-action";
import {
  deleteKnowledgeDocCore,
  saveKnowledgeDocCore,
} from "@/lib/mutations/knowledge";
import { requireActionAdmin } from "@/lib/session";
import {
  deleteKnowledgeDocSchema,
  saveKnowledgeDocSchema,
} from "@/lib/validation/knowledge";

// Knowledge base admin (Assistant v3 Phase 4): admins create, edit, and
// delete the docs the assistant's search_knowledge_base tool retrieves from,
// replacing the CLI-only `npm run knowledge:import` flow. Writes go through
// src/lib/mutations/knowledge.ts so future AI tools share the same path.

export interface KnowledgeActionState {
  chunkCount?: number;
  embeddedCount?: number;
  error?: string;
  message?: string;
}

export const saveKnowledgeDocAction = async (
  input: unknown
): Promise<KnowledgeActionState> =>
  runAction(async () => {
    const auth = await requireActionAdmin();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = saveKnowledgeDocSchema.safeParse(input);
    if (!parsed.success) {
      return {
        error:
          "Check the document: title up to 120 characters, category up to 60, content required and up to 30,000 characters.",
      };
    }

    const result = await saveKnowledgeDocCore({
      category:
        parsed.data.category && parsed.data.category.length > 0
          ? parsed.data.category
          : null,
      content: parsed.data.content,
      id: parsed.data.id,
      title: parsed.data.title,
    });
    if (result.error) {
      return { error: result.error };
    }

    revalidatePath("/settings/knowledge");
    return {
      chunkCount: result.chunkCount,
      embeddedCount: result.embeddedCount,
      message: "Document saved.",
    };
  });

export const deleteKnowledgeDocAction = async (
  input: unknown
): Promise<KnowledgeActionState> =>
  runAction(async () => {
    const auth = await requireActionAdmin();
    if (!auth.ok) {
      return { error: auth.error };
    }
    const parsed = deleteKnowledgeDocSchema.safeParse(input);
    if (!parsed.success) {
      return { error: "That document reference isn't valid." };
    }

    const result = await deleteKnowledgeDocCore(parsed.data.id);
    if (result.error) {
      return { error: result.error };
    }

    revalidatePath("/settings/knowledge");
    return { message: "Document deleted." };
  });
