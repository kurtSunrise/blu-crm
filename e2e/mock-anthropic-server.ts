import { createServer, type ServerResponse } from "node:http";

// Deterministic stand-in for the Anthropic API so Playwright can exercise
// the real /api/chat route, agent loop, tool execution, and chat UI without
// network or API-key dependencies. The dev server is pointed here via
// ANTHROPIC_BASE_URL (see playwright.config.ts).
//
// Script: a turn that already carries tool_result blocks gets a closing text
// answer; a user message mentioning the inbox gets a get_inbox_leads
// tool_use (the loop then executes the real tool against the DB and calls
// back); anything else gets a plain streamed greeting.

const PORT = 4848;

interface SseEvent {
  data: unknown;
  event: string;
}

const sse = (events: SseEvent[]): string =>
  events
    .map(
      (entry) =>
        `event: ${entry.event}\ndata: ${JSON.stringify(entry.data)}\n\n`
    )
    .join("");

const messageEnvelope = (events: SseEvent[], stopReason: string): string =>
  sse([
    {
      data: {
        message: {
          content: [],
          id: `msg_mock_${Date.now()}`,
          model: "claude-opus-4-8",
          role: "assistant",
          stop_reason: null,
          stop_sequence: null,
          type: "message",
          usage: { input_tokens: 10, output_tokens: 1 },
        },
        type: "message_start",
      },
      event: "message_start",
    },
    ...events,
    {
      data: {
        delta: { stop_reason: stopReason, stop_sequence: null },
        type: "message_delta",
        usage: { output_tokens: 20 },
      },
      event: "message_delta",
    },
    { data: { type: "message_stop" }, event: "message_stop" },
  ]);

const textEvents = (text: string, index = 0): SseEvent[] => {
  const middle = Math.ceil(text.length / 2);
  return [
    {
      data: {
        content_block: { text: "", type: "text" },
        index,
        type: "content_block_start",
      },
      event: "content_block_start",
    },
    {
      data: {
        delta: { text: text.slice(0, middle), type: "text_delta" },
        index,
        type: "content_block_delta",
      },
      event: "content_block_delta",
    },
    {
      data: {
        delta: { text: text.slice(middle), type: "text_delta" },
        index,
        type: "content_block_delta",
      },
      event: "content_block_delta",
    },
    {
      data: { index, type: "content_block_stop" },
      event: "content_block_stop",
    },
  ];
};

// A multi-write plan needs several tool_use blocks in ONE assistant message,
// so callers can pin a distinct id and content-block index per call.
const toolUseEvents = (
  name: string,
  input: unknown = {},
  block: { id?: string; index?: number } = {}
): SseEvent[] => {
  const index = block.index ?? 0;
  return [
    {
      data: {
        content_block: {
          id: block.id ?? `toolu_mock_${Date.now()}`,
          input: {},
          name,
          type: "tool_use",
        },
        index,
        type: "content_block_start",
      },
      event: "content_block_start",
    },
    {
      data: {
        delta: {
          partial_json: JSON.stringify(input),
          type: "input_json_delta",
        },
        index,
        type: "content_block_delta",
      },
      event: "content_block_delta",
    },
    {
      data: { index, type: "content_block_stop" },
      event: "content_block_stop",
    },
  ];
};

interface AnthropicRequestBody {
  messages?: {
    content?: string | { text?: string; type?: string }[];
    role?: string;
  }[];
}

const hasToolResult = (body: AnthropicRequestBody): boolean =>
  (body.messages ?? []).some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((block) => block.type === "tool_result")
  );

// Every user text block in the transcript, oldest first. Scenario triggers
// that must still match on the tool_result turn use this: that turn's LAST
// user message carries only tool_result blocks, so lastUserText returns "".
const allUserText = (body: AnthropicRequestBody): string =>
  (body.messages ?? [])
    .filter((message) => message.role === "user")
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : (message.content ?? [])
            .filter((block) => block.type === "text")
            .map((block) => block.text ?? "")
            .join("\n")
    )
    .join("\n");

const lastUserText = (body: AnthropicRequestBody): string => {
  const lastUser = [...(body.messages ?? [])]
    .reverse()
    .find((message) => message.role === "user");
  if (!lastUser) {
    return "";
  }
  if (typeof lastUser.content === "string") {
    return lastUser.content;
  }
  return (lastUser.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n");
};

const INBOX_PATTERN = /inbox/i;
const CAPTURE_PATTERN = /capture/i;
const DRAFT_PATTERN = /draft/i;
const CHASE_PATTERN = /chase|prioriti/i;
// A two-item write plan: two create_lead tool_use blocks in one assistant
// message, so the checklist confirmation card renders and the route executes
// the plan sequentially.
const TWO_STEP_PATTERN = /two-step plan/i;
// Knowledge scenario: the loop runs search_knowledge_base against the real
// DB, then the tool_result turn closes with text and the source chips render.
const KNOWLEDGE_PATTERN = /deposit|policy/i;
// Weekly-report scenario (Assistant v3): the loop runs the real
// get_weekly_report read tool against the DB, which emits the weekly_report
// artifact card; the tool_result turn then closes with text. Matches both
// the typed ask and the /reports/weekly Ask-AI prefill wording.
const WEEKLY_REPORT_PATTERN = /weekly report|pipeline report/i;
// Memory scenario (Assistant v3 Phase 3): save_memory executes inline (no
// confirmation card), writing a real assistant_memory row; the loop streams
// a memory_saved payload and the chip renders. The spec's UNIQ token rides
// into the memory content so assertions can find the row and its 13-digit
// timestamp keeps it sweepable on the shared DB (see test-data-sweep).
const MEMORY_PATTERN = /remember|save.*memory/i;
// Citations scenario (Assistant v3 Phase 3): the first call returns a
// search_knowledge_base tool_use (so the real tool runs and a flat sources
// artifact exists for the suppression assertion); the tool_result turn is
// then answered by streamCitations, whose citations_delta makes the agent
// loop inject an inline " [1]" marker and emit the numbered citation payload.
const CITATION_PATTERN = /cite|policy question/i;
// Hardening scenarios: a turn that opens then goes silent (the app's idle
// timeout must abort and surface a retryable error) and a turn that pings then
// pauses before answering (the client's "Thinking…" indicator must show).
const STALL_PATTERN = /trigger an assistant stall/i;
const THINKING_PATTERN = /take a moment to think/i;
// Extended-thinking scenario: a thinking block streams summary deltas, pauses
// so the spec can observe the open Reasoning section, then answers with text.
const REASONING_PATTERN = /reason through/i;
const THINKING_DELAY_MS = 2000;
// Gap between successive thinking-stream steps. Must stay comfortably under
// the suite's AI_IDLE_TIMEOUT_MS (3000) so the idle watchdog never trips,
// while keeping the Reasoning section open for ~3s in total.
const REASONING_STEP_MS = 1000;
// Specs embed a unique company token so accumulated data on the shared dev
// DB never causes false positives.
const COMPANY_TOKEN_PATTERN = /UNIQ-\d+/;
const ALL_COMPANY_TOKENS_PATTERN = /UNIQ-\d+/g;

// The stall scenario only stalls the FIRST request per unique message text;
// a regenerate retry of the same turn then gets a normal greeting, so the
// spec can prove "Try again" recovers. Specs make the stall message unique
// per run (UNIQ token) so parallel projects never share an entry.
const stalledOnce = new Set<string>();

const respond = (body: AnthropicRequestBody): string => {
  if (hasToolResult(body)) {
    return messageEnvelope(
      textEvents("Mock summary: all done here."),
      "end_turn"
    );
  }
  const userText = lastUserText(body);
  if (CAPTURE_PATTERN.test(userText)) {
    const companyName =
      userText.match(COMPANY_TOKEN_PATTERN)?.[0] ?? "Westfield AI Mock Co";
    return messageEnvelope(
      toolUseEvents("create_lead", {
        companyName,
        contactEmail: "sarah.chen@example.com",
        contactName: "Sarah Chen",
        estimatedValueDollars: 40_000,
        projectType: "retail_display",
        scopeSummary: "Christmas display for centre court",
        source: "web",
      }),
      "tool_use"
    );
  }
  if (DRAFT_PATTERN.test(userText)) {
    return messageEnvelope(
      toolUseEvents("present_draft", {
        body: "Hi Sarah,\n\nThanks for your enquiry about the centre court display. We would love to put a concept together for you.\n\nCheers,\nBlu Builders",
        kind: "followup_email",
        subject: "Your Christmas display enquiry",
        title: "Follow-up to Westfield",
      }),
      "tool_use"
    );
  }
  if (TWO_STEP_PATTERN.test(userText)) {
    const tokens = userText.match(ALL_COMPANY_TOKENS_PATTERN) ?? [];
    const stamp = Date.now();
    const leadInput = (companyName: string) => ({
      companyName,
      scopeSummary: "Two-step plan fixture lead",
      source: "web",
    });
    return messageEnvelope(
      [
        ...toolUseEvents(
          "create_lead",
          leadInput(tokens[0] ?? "Two Step Mock Co A"),
          { id: `toolu_mock_plan_a_${stamp}`, index: 0 }
        ),
        ...toolUseEvents(
          "create_lead",
          leadInput(tokens[1] ?? "Two Step Mock Co B"),
          { id: `toolu_mock_plan_b_${stamp}`, index: 1 }
        ),
      ],
      "tool_use"
    );
  }
  if (MEMORY_PATTERN.test(userText)) {
    const token = userText.match(COMPANY_TOKEN_PATTERN)?.[0];
    return messageEnvelope(
      toolUseEvents("save_memory", {
        content: token
          ? `Jess prefers SMS follow-ups for Bunnings leads (${token})`
          : "Jess prefers SMS follow-ups for Bunnings leads",
      }),
      "tool_use"
    );
  }
  // Before KNOWLEDGE: the citations trigger ("policy question") also matches
  // the knowledge pattern, and this scenario needs its own query wording.
  if (CITATION_PATTERN.test(userText)) {
    const token = userText.match(COMPANY_TOKEN_PATTERN)?.[0];
    return messageEnvelope(
      toolUseEvents("search_knowledge_base", {
        query: token ? `brand voice ${token}` : "brand voice",
      }),
      "tool_use"
    );
  }
  if (KNOWLEDGE_PATTERN.test(userText)) {
    const token = userText.match(COMPANY_TOKEN_PATTERN)?.[0];
    return messageEnvelope(
      toolUseEvents("search_knowledge_base", {
        query: token ? `deposit terms ${token}` : "deposit terms",
      }),
      "tool_use"
    );
  }
  if (WEEKLY_REPORT_PATTERN.test(userText)) {
    return messageEnvelope(toolUseEvents("get_weekly_report"), "tool_use");
  }
  if (CHASE_PATTERN.test(userText)) {
    return messageEnvelope(toolUseEvents("rank_open_deals"), "tool_use");
  }
  if (INBOX_PATTERN.test(userText)) {
    return messageEnvelope(toolUseEvents("get_inbox_leads"), "tool_use");
  }
  return messageEnvelope(
    textEvents("Hello from the mock assistant."),
    "end_turn"
  );
};

const startFrame = (): string =>
  sse([
    {
      data: {
        message: {
          content: [],
          id: `msg_mock_${Date.now()}`,
          model: "claude-opus-4-8",
          role: "assistant",
          stop_reason: null,
          stop_sequence: null,
          type: "message",
          usage: { input_tokens: 10, output_tokens: 1 },
        },
        type: "message_start",
      },
      event: "message_start",
    },
  ]);

const endFrame = (stopReason: string): string =>
  sse([
    {
      data: {
        delta: { stop_reason: stopReason, stop_sequence: null },
        type: "message_delta",
        usage: { output_tokens: 20 },
      },
      event: "message_delta",
    },
    { data: { type: "message_stop" }, event: "message_stop" },
  ]);

const pingFrame = (): string =>
  sse([{ data: { type: "ping" }, event: "ping" }]);

// Opens the stream then stays silent: no further bytes ever arrive, so the
// app's idle-timeout abort must fire and the route must emit a retryable error
// rather than the request hanging forever.
const streamStall = (res: ServerResponse): void => {
  res.write(startFrame());
};

// Sends a liveness ping (which the app forwards as a "thinking" status) and
// then pauses before the answer, so the client's "Thinking…" indicator is
// observable before real text replaces it.
const streamThinking = (res: ServerResponse): void => {
  res.write(startFrame());
  res.write(pingFrame());
  const timer = setTimeout(() => {
    if (res.writableEnded) {
      return;
    }
    res.write(sse(textEvents("Here is the considered answer.")));
    res.write(endFrame("end_turn"));
    res.end();
  }, THINKING_DELAY_MS);
  // Cancel the pending write if the client disconnects first. res "close"
  // fires on client disconnect (cancel) or after a normal end() (no-op);
  // req "close" fires as soon as the request body is read, which would
  // wrongly cancel the answer.
  res.on("close", () => clearTimeout(timer));
};

const thinkingDelta = (thinking: string): SseEvent => ({
  data: {
    delta: { thinking, type: "thinking_delta" },
    index: 0,
    type: "content_block_delta",
  },
  event: "content_block_delta",
});

// Streams an extended-thinking block: summary deltas trickle in one per step
// (keeping the Reasoning section observably open, even on slow WebKit
// renders, without ever exceeding the suite's shrunk idle timeout), then the
// signature closes the block and a text answer follows. Mirrors the
// Anthropic thinking event shapes the real client parses.
const streamReasoning = (res: ServerResponse): void => {
  res.write(startFrame());
  res.write(
    sse([
      {
        data: {
          content_block: { signature: "", thinking: "", type: "thinking" },
          index: 0,
          type: "content_block_start",
        },
        event: "content_block_start",
      },
      thinkingDelta("Considering the pipeline "),
    ])
  );

  const steps: (() => void)[] = [
    () => res.write(sse([thinkingDelta("before answering ")])),
    () => res.write(sse([thinkingDelta("with care.")])),
    () => {
      res.write(
        sse([
          {
            data: {
              delta: { signature: "mock-signature", type: "signature_delta" },
              index: 0,
              type: "content_block_delta",
            },
            event: "content_block_delta",
          },
          {
            data: { index: 0, type: "content_block_stop" },
            event: "content_block_stop",
          },
        ])
      );
      res.write(sse(textEvents("Here is the reasoned answer.", 1)));
      res.write(endFrame("end_turn"));
      res.end();
    },
  ];

  const timers: ReturnType<typeof setTimeout>[] = [];
  steps.forEach((step, index) => {
    timers.push(
      setTimeout(
        () => {
          if (!res.writableEnded) {
            step();
          }
        },
        REASONING_STEP_MS * (index + 1)
      )
    );
  });
  res.on("close", () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
  });
};

// The exact citation record the Anthropic API attaches to an answering text
// block when the request carried citable search_result blocks. The agent
// loop's citations_delta handler numbers it (dedupe key: title), injects the
// inline " [1]" marker into the visible stream, and emits the numbered
// citation payload the Sources list renders.
const CITATIONS_DELTA_EVENT: SseEvent = {
  data: {
    delta: {
      citation: {
        cited_text:
          "Blu is The Creative Build Company: warm, confident, and never salesy.",
        end_block_index: 1,
        search_result_index: 0,
        source: "Brand voice",
        start_block_index: 0,
        title: "Brand voice § Tone",
        type: "search_result_location",
      },
      type: "citations_delta",
    },
    index: 0,
    type: "content_block_delta",
  },
  event: "content_block_delta",
};

// Scripted closing answer for the citations scenario's tool_result turn:
// text streams, a citations_delta lands mid-block right after the cited
// span (so the injected " [1]" sits inside the sentence, as the real API
// interleaves it), then more text closes the block.
const streamCitations = (res: ServerResponse): void => {
  res.write(startFrame());
  res.write(
    sse([
      {
        data: {
          content_block: { text: "", type: "text" },
          index: 0,
          type: "content_block_start",
        },
        event: "content_block_start",
      },
      {
        data: {
          delta: {
            text: "Our brand voice policy: lead with warmth",
            type: "text_delta",
          },
          index: 0,
          type: "content_block_delta",
        },
        event: "content_block_delta",
      },
      CITATIONS_DELTA_EVENT,
      {
        data: {
          delta: {
            text: " and keep every follow-up upbeat.",
            type: "text_delta",
          },
          index: 0,
          type: "content_block_delta",
        },
        event: "content_block_delta",
      },
      {
        data: { index: 0, type: "content_block_stop" },
        event: "content_block_stop",
      },
    ])
  );
  res.write(endFrame("end_turn"));
  res.end();
};

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/v1/messages")) {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
    });
    req.on("end", () => {
      let body: AnthropicRequestBody = {};
      try {
        body = JSON.parse(raw) as AnthropicRequestBody;
      } catch {
        body = {};
      }
      res.writeHead(200, {
        "cache-control": "no-store",
        "content-type": "text/event-stream",
      });
      const userText = lastUserText(body);
      if (STALL_PATTERN.test(userText) && !stalledOnce.has(userText)) {
        stalledOnce.add(userText);
        streamStall(res);
        return;
      }
      if (THINKING_PATTERN.test(userText)) {
        streamThinking(res);
        return;
      }
      if (REASONING_PATTERN.test(userText) && !hasToolResult(body)) {
        streamReasoning(res);
        return;
      }
      // The citations scenario's SECOND call: the trigger text lives on the
      // first user turn (the tool_result turn's own user message has no text
      // blocks), so the whole transcript is scanned.
      if (hasToolResult(body) && CITATION_PATTERN.test(allUserText(body))) {
        streamCitations(res);
        return;
      }
      res.end(respond(body));
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message: "not found" } }));
});

server.listen(PORT, () => {
  process.stdout.write(`Mock Anthropic server listening on :${PORT}\n`);
});
