---
name: write-a-skill
description: Author a new skill for this repo. Use when adding a new capability to the toolkit or asking about SKILL.md structure.
---

# Writing Skills

## Process

1. **Gather requirements** - ask user about:
   - What task/domain does the skill cover?
   - What specific use cases should it handle?
   - Does it need executable scripts or just instructions?
   - Any reference materials to include?

2. **Draft the skill** - create:
   - SKILL.md with concise instructions
   - Additional reference files if content exceeds ~100 lines
   - Utility scripts if deterministic operations are needed

3. **Review with user** - present the draft and ask:
   - Does this cover your use cases?
   - Anything missing or unclear?

## Skill Structure

```
skill-name/
├── SKILL.md           # Main instructions (required)
├── REFERENCE.md       # Detailed docs (if needed)
└── scripts/           # Utility scripts (if needed)
```

## SKILL.md Template

```md
---
name: skill-name
description: Brief description of capability. Use when [specific triggers].
---

# Skill Name

## Quick start

[Minimal working example]

## Workflows

[Step-by-step processes with checklists for complex tasks]
```

## Description Requirements

The description is **the only thing the agent sees** when deciding which skill to load.

- Max 1024 chars, third person.
- First sentence: what it does.
- Second sentence: "Use when [specific triggers]".

**Good**: `Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when user mentions PDFs, forms, or document extraction.`

**Bad**: `Helps with documents.`

## When to add scripts

Add utility scripts when the operation is deterministic (validation, formatting) or the same code would be generated repeatedly. Scripts save tokens and improve reliability.

## When to split files

Split into separate files when SKILL.md exceeds ~100 lines, content has distinct domains, or advanced features are rarely needed.

## Review checklist

- [ ] Description includes triggers ("Use when...")
- [ ] SKILL.md is concise
- [ ] No time-sensitive info
- [ ] Consistent terminology
- [ ] Concrete examples included
- [ ] References one level deep
