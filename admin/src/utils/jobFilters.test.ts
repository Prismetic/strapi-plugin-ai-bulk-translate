import { describe, expect, it } from 'vitest';

import { NEEDS_ATTENTION, statusesFor } from './jobFilters';

describe('statusesFor', () => {
  it('asks for what needs attention when nothing is ticked', () => {
    expect(statusesFor({ completed: false, skipped: false })).toEqual(NEEDS_ATTENTION);
  });

  it('adds completed runs when the box is ticked, keeping the rest', () => {
    const statuses = statusesFor({ completed: true, skipped: false });

    expect(statuses).toContain('completed');
    for (const status of NEEDS_ATTENTION) {
      expect(statuses).toContain(status);
    }
  });

  /** "Show me nothing" is not a state the filter can reach — the server refuses an empty list. */
  it('never asks for an empty set of statuses', () => {
    expect(statusesFor({ completed: false, skipped: false }).length).toBeGreaterThan(0);
    expect(statusesFor({ completed: true, skipped: false }).length).toBeGreaterThan(0);
  });

  it('never asks for the same status twice', () => {
    const statuses = statusesFor({ completed: true, skipped: false });

    expect(new Set(statuses).size).toBe(statuses.length);
  });

  /** The default view is the one a person can act on: queued, going, or broken. */
  it('opens on queued, processing and failed', () => {
    expect(NEEDS_ATTENTION).toEqual(['queued', 'processing', 'failed']);
  });
});

describe('statusesFor and skipped runs', () => {
  it('hides them by default, like completed runs', () => {
    expect(statusesFor({ completed: false, skipped: false })).not.toContain('skipped');
  });

  it('adds them when asked for, without losing what needs attention', () => {
    const statuses = statusesFor({ completed: false, skipped: true });

    expect(statuses).toContain('skipped');
    expect(statuses).toContain('failed');
    expect(statuses).not.toContain('completed');
  });

  /**
   * The two boxes are independent, unlike the monitoring pair: all four combinations mean
   * something, and skipped runs are the volume, so folding them in with completed would bury
   * the ones somebody wanted to see.
   */
  it('is independent of the completed filter', () => {
    const both = statusesFor({ completed: true, skipped: true });

    expect(both).toContain('completed');
    expect(both).toContain('skipped');
    expect(new Set(both).size).toBe(both.length);
  });
});
