import { count, desc } from "drizzle-orm";
import { BookOpen } from "lucide-react";
import {
  KnowledgeDocEditor,
  type KnowledgeDocItem,
} from "@/components/knowledge-doc-editor";
import { SettingsPanel, SettingsSection } from "@/components/settings-section";
import { db } from "@/db";
import { knowledgeChunk, knowledgeDoc } from "@/db/schema";
import { formatDateAwst } from "@/lib/format";
import { requireSession } from "@/lib/session";

export const metadata = {
  title: "Settings · Knowledge | Blu CRM",
};

export const dynamic = "force-dynamic";

// The corpus is a handful of docs today; the LIMIT keeps a runaway table from
// ever flooding this render (house rule: unbounded list queries take a LIMIT).
const DOC_LIMIT = 100;

export default async function KnowledgeSettingsPage() {
  const session = await requireSession();
  const isAdmin = session.user.role === "admin";

  if (!isAdmin) {
    return (
      <SettingsSection
        description="The documents the assistant searches when it answers questions about how Blu Builders works."
        icon={BookOpen}
        title="Knowledge base"
      >
        <SettingsPanel>
          <p className="text-muted-foreground text-sm">
            Admins only. Ask an admin to change the knowledge base.
          </p>
        </SettingsPanel>
      </SettingsSection>
    );
  }

  // Independent reads fan out together (sequential Neon awaits in one render
  // have caused 503s on workerd).
  const [docs, chunkStats] = await Promise.all([
    db
      .select({
        category: knowledgeDoc.category,
        content: knowledgeDoc.content,
        id: knowledgeDoc.id,
        title: knowledgeDoc.title,
        updatedAt: knowledgeDoc.updatedAt,
      })
      .from(knowledgeDoc)
      .orderBy(desc(knowledgeDoc.updatedAt))
      .limit(DOC_LIMIT),
    // count(column) skips nulls, so counting the embedding column yields the
    // embedded subset alongside the total in one grouped pass.
    db
      .select({
        chunkCount: count(knowledgeChunk.id),
        docId: knowledgeChunk.docId,
        embeddedCount: count(knowledgeChunk.embedding),
      })
      .from(knowledgeChunk)
      .groupBy(knowledgeChunk.docId),
  ]);

  const statsByDoc = new Map(chunkStats.map((row) => [row.docId, row]));
  const items: KnowledgeDocItem[] = docs.map((doc) => ({
    category: doc.category,
    chunkCount: statsByDoc.get(doc.id)?.chunkCount ?? 0,
    content: doc.content,
    embeddedCount: statsByDoc.get(doc.id)?.embeddedCount ?? 0,
    id: doc.id,
    title: doc.title,
    updatedAtLabel: formatDateAwst(doc.updatedAt),
  }));
  const categories = [
    ...new Set(items.flatMap((item) => (item.category ? [item.category] : []))),
  ].sort();

  return (
    <SettingsSection
      description="The company know-how the assistant searches when it answers: brand voice, pricing rules, sales process. Edits apply to the next assistant answer straight away."
      icon={BookOpen}
      title="Knowledge base"
    >
      <SettingsPanel>
        <KnowledgeDocEditor categories={categories} docs={items} />
      </SettingsPanel>
    </SettingsSection>
  );
}
