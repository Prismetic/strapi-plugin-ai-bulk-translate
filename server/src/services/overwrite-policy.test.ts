import { describe, expect, it } from 'vitest';

import { decideOverwrite } from './overwrite-policy';

const OFF = { overwriteContent: false, overwriteManualEdits: false };
const CONTENT = { overwriteContent: true, overwriteManualEdits: false };
const EVERYTHING = { overwriteContent: true, overwriteManualEdits: true };

const wroteAt = '2026-08-28T12:00:00.000Z';
const editedLater = '2026-08-28T12:05:00.000Z';

const decide = (over: Record<string, unknown> = {}) =>
  decideOverwrite({
    policy: OFF,
    targetHasContent: true,
    lastWrittenAt: wroteAt,
    targetUpdatedAt: wroteAt,
    ...over,
  } as never);

describe('decideOverwrite', () => {
  /** An empty locale is written under every combination — there is nothing to overwrite. */
  it('writes an empty locale whatever the policy says', () => {
    for (const policy of [OFF, CONTENT, EVERYTHING]) {
      expect(decide({ policy, targetHasContent: false, lastWrittenAt: null })).toBe('write');
    }
  });

  it('leaves existing content alone when overwriting is off', () => {
    expect(decide({ policy: OFF })).toBe('skip:has-content');
  });

  it('replaces a translation the plugin wrote and nobody has touched', () => {
    expect(decide({ policy: CONTENT })).toBe('write');
  });

  /** The rule the whole feature exists to get right: a translator's corrections survive. */
  it('leaves a translation a human edited after we wrote it', () => {
    expect(decide({ policy: CONTENT, targetUpdatedAt: editedLater })).toBe('skip:manual-edit');
  });

  it('replaces even a hand-edited translation when that was asked for explicitly', () => {
    expect(decide({ policy: EVERYTHING, targetUpdatedAt: editedLater })).toBe('write');
  });

  /**
   * Content we never wrote is somebody's work by definition, so "overwrite our own output" does
   * not cover it. This is the case for a locale translated by hand before monitoring was on.
   */
  it('treats content the plugin never wrote as a manual edit', () => {
    expect(decide({ policy: CONTENT, lastWrittenAt: null })).toBe('skip:manual-edit');
  });

  it('replaces it anyway when manual edits may be overwritten', () => {
    expect(decide({ policy: EVERYTHING, lastWrittenAt: null })).toBe('write');
  });

  /**
   * The boundary the implementation turns on. Our own write sets the entry's timestamp to the
   * moment we recorded, so equal timestamps are our work, not somebody else's — a `>=` here would
   * refuse to ever refresh a translation.
   */
  it('treats an unchanged timestamp as our own work, not an edit', () => {
    expect(decide({ policy: CONTENT, targetUpdatedAt: wroteAt, lastWrittenAt: wroteAt })).toBe(
      'write'
    );
  });

  it('treats a timestamp one millisecond later as an edit', () => {
    expect(
      decide({
        policy: CONTENT,
        lastWrittenAt: '2026-08-28T12:00:00.000Z',
        targetUpdatedAt: '2026-08-28T12:00:00.001Z',
      })
    ).toBe('skip:manual-edit');
  });

  /** An entry older than our record cannot have been edited since; a clock moved, not a person. */
  it('does not treat an earlier timestamp as an edit', () => {
    expect(decide({ policy: CONTENT, targetUpdatedAt: '2026-08-28T11:00:00.000Z' })).toBe('write');
  });

  /** Unknowable is not the same as untouched, and the safe answer preserves the work. */
  it('preserves content when the entry cannot say when it changed', () => {
    expect(decide({ policy: CONTENT, targetUpdatedAt: null })).toBe('skip:manual-edit');
  });
});
