import { claudeCode, interactive } from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

// Supervised / local run, no sandbox. Same prompt as main.ts.
await interactive({
  agent: claudeCode("claude-opus-4-6"),
  sandbox: noSandbox(),
  promptFile: "./.sandcastle/prompt.md",
});
