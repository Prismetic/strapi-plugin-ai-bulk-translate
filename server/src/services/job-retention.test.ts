import { describe, expect, it } from 'vitest';

import { cutoffFrom, isPrunable } from './job-retention';

const now = new Date('2026-08-28T12:00:00.000Z');
const old = '2026-06-01T12:00:00.000Z';
const recent = '2026-08-27T12:00:00.000Z';

const cutoff = cutoffFrom(now, 30);

const run = (over: Record<string, unknown> = {}) => ({
  status: 'completed' as const,
  createdAt: old,
  finishedAt: old,
  ...over,
});

describe('cutoffFrom', () => {
  it('is the window before now', () => {
    expect(cutoffFrom(now, 30).toISOString()).toBe('2026-07-29T12:00:00.000Z');
  });

  it('treats a window of zero as everything finished before now', () => {
    expect(cutoffFrom(now, 0).getTime()).toBe(now.getTime());
  });
});

describe('isPrunable', () => {
  it('removes a run that finished before the window', () => {
    expect(isPrunable(run(), cutoff)).toBe(true);
  });

  it('keeps a run that finished inside the window', () => {
    expect(isPrunable(run({ createdAt: recent, finishedAt: recent }), cutoff)).toBe(false);
  });

  /**
   * A run created long ago but finished yesterday is recent work. Measuring from creation would
   * delete the record of something that happened this week.
   */
  it('measures age from when a run ended, not when it was asked for', () => {
    expect(isPrunable(run({ createdAt: old, finishedAt: recent }), cutoff)).toBe(false);
  });

  it('falls back to creation for a run with no end recorded', () => {
    expect(isPrunable(run({ finishedAt: null }), cutoff)).toBe(true);
  });

  /** However old it is, a run still doing work is not history yet. */
  it('never removes a run that is still processing', () => {
    expect(isPrunable(run({ status: 'processing' }), cutoff)).toBe(false);
  });

  it('never removes a run that is still queued', () => {
    expect(isPrunable(run({ status: 'queued' }), cutoff)).toBe(false);
  });

  it('removes an old failed run, which is history like any other', () => {
    expect(isPrunable(run({ status: 'failed' }), cutoff)).toBe(true);
  });
});
