import { describe, expect, it } from 'vitest';

import { resolveOutcome } from './outcome';

import type { DocumentLocaleStatus } from '../hooks/useLocaleStatus';

const row = (
  documentId: string,
  title: string,
  locales: Record<string, DocumentLocaleStatus['locales'][string]>,
  excluded = false
): DocumentLocaleStatus => ({ documentId, title, locales, excluded });

describe('resolveOutcome — conflicts', () => {
  it('lists one conflict per entry, naming only the locales that already have content', () => {
    const outcome = resolveOutcome({
      rows: [
        row('a', 'Accommodation', { de: 'has-content', fr: 'empty' }),
        row('b', 'Dining', { de: 'empty', fr: 'empty' }),
      ],
      targetLocales: ['de', 'fr'],
      authorised: [],
    });

    expect(outcome.conflicts).toEqual([
      { documentId: 'a', title: 'Accommodation', locales: ['de'] },
    ]);
  });

  it('names every conflicting locale of one entry', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'Accommodation', { de: 'has-content', fr: 'has-content', es: 'empty' })],
      targetLocales: ['de', 'fr', 'es'],
      authorised: [],
    });

    expect(outcome.conflicts[0].locales).toEqual(['de', 'fr']);
  });

  it('reports conflicts in the order the locales were chosen, not object order', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { fr: 'has-content', de: 'has-content' })],
      targetLocales: ['de', 'fr'],
      authorised: [],
    });

    expect(outcome.conflicts[0].locales).toEqual(['de', 'fr']);
  });

  it('never lists an excluded entry as a conflict', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'no-source' }, true)],
      targetLocales: ['de'],
      authorised: [],
    });

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.excludedCount).toBe(1);
  });
});

describe('resolveOutcome — counts', () => {
  it('counts each entry-and-locale pair that will be created', () => {
    const outcome = resolveOutcome({
      rows: [
        row('a', 'A', { de: 'empty', fr: 'empty' }),
        row('b', 'B', { de: 'empty', fr: 'has-content' }),
      ],
      targetLocales: ['de', 'fr'],
      authorised: [],
    });

    expect(outcome.willCreate).toBe(3);
  });

  it('counts an unauthorised conflict as a skip, not a write', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'has-content' })],
      targetLocales: ['de'],
      authorised: [],
    });

    expect(outcome).toMatchObject({ willCreate: 0, willOverwrite: 0, willSkip: 1 });
  });

  it('counts an authorised conflict as an overwrite', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'has-content' })],
      targetLocales: ['de'],
      authorised: ['a'],
    });

    expect(outcome).toMatchObject({ willCreate: 0, willOverwrite: 1, willSkip: 0 });
  });

  /**
   * Authorisation is per entry, not per locale — that is what the job record stores — so ticking an
   * entry covers every locale of that entry which already has content. The checkbox label has to
   * name those locales for this to be honest, which is why the conflict carries them.
   */
  it('authorising an entry covers all of its conflicting locales', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'has-content', fr: 'has-content', es: 'empty' })],
      targetLocales: ['de', 'fr', 'es'],
      authorised: ['a'],
    });

    expect(outcome).toMatchObject({ willCreate: 1, willOverwrite: 2, willSkip: 0 });
  });

  it('ignores an authorised id that is not a conflict in this selection', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'empty' })],
      targetLocales: ['de'],
      authorised: ['a', 'stale-id'],
    });

    expect(outcome).toMatchObject({ willCreate: 1, willOverwrite: 0, willSkip: 0 });
    expect(outcome.authorisedIds).toEqual([]);
  });

  it('reports the authorised ids actually worth sending, so the job records only real approvals', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'has-content' }), row('b', 'B', { de: 'has-content' })],
      targetLocales: ['de'],
      authorised: ['b', 'gone'],
    });

    expect(outcome.authorisedIds).toEqual(['b']);
  });

  it('never counts a no-source locale as work', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'no-source' }, true)],
      targetLocales: ['de'],
      authorised: [],
    });

    expect(outcome).toMatchObject({ willCreate: 0, willOverwrite: 0, willSkip: 0 });
  });
});

describe('resolveOutcome — the empty-work guard', () => {
  it('blocks with a reason when no target locale is chosen', () => {
    const outcome = resolveOutcome({ rows: [], targetLocales: [], authorised: [] });

    expect(outcome.hasWork).toBe(false);
    expect(outcome.blockedReason).toBe('no-target-locales');
  });

  /**
   * The case the issue calls out: every chosen locale already has content and nothing is ticked. The
   * confirm button has to say why, or the editor presses a dead button and learns nothing.
   */
  it('blocks when every locale already has content and nothing is authorised', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'has-content' }), row('b', 'B', { de: 'has-content' })],
      targetLocales: ['de'],
      authorised: [],
    });

    expect(outcome.hasWork).toBe(false);
    expect(outcome.blockedReason).toBe('conflicts-not-authorised');
  });

  it('unblocks as soon as one conflict is authorised', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'has-content' })],
      targetLocales: ['de'],
      authorised: ['a'],
    });

    expect(outcome.hasWork).toBe(true);
    expect(outcome.blockedReason).toBeNull();
  });

  it('blocks when every entry has nothing in the source locale', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'no-source' }, true)],
      targetLocales: ['de'],
      authorised: [],
    });

    expect(outcome.hasWork).toBe(false);
    expect(outcome.blockedReason).toBe('nothing-in-source');
  });

  it('allows work when anything at all would be created', () => {
    const outcome = resolveOutcome({
      rows: [row('a', 'A', { de: 'has-content' }), row('b', 'B', { de: 'empty' })],
      targetLocales: ['de'],
      authorised: [],
    });

    expect(outcome.hasWork).toBe(true);
    expect(outcome.blockedReason).toBeNull();
  });

  /**
   * Before the preview has answered there is nothing to judge. Blocking then would disable the
   * button for the moment between choosing a locale and the check returning, which reads as broken.
   */
  it('does not block while the preview has not returned yet', () => {
    const outcome = resolveOutcome({ rows: [], targetLocales: ['de'], authorised: [] });

    expect(outcome.hasWork).toBe(true);
    expect(outcome.blockedReason).toBeNull();
  });
});
