---
name: do-work
description: "Execute a unit of work end-to-end: plan, implement, validate with the project's feedback commands, then commit. Use when the user wants to do work, build a feature, fix a bug, or implement an issue/slice."
---

# Do Work

Execute a complete unit of work: plan it, build it, validate it, commit it.

## Workflow

### 1. Understand the task

Read the referenced issue, PRD, or plan. Load the `coding-standards` skill. Explore the codebase to understand the relevant files, patterns, and conventions. If the task is ambiguous, ask the user to clarify scope before proceeding.

### 2. Plan the implementation (optional)

If the task has not already been planned, create a plan for it.

### 3. Implement

**For logic/backend code with a test setup**: use red/green/refactor, one test at a time, tracer-bullet style.

1. Write a single failing test for the smallest vertical slice of behavior
2. Run the test — confirm it fails (red)
3. Write the minimum code to make it pass (green)
4. Repeat for the next slice of behavior
5. Refactor while keeping tests green

Do not write all tests upfront — write one, make it pass, then move on.

**For UI/presentational code, or projects without a test harness**: implement directly.

### 4. Validate

Run every command listed under `feedback` in `workflow.config.json`, in the order they appear (e.g. `install`, `test`, `typecheck`, `lint`, `format`, `build`). Skip any whose value is an empty string. Fix issues and repeat until all configured commands pass cleanly.

### 5. Commit

Once the feedback commands pass, commit. The commit message must include:

1. Key decisions made
2. Files changed
3. Blockers or notes for the next iteration
