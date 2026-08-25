# CONFIG

Read `workflow.config.json` first. Use its `feedback` commands (skip any that are empty) and its `labels` names throughout this run.

# ISSUES

Here are a set of GitHub issues:

!`gh issue list --state open --json number,title,body,labels,comments`

You will work on the `afk`-labelled issues only, not the `hitl` ones.

If all `afk` tasks are complete, output <promise>NO MORE TASKS</promise>.

# TASK SELECTION

Pick the next task. Prioritize in this order:

1. Critical bugfixes (issues also labelled `critical`)
2. Development infrastructure

Getting infrastructure like tests, type-checking, linting, and dev scripts ready is an important precursor to building features.

3. Tracer bullets for new features

A tracer bullet is a small slice of functionality that goes through all layers of the system, letting you test and validate the approach early. Build a tiny, end-to-end slice first, then expand it.

4. Polish and quick wins
5. Refactors

# EXPLORATION

Explore the repo. Load the `coding-standards` skill before writing code.

# IMPLEMENTATION

Complete the task using the `do-work` skill.

# FEEDBACK LOOPS

Before committing, run every command listed under `feedback` in `workflow.config.json`, in order (e.g. `install`, `test`, `typecheck`, `lint`, `format`, `build`). Skip any that are empty. Fix issues until they pass.

# COMMIT

Make a git commit. The message must include:

1. Key decisions made
2. Files changed
3. Blockers or notes for the next iteration

# THE ISSUE

If the task is complete, close the original GitHub issue.

If it is not complete, leave a comment on the issue describing what was done.

# FINAL RULES

ONLY WORK ON A SINGLE TASK. If you receive a multi-phase plan, only work on a single phase of that plan.
