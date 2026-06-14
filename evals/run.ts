import type Anthropic from "@anthropic-ai/sdk";
import { createMessage, getAiModel, isAiConfigured } from "@/lib/ai/client";
import { buildPageContext } from "@/lib/ai/page-context";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { TOOL_DEFINITIONS } from "@/lib/ai/tools";
import { FIXTURES, type GradedResponse } from "./fixtures";

// AI assistant eval runner (PRD §9.6): fixture inputs against the REAL
// model, scored outputs, M4 gate at 80%. One model call per fixture; tools
// are never executed, so the run is read-only end to end.
//
//   npm run ai:eval
//
// Requires ANTHROPIC_API_KEY (set AI_MODEL to pin a model). Exits 1 when
// the pass rate lands under the gate.

const PASS_GATE = 0.8;
const MAX_OUTPUT_TOKENS = 4096;
const PERCENT = 100;

const toGraded = (message: Anthropic.Message): GradedResponse => ({
  stopReason: message.stop_reason,
  text: message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n"),
  toolCalls: message.content
    .filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    )
    .map((block) => ({
      input: (block.input ?? {}) as Record<string, unknown>,
      name: block.name,
    })),
});

const runFixture = async (
  fixture: (typeof FIXTURES)[number]
): Promise<string | null> => {
  // Page-context for plain pathnames is static (no ids, no DB lookups), so
  // the eval turn matches what production sends byte for byte.
  const pageContext = await buildPageContext(
    { pathname: fixture.pathname },
    "Kurt"
  );
  const response = await createMessage({
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        content: [
          { text: pageContext, type: "text" },
          { text: fixture.message, type: "text" },
        ],
        role: "user",
      },
    ],
    model: getAiModel(),
    system: [{ text: SYSTEM_PROMPT, type: "text" }],
    tools: TOOL_DEFINITIONS,
  });
  return fixture.grade(toGraded(response));
};

const main = async (): Promise<void> => {
  if (!isAiConfigured()) {
    process.stdout.write(
      "ANTHROPIC_API_KEY is not set; skipping the AI eval set. Set it in .env.local to run against the real model.\n"
    );
    return;
  }

  process.stdout.write(
    `Running ${FIXTURES.length} fixtures against ${getAiModel()}\n\n`
  );

  let passed = 0;
  for (const fixture of FIXTURES) {
    let failure: string | null;
    try {
      failure = await runFixture(fixture);
    } catch (error) {
      failure = `API error: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (failure === null) {
      passed += 1;
      process.stdout.write(`  PASS  ${fixture.name} (${fixture.fr})\n`);
    } else {
      process.stdout.write(
        `  FAIL  ${fixture.name} (${fixture.fr}): ${failure}\n`
      );
    }
  }

  const rate = passed / FIXTURES.length;
  process.stdout.write(
    `\n${passed}/${FIXTURES.length} passed (${Math.round(rate * PERCENT)}%); gate is ${Math.round(PASS_GATE * PERCENT)}%\n`
  );
  if (rate < PASS_GATE) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  process.stderr.write(`Eval run failed: ${error}\n`);
  process.exitCode = 1;
});
