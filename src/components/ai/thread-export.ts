// Serializes the current thread's runtime messages to Markdown for the
// "Copy as Markdown" action in the dock header. Pure client-side: text parts
// are copied verbatim, artifact cards become short placeholders, and
// sources/citations collapse to one "Sources:" line. Reasoning, tool-call
// chips, and invisible data parts (message_meta, retry_hint) are skipped.

export interface ExportMessageLike {
  content: unknown;
  role: string;
}

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const dealCardLine = (data: Record<string, unknown> | null): string => {
  const title = asString(data?.title) ?? asString(data?.leadId) ?? "deal";
  return `[Deal card: ${title}]`;
};

const dealListLine = (data: Record<string, unknown> | null): string => {
  const title = asString(data?.title) ?? "deals";
  return `[Deal list: ${title}]`;
};

const draftLine = (data: Record<string, unknown> | null): string => {
  const kind = asString(data?.kind) ?? "message";
  return `[Draft: ${kind}]`;
};

const memoryLine = (data: Record<string, unknown> | null): string => {
  const content = asString(data?.content);
  return content ? `[Memory saved: ${content}]` : "[Memory saved]";
};

const confirmationLines = (
  data: Record<string, unknown> | null
): string | null => {
  const items = Array.isArray(data?.items) ? data.items : [];
  const summaries = items
    .map((item) => asString(asRecord(item)?.summary))
    .filter((summary): summary is string => summary !== null);
  if (summaries.length === 0) {
    return null;
  }
  return summaries.map((summary) => `[Proposed change: ${summary}]`).join("\n");
};

const sourcesLine = (data: Record<string, unknown> | null): string | null => {
  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const labels = sources
    .map((source) => {
      const record = asRecord(source);
      const title = asString(record?.docTitle);
      if (!title) {
        return null;
      }
      const heading = asString(record?.heading);
      return heading ? `${title} (${heading})` : title;
    })
    .filter((label): label is string => label !== null);
  if (labels.length === 0) {
    return null;
  }
  return `Sources: ${labels.join("; ")}`;
};

const citationsLine = (data: Record<string, unknown> | null): string | null => {
  const citations = Array.isArray(data?.citations) ? data.citations : [];
  const labels = citations
    .map((citation) => {
      const record = asRecord(citation);
      const title = asString(record?.title);
      const marker = record?.marker;
      if (!title || typeof marker !== "number") {
        return title;
      }
      return `[${marker}] ${title}`;
    })
    .filter((label): label is string => label !== null);
  if (labels.length === 0) {
    return null;
  }
  return `Sources: ${labels.join("; ")}`;
};

const dataPartToMarkdown = (
  name: string,
  data: Record<string, unknown> | null
): string | null => {
  switch (name) {
    case "deal_card":
      return dealCardLine(data);
    case "deal_list":
      return dealListLine(data);
    case "weekly_report":
      return "[Weekly report]";
    case "draft_message":
      return draftLine(data);
    case "confirmation_request":
      return confirmationLines(data);
    case "memory_saved":
      return memoryLine(data);
    case "sources":
      return sourcesLine(data);
    case "citations":
      return citationsLine(data);
    default:
      // message_meta, retry_hint, and any future invisible parts.
      return null;
  }
};

const partToMarkdown = (part: unknown): string | null => {
  const record = asRecord(part);
  if (!record) {
    return null;
  }
  if (record.type === "text") {
    const text = asString(record.text);
    return text ? text.trim() : null;
  }
  if (record.type === "data") {
    const name = asString(record.name);
    return name ? dataPartToMarkdown(name, asRecord(record.data)) : null;
  }
  // Reasoning and tool-call parts are transcript noise for an export.
  return null;
};

const messageBody = (content: unknown): string => {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map(partToMarkdown)
    .filter((chunk): chunk is string => chunk !== null && chunk.length > 0)
    .join("\n\n");
};

// Returns the whole conversation as Markdown, or an empty string when there
// is nothing worth copying (no user or assistant turn with content).
export const serializeThreadToMarkdown = (
  messages: readonly ExportMessageLike[]
): string => {
  const sections: string[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") {
      continue;
    }
    const body = messageBody(message.content);
    if (!body) {
      continue;
    }
    const heading = message.role === "user" ? "## You" : "## Assistant";
    sections.push(`${heading}\n\n${body}`);
  }
  return sections.join("\n\n");
};
