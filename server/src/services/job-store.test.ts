import { describe, expect, it } from 'vitest';

import { JOB_UID } from '../models/job';
import { createFakeStrapi } from '../testing/fake-strapi';
import jobStore from './job-store';

import type { FakeRow } from '../testing/fake-strapi';

const NOW = new Date('2026-08-28T12:00:00.000Z');
const LONG_AGO = '2026-06-01T12:00:00.000Z';
const YESTERDAY = '2026-08-27T12:00:00.000Z';

const row = (over: FakeRow = {}): FakeRow => ({
  id: 1,
  origin: 'monitor',
  contentType: 'api::page.page',
  sourceLocale: 'en',
  targetLocales: ['ar'],
  documentIds: ['doc-1'],
  documents: [],
  overwriteDocumentIds: [],
  items: [],
  status: 'completed',
  sourceFingerprint: null,
  modelId: null,
  createdById: null,
  createdAt: LONG_AGO,
  updatedAt: LONG_AGO,
  startedAt: LONG_AGO,
  finishedAt: LONG_AGO,
  ...over,
});

const withRows = (rows: FakeRow[]) => {
  const { strapi, db } = createFakeStrapi({ seed: { [JOB_UID]: rows } });

  return { jobs: jobStore({ strapi }), remaining: () => db.rowsFor(JOB_UID) };
};

/**
 * The prune against a working matcher.
 *
 * These are here because the fake database used to ignore the `$lt` this query is built on, and
 * answered "no rows" instead — which is indistinguishable from a prune correctly finding nothing
 * to do. The rules themselves are unit-tested in job-retention; what these cover is that the query
 * and the rules are actually wired to each other.
 */
describe('job-store.prune', () => {
  it('removes a run that finished before the window', async () => {
    const { jobs, remaining } = withRows([row()]);

    expect(await jobs.prune(NOW, 30)).toBe(1);
    expect(remaining()).toHaveLength(0);
  });

  it('keeps a run that finished inside the window', async () => {
    const { jobs, remaining } = withRows([row({ createdAt: YESTERDAY, finishedAt: YESTERDAY })]);

    expect(await jobs.prune(NOW, 30)).toBe(0);
    expect(remaining()).toHaveLength(1);
  });

  /**
   * A run created two months ago but finished yesterday is recent work. Measuring from creation
   * would delete the record of something that happened this week.
   */
  it('measures age from when a run ended, not when it was asked for', async () => {
    const { jobs, remaining } = withRows([row({ createdAt: LONG_AGO, finishedAt: YESTERDAY })]);

    expect(await jobs.prune(NOW, 30)).toBe(0);
    expect(remaining()).toHaveLength(1);
  });

  it('falls back to creation for a run with no end recorded', async () => {
    const { jobs } = withRows([row({ finishedAt: null })]);

    expect(await jobs.prune(NOW, 30)).toBe(1);
  });

  /** However old it looks, a run still working is not history — deleting it strands the work. */
  it('never removes a run that is queued or processing', async () => {
    const { jobs, remaining } = withRows([
      row({ id: 1, status: 'queued', finishedAt: null }),
      row({ id: 2, status: 'processing', finishedAt: null }),
    ]);

    expect(await jobs.prune(NOW, 30)).toBe(0);
    expect(remaining()).toHaveLength(2);
  });

  it('removes failed and skipped runs, which are history like any other', async () => {
    const { jobs, remaining } = withRows([
      row({ id: 1, status: 'failed' }),
      row({ id: 2, status: 'skipped' }),
    ]);

    expect(await jobs.prune(NOW, 30)).toBe(2);
    expect(remaining()).toHaveLength(0);
  });

  it('removes only what expired, and leaves the rest untouched', async () => {
    const { jobs, remaining } = withRows([
      row({ id: 1 }),
      row({ id: 2, createdAt: YESTERDAY, finishedAt: YESTERDAY }),
      row({ id: 3, status: 'processing', finishedAt: null }),
    ]);

    expect(await jobs.prune(NOW, 30)).toBe(1);
    expect(remaining().map((job) => job.id)).toEqual([2, 3]);
  });

  it('honours a shorter window', async () => {
    const { jobs } = withRows([row({ createdAt: YESTERDAY, finishedAt: YESTERDAY })]);

    expect(await jobs.prune(NOW, 1)).toBe(0);
    expect(await jobs.prune(NOW, 0)).toBe(1);
  });

  it('does nothing to an empty table', async () => {
    const { jobs } = withRows([]);

    expect(await jobs.prune(NOW, 30)).toBe(0);
  });
});
