import { recordExecutedToolCall } from "@/lib/ai/audit";
import { saveMemory } from "@/lib/ai/memory";
import { type AiTool, defineTool } from "@/lib/ai/tools/types";
import { saveMemoryToolSchema } from "@/lib/validation/memory";

// save_memory executes INLINE like a read tool: memories are the assistant's
// own cross-thread state, not CRM data, so they are exempt from FR-7.8's
// confirm-before-write gate (Kurt's explicit decision: auto-save with a
// review UI in Settings and a one-tap Undo chip in chat, never a per-memory
// confirmation card). Every save is still audited as an "executed"
// ai_audit_log row and is reversible via disableMemory.

const saveMemoryTool = defineTool({
  description:
    "Save a durable fact or preference to remember across all future conversations: user preferences (how they sign emails, how they want answers formatted) and standing facts about clients, leads, or how the team works (for example who handles a client's leads). Call it when the user states something worth keeping beyond this chat. NEVER save transient task state (what is being worked on right now), credentials, or sensitive personal details beyond work context. One fact per call, phrased in third person, 8 to 500 characters (pad a very short fact with its context, e.g. the person's full name).",
  execute: async (input, ctx) => {
    const { id } = await saveMemory({
      content: input.content,
      sourceThreadId: ctx.threadId,
      userId: ctx.userId,
    });
    // AiToolContext carries no tool_use id or message id, so the audit row
    // anchors to the thread with a synthetic tool_use_id (the column is NOT
    // NULL and normally holds the model's block id).
    await recordExecutedToolCall({
      input,
      result: { memoryId: id },
      threadId: ctx.threadId,
      toolName: "save_memory",
      toolUseId: `inline-${crypto.randomUUID()}`,
      userId: ctx.userId,
    });
    return {
      memorySaved: { content: input.content, memoryId: id },
      resultText: `Memory saved: ${input.content}`,
    };
  },
  isWrite: false,
  name: "save_memory",
  schema: saveMemoryToolSchema,
});

export const memoryTools: AiTool[] = [saveMemoryTool];
