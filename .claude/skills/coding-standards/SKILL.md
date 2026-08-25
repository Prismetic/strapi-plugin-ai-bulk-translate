---
name: coding-standards
description: Load or derive this project's coding conventions. Use whenever writing or reviewing code in this repo, conducting a code review, or implementing any feature.
---

# Coding standards

This project's conventions live in the file named by `conventionsFile` in `workflow.config.json` (default `CONVENTIONS.md`).

## When to use

- Before writing new code, during code review, or when the user asks about "coding standards", "conventions", or how something should be done in this repo.

## How to load conventions

1. Read `workflow.config.json` to find `conventionsFile`.
2. If that file exists, follow it.
3. If it does not exist, **derive the conventions from the codebase**:
   - Read representative source files to learn naming, structure, and patterns.
   - Read tooling config (linter, formatter, type-checker, editorconfig) and follow it.
   - Match the existing style exactly — never introduce a new style.
4. Optionally, capture what you derived in the conventions file so future work is consistent. Keep it short and organized by area (language, data/schema, services/testing, interface/UI).

Always prefer the existing patterns in the repo over general preferences.
