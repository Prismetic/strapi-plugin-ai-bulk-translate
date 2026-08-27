# Project agent guide

This repo uses the AI Workflow Harness. Before doing anything, understand how work flows here.

## Configuration

All stack-specific settings live in [workflow.config.json](workflow.config.json):

- `feedback` — the commands to run before every commit (`test`, `typecheck`, `lint`, `build`). An empty string means "skip this one".
- `labels` — the GitHub labels that drive the autonomous loop (`afk`, `hitl`, `critical`).
- `conventionsFile` — the file that holds this project's coding conventions (default `CONVENTIONS.md`).

Read this file first so you run the right commands for this project.

## Skills

Skills live in `.claude/skills/`. Load them by name:

- `kickoff` — turn a plain-language idea into a ready-to-run backlog (PRD + sliced issues). Start here for a new project or feature.
- `to-prd`, `prd-to-issues` — planning: idea to PRD to vertical-slice issues.
- `do-work` — execute one issue end-to-end (plan, implement, validate with the configured feedback commands, commit).
- `coding-standards` — load/derive this project's conventions before writing or reviewing code.
- `verify-in-host` — push a build into a host Strapi and confirm the host is really running it. Anything touching the admin, permissions, or the AI SDK needs this; `npm test` does not cover it.
- `improve-codebase-architecture`, `grill-me`, `handoff`, `write-a-skill` — architecture, plan stress-testing, session handoff, and authoring new skills.

## Autonomous loop

`.sandcastle/` runs the AFK loop: it works only `afk`-labelled GitHub issues, one per iteration, validating with the configured feedback commands before committing. See [.sandcastle/prompt.md](.sandcastle/prompt.md).

**This repo uses npm, not pnpm.** The harness README documents pnpm commands; use these instead:

```
npx tsx .sandcastle/interactive.ts   # supervised, no sandbox
npx tsx .sandcastle/main.ts          # sandboxed — requires Docker
```

`interactive.ts` is the one to use here: Docker is not installed, and several acceptance criteria
need the plugin linked into a Strapi host that lives outside this repo, which a container would
isolate you away from.

`.sandcastle/package.json` marks that directory as ESM. The plugin itself is `"type": "commonjs"`
because that is what Strapi loads, but the loop scripts use top-level `await` and import
`@ai-hero/sandcastle`, which is ESM-only. Without the marker they fail to parse. Keep it — and keep
it scoped to the directory, so re-copying the harness over this repo does not need renamed files.

## Golden rules

- Prefer `afk`; reserve `hitl` for scope, architecture, risky changes, QA sign-off, and merges.
- Coding conventions come from `coding-standards` — never invent a new style.
- One task per loop iteration.
