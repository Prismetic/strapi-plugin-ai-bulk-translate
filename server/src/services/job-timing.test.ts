import { describe, expect, it } from 'vitest';

import { timestampsFor } from './job-timing';

const now = new Date('2026-08-28T12:00:00.000Z');
const earlier = new Date('2026-08-28T11:00:00.000Z');

describe('timestampsFor', () => {
  it('stamps nothing while a run is only queued', () => {
    expect(timestampsFor('queued', { startedAt: null, finishedAt: null }, now)).toEqual({});
  });

  it('records when work actually began', () => {
    expect(timestampsFor('processing', { startedAt: null, finishedAt: null }, now)).toMatchObject({
      startedAt: now,
    });
  });

  /** A run that resumes has not started again; the first start is the one history should show. */
  it('does not move the start when a run continues', () => {
    expect(timestampsFor('processing', { startedAt: earlier, finishedAt: null }, now).startedAt)
      .toBeUndefined();
  });

  it('records when a run finished', () => {
    expect(
      timestampsFor('completed', { startedAt: earlier, finishedAt: null }, now)
    ).toMatchObject({ finishedAt: now });
  });

  it('records a failure as an ending, because it is one', () => {
    expect(timestampsFor('failed', { startedAt: earlier, finishedAt: null }, now)).toMatchObject({
      finishedAt: now,
    });
  });

  /**
   * Retrying a finished run makes it unfinished again. Leaving the old end time would show a run
   * that ended before it was last working.
   */
  it('clears the end time when a finished run starts working again', () => {
    expect(timestampsFor('processing', { startedAt: earlier, finishedAt: earlier }, now)).toEqual({
      finishedAt: null,
    });
  });
});
