import { describe, expect, it } from 'vitest';

import { NEEDS_ATTENTION, statusesFor } from './jobFilters';

describe('statusesFor', () => {
  it('asks for what needs attention when nothing is ticked', () => {
    expect(statusesFor({ completed: false })).toEqual(NEEDS_ATTENTION);
  });

  it('adds completed runs when the box is ticked, keeping the rest', () => {
    const statuses = statusesFor({ completed: true });

    expect(statuses).toContain('completed');
    for (const status of NEEDS_ATTENTION) {
      expect(statuses).toContain(status);
    }
  });

  /** "Show me nothing" is not a state the filter can reach — the server refuses an empty list. */
  it('never asks for an empty set of statuses', () => {
    expect(statusesFor({ completed: false }).length).toBeGreaterThan(0);
    expect(statusesFor({ completed: true }).length).toBeGreaterThan(0);
  });

  it('never asks for the same status twice', () => {
    const statuses = statusesFor({ completed: true });

    expect(new Set(statuses).size).toBe(statuses.length);
  });

  /** The default view is the one a person can act on: queued, going, or broken. */
  it('opens on queued, processing and failed', () => {
    expect(NEEDS_ATTENTION).toEqual(['queued', 'processing', 'failed']);
  });
});
