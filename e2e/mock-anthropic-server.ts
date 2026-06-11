import { createServer } from "node:http";

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

const textEvents = (text: string): SseEvent[] => {
  const middle = Math.ceil(text.length / 2);
  return [
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
        delta: { text: text.slice(0, middle), type: "text_delta" },
        index: 0,
        type: "content_block_delta",
      },
      event: "content_block_delta",
    },
    {
      data: {
        delta: { text: text.slice(middle), type: "text_delta" },
        index: 0,
        type: "content_block_delta",
      },
      event: "content_block_delta",
    },
    {
      data: { index: 0, type: "content_block_stop" },
      event: "content_block_stop",
    },
  ];
};

const toolUseEvents = (name: string, input: unknown = {}): SseEvent[] => [
  {
    data: {
      content_block: {
        id: `toolu_mock_${Date.now()}`,
        input: {},
        name,
        type: "tool_use",
      },
      index: 0,
      type: "content_block_start",
    },
    event: "content_block_start",
  },
  {
    data: {
      delta: { partial_json: JSON.stringify(input), type: "input_json_delta" },
      index: 0,
      type: "content_block_delta",
    },
    event: "content_block_delta",
  },
  {
    data: { index: 0, type: "content_block_stop" },
    event: "content_block_stop",
  },
];

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
// Specs embed a unique company token so accumulated data on the shared dev
// DB never causes false positives.
const COMPANY_TOKEN_PATTERN = /UNIQ-\d+/;

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
  if (INBOX_PATTERN.test(userText)) {
    return messageEnvelope(toolUseEvents("get_inbox_leads"), "tool_use");
  }
  return messageEnvelope(
    textEvents("Hello from the mock assistant."),
    "end_turn"
  );
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
