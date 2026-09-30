import { describe, expect, it } from 'vitest';

import { groupProgressByDocument, resolveOutcome } from './outcome';

import type { DocumentLocaleStatus } from '../hooks/useLocaleStatus';
import type { JobItem } from '../hooks/useTranslationJob';

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
    const outcome = resolveOutcome({
      rows: [],
      targetLocales: ['de'],
      authorised: [],
      previewLoaded: false,
    });

    expect(outcome.hasWork).toBe(true);
    expect(outcome.blockedReason).toBeNull();
  });

  /**
   * The single-type defect. Its preview was never requested, so rows stayed empty forever, and
   * an empty list was read as "still loading" — a live button with nothing above it explaining
   * what it would do. An empty answer is an answer.
   */
  it('blocks on an empty answer, rather than mistaking it for a pending one', () => {
    const outcome = resolveOutcome({ rows: [], targetLocales: ['de'], authorised: [] });

    expect(outcome.hasWork).toBe(false);
    expect(outcome.blockedReason).toBe('nothing-in-source');
  });
});

describe('resolveOutcome — model availability', () => {
  const oneTranslatableRow = { rows: [row('a', 'Accommodation', { de: 'empty' })], targetLocales: ['de'], authorised: [] };

  it('blocks the run when no model is usable, even though the locales would produce work', () => {
    // Without this the button is live, the run starts, and every item fails server-side with
    // "No usable model is configured" — which the editor cannot act on from the dialog.
    const outcome = resolveOutcome({ ...oneTranslatableRow, hasUsableModel: false });

    expect(outcome.blockedReason).toBe('no-usable-model');
    expect(outcome.hasWork).toBe(false);
  });

  it('reports the missing model ahead of any other blocker, being the one nothing works around', () => {
    const outcome = resolveOutcome({
      rows: [],
      targetLocales: [],
      authorised: [],
      hasUsableModel: false,
    });

    expect(outcome.blockedReason).toBe('no-usable-model');
  });

  it('does not block when a model is usable', () => {
    expect(resolveOutcome({ ...oneTranslatableRow, hasUsableModel: true }).hasWork).toBe(true);
  });

  it('assumes a model until told otherwise, so the button does not flicker while models load', () => {
    expect(resolveOutcome(oneTranslatableRow).hasWork).toBe(true);
  });
});

describe('groupProgressByDocument', () => {
  const item = (documentId: string, locale: string, over: Partial<JobItem> = {}): JobItem => ({
    documentId,
    locale,
    status: 'translated',
    ...over,
  });

  it('gathers every locale of an entry under one title', () => {
    const groups = groupProgressByDocument(
      [item('a', 'de'), item('b', 'de'), item('a', 'fr')],
      { a: 'Accommodation', b: 'Dining' }
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].title).toBe('Accommodation');
    expect(groups[0].items.map((i) => i.locale)).toEqual(['de', 'fr']);
    expect(groups[1].title).toBe('Dining');
  });

  it('keeps the order the server queued them in, not the order titles were supplied', () => {
    const groups = groupProgressByDocument([item('b', 'de'), item('a', 'de')], {
      a: 'Accommodation',
      b: 'Dining',
    });

    expect(groups.map((g) => g.documentId)).toEqual(['b', 'a']);
  });

  it('falls back to the id when no title is known, rather than rendering a blank row', () => {
    const groups = groupProgressByDocument([item('a', 'de')], {});

    expect(groups[0].title).toBe('a');
  });

  it('carries failure and skip reasons through untouched', () => {
    const groups = groupProgressByDocument(
      [
        item('a', 'de', { status: 'failed', error: 'Rate limited' }),
        item('a', 'fr', { status: 'skipped', skippedReason: 'Already translated' }),
      ],
      { a: 'Accommodation' }
    );

    expect(groups[0].items[0].error).toBe('Rate limited');
    expect(groups[0].items[1].skippedReason).toBe('Already translated');
  });
});

describe('resolveOutcome — the run must actually resolve a model', () => {
  const work = { rows: [row('a', 'Accommodation', { de: 'empty' })], targetLocales: ['de'], authorised: [] };

  it('blocks when models exist but none is chosen and none is default', () => {
    // The hole this closes: `hasUsableModel` only says a model exists. A run sent with no explicit
    // choice falls back to the server's default, and if there is none every item fails.
    const outcome = resolveOutcome({ ...work, hasUsableModel: true, modelResolves: false });

    expect(outcome.blockedReason).toBe('no-model-selected');
    expect(outcome.hasWork).toBe(false);
  });

  it('reports no model at all ahead of none chosen, being the one the editor cannot fix', () => {
    const outcome = resolveOutcome({ ...work, hasUsableModel: false, modelResolves: false });

    expect(outcome.blockedReason).toBe('no-usable-model');
  });

  it('does not block once a model resolves', () => {
    expect(resolveOutcome({ ...work, modelResolves: true }).hasWork).toBe(true);
  });
});
