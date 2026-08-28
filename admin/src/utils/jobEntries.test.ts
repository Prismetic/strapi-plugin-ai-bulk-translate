import { describe, expect, it } from 'vitest';

import { durationBetween, namedEntries } from './jobEntries';

const doc = (title: string) => ({ documentId: title.toLowerCase(), title, sourcePath: null });

describe('namedEntries', () => {
  it('names a single entry', () => {
    expect(namedEntries([doc('Rome')], 1)).toEqual({ titles: ['Rome'], remaining: 0 });
  });

  it('names a few in full', () => {
    expect(namedEntries([doc('Rome'), doc('Paris')], 2)).toEqual({
      titles: ['Rome', 'Paris'],
      remaining: 0,
    });
  });

  it('counts the rest rather than filling the column', () => {
    expect(namedEntries([doc('a'), doc('b'), doc('c'), doc('d')], 4, 2)).toEqual({
      titles: ['a', 'b'],
      remaining: 2,
    });
  });

  /**
   * Runs recorded before titles were stored have none. The row still has to say something, and
   * the count is the honest thing to say.
   */
  it('falls back to the count for a run with no titles recorded', () => {
    expect(namedEntries([], 3)).toEqual({ titles: [], remaining: 3 });
  });

  it('says nothing about a run that touched nothing', () => {
    expect(namedEntries([], 0)).toEqual({ titles: [], remaining: 0 });
  });
});

describe('durationBetween', () => {
  const start = '2026-08-28T12:00:00.000Z';

  it('answers nothing for a run that has not started', () => {
    expect(durationBetween(null, null)).toBeNull();
  });

  it('answers nothing for a run still going, which has no duration yet', () => {
    expect(durationBetween(start, null)).toBeNull();
  });

  it('reports seconds', () => {
    expect(durationBetween(start, '2026-08-28T12:00:45.000Z')).toBe('45s');
  });

  it('reports minutes and seconds', () => {
    expect(durationBetween(start, '2026-08-28T12:02:05.000Z')).toBe('2m 5s');
  });

  it('reports hours and minutes, dropping seconds that no longer matter', () => {
    expect(durationBetween(start, '2026-08-28T13:03:20.000Z')).toBe('1h 3m');
  });

  it('rounds a sub-second run up rather than reporting nothing happened', () => {
    expect(durationBetween(start, '2026-08-28T12:00:00.400Z')).toBe('1s');
  });

  /** Clock adjustments happen; a negative duration is not worth rendering. */
  it('answers nothing when the end precedes the start', () => {
    expect(durationBetween(start, '2026-08-28T11:59:00.000Z')).toBeNull();
  });
});
