---
name: improve-codebase-architecture
description: Explore a codebase to find opportunities for architectural improvement, focusing on deepening shallow modules. Use when user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more AI-navigable.
---

# Improve Codebase Architecture

Explore a codebase like an AI would, surface architectural friction, and propose module-deepening refactors as GitHub issue RFCs.

A **deep module** (John Ousterhout, "A Philosophy of Software Design") has a small interface hiding a large implementation. Deep modules are more testable, more AI-navigable, and let you test at the boundary instead of inside.

## Process

### 1. Explore the codebase

Use sub-agents / exploration to navigate the codebase naturally. Do NOT follow rigid heuristics — explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small files?
- Where are modules so shallow that the interface is nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called?
- Where do tightly-coupled modules create integration risk in the seams between them?

The friction you encounter IS the signal.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each:

- **Cluster**: which modules/concepts are involved
- **Why they're coupled**: shared types, call patterns, co-ownership of a concept
- **Dependency category**: one of — (a) pure/self-contained, (b) depends on siblings, (c) depends on infrastructure (I/O, network, db), (d) cross-boundary (needs ports & adapters)
- **Test impact**: what existing tests would be replaced by boundary tests

Do NOT propose interfaces yet. Ask the user: "Which of these would you like to explore?"

### 3. User picks a candidate

### 4. Design multiple interfaces

Spawn 3+ sub-agents in parallel. Each must produce a **radically different** interface for the deepened module, under a different constraint:

- Agent 1: minimize the interface — 1-3 entry points max
- Agent 2: maximize flexibility — support many use cases and extension
- Agent 3: optimize for the most common caller — make the default case trivial
- Agent 4 (if applicable): design around ports & adapters for cross-boundary dependencies

Each sub-agent outputs: interface signature, a usage example, what complexity it hides, its dependency strategy, and trade-offs.

Present designs, compare them in prose, then give your own opinionated recommendation (or a hybrid).

### 5. User picks an interface (or accepts recommendation)

### 6. Create GitHub issue

Create a refactor RFC as a GitHub issue with `gh issue create` using the template below, labelled `hitl`. Share the URL.

<rfc-template>
## Summary

What module is being deepened and why.

## Current friction

The concrete pain observed during exploration.

## Proposed interface

The chosen interface signature + a usage example.

## What complexity it hides

## Dependency strategy

## Migration / test impact

Which tests move to the boundary; rough sequencing.
</rfc-template>
