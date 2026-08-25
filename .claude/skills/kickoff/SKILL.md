---
name: kickoff
description: Turn a plain-language product idea into a ready-to-execute backlog (PRD + sliced afk/hitl issues + labels), so the autonomous loop can run. Use when the user provides an idea and wants a new project or a new feature bootstrapped from scratch.
argument-hint: "<your product idea>"
---

# Kickoff

Bootstrap the workflow from a single idea. You will set up the repo, capture the idea as a PRD, and break it into executable issues. Stop at the human gates.

## Process

### 1. Read the config

Read `workflow.config.json` for the feedback commands, label names, and conventions file. If it is missing, create it from the harness default before continuing.

### 2. Detect project state

- **Empty folder / no code** -> greenfield workflow.
- **Existing code** -> brownfield workflow: explore the repo first and load `coding-standards` so the plan respects existing conventions.

Check the plumbing and fix or ask as needed (these are HITL decisions):

- No git repo -> `git init`.
- No GitHub remote -> offer to create one with `gh repo create` (ask first — creating a remote is a decision).
- `gh auth status` failing -> ask the user to authenticate.

### 3. Ensure labels exist

Create the labels from `workflow.config.json` if absent (idempotent):

```sh
gh label create afk --color 0E8A16 --description "Autonomous: loop may complete this" 2>/dev/null || true
gh label create hitl --color D93F0B --description "Human in the loop required" 2>/dev/null || true
gh label create critical --color B60205 --description "Bugfix fast-track" 2>/dev/null || true
```

Use the actual names from the config if they differ.

### 4. Capture the idea as a PRD

Use the `to-prd` skill on the user's idea to produce and file a PRD issue. Do not interview the user beyond what `to-prd` requires.

**[HITL GATE]** Present the PRD and get explicit approval before slicing. Iterate until approved.

### 5. Break into issues

Use the `prd-to-issues` skill to create vertical-slice issues tagged `afk`/`hitl`, plus the final HITL QA issue.

**[HITL GATE]** Present the breakdown (titles, type, blockers) and get approval before creating issues. Iterate until approved.

### 6. Hand off to the loop

Report what was created and the exact command to start the AFK loop:

```
pnpm dlx tsx .sandcastle/interactive.ts   # supervised
pnpm dlx tsx .sandcastle/main.ts          # sandboxed / unattended
```

Remind the user which slices are `hitl` and will wait for them.
