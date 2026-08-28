import { describe, expect, it } from 'vitest';

import { createFakeStrapi } from '../testing/fake-strapi';
import jobStore from './job-store';
import monitorRunner from './monitor-runner';

const RUN = {
  contentType: 'api::page.page',
  documentId: 'doc-1',
  sourceLocale: 'en',
  targetLocales: ['ar'],
};

/** Only localized text is translated, so only localized text is fingerprinted. */
const SCHEMA = {
  attributes: {
    title: { type: 'string', pluginOptions: { i18n: { localized: true } } },
    internalNote: { type: 'string', pluginOptions: { i18n: { localized: false } } },
  },
};

/**
 * The runner against a fake database, with the source document scripted.
 *
 * `source` is mutable so a test can publish, change the text, and publish again — which is the
 * whole behaviour under test.
 */
const createHarness = (source: { current: Record<string, unknown> | null }) => {
  const { strapi, services, logs } = createFakeStrapi();
  const started: number[] = [];

  const jobs = jobStore({ strapi });
  services['job-store'] = jobs;
  services.translator = { buildDeepPopulate: async () => null };
  services['job-runner'] = { start: (id: number) => started.push(id) };

  const extended = strapi as unknown as Record<string, unknown>;
  extended.documents = () => ({ findOne: async () => source.current });
  extended.contentType = () => SCHEMA;
  extended.components = {};
  extended.requestContext = { get: () => undefined };

  return { runner: monitorRunner({ strapi }), jobs, started, logs };
};

describe('monitor-runner', () => {
  it('runs the first time an entry is published', async () => {
    const source = { current: { documentId: 'doc-1', title: 'Rome' } };
    const { runner, started } = createHarness(source);

    const job = await runner.start(RUN);

    expect(job.status).toBe('queued');
    expect(started).toEqual([job.id]);
  });

  it('records what the source said, so a later publish can compare', async () => {
    const source = { current: { documentId: 'doc-1', title: 'Rome' } };
    const { runner } = createHarness(source);

    const job = await runner.start(RUN);

    expect(job.sourceFingerprint).toBeTruthy();
  });

  /** The objection the PRD deferred this feature over: publishing twice should not bill twice. */
  it('skips a republish whose translatable text has not changed', async () => {
    const source = { current: { documentId: 'doc-1', title: 'Rome' } };
    const { runner, jobs, started } = createHarness(source);

    const first = await runner.start(RUN);
    // The first run has to have settled for its fingerprint to count.
    await jobs.setStatus(first.id, 'completed');

    const second = await runner.start(RUN);

    expect(second.status).toBe('skipped');
    expect(started).toEqual([first.id]);
  });

  it('says why it skipped, against every item', async () => {
    const source = { current: { documentId: 'doc-1', title: 'Rome' } };
    const { runner, jobs } = createHarness(source);

    const first = await runner.start(RUN);
    await jobs.setStatus(first.id, 'completed');

    const second = await runner.start(RUN);

    expect(second.items).toHaveLength(1);
    expect(second.items[0].status).toBe('skipped');
    expect(second.items[0].skippedReason).toMatch(/nothing has changed in en/i);
  });

  it('runs again once the text changes', async () => {
    const source = { current: { documentId: 'doc-1', title: 'Rome' } };
    const { runner, jobs, started } = createHarness(source);

    const first = await runner.start(RUN);
    await jobs.setStatus(first.id, 'completed');

    source.current = { documentId: 'doc-1', title: 'Roma' };
    const second = await runner.start(RUN);

    expect(second.status).toBe('queued');
    expect(started).toEqual([first.id, second.id]);
  });

  /**
   * The fingerprint covers what a translation depends on and nothing else. Editing a field no
   * translation reads is not a reason to pay for one.
   */
  it('ignores a change to a field that is never translated', async () => {
    const source = { current: { documentId: 'doc-1', title: 'Rome', internalNote: 'draft' } };
    const { runner, jobs, started } = createHarness(source);

    const first = await runner.start(RUN);
    await jobs.setStatus(first.id, 'completed');

    source.current = { documentId: 'doc-1', title: 'Rome', internalNote: 'checked by legal' };
    const second = await runner.start(RUN);

    expect(second.status).toBe('skipped');
    expect(started).toEqual([first.id]);
  });

  /**
   * A failed run leaves locales untranslated. Treating its fingerprint as current would make the
   * next publish skip, and the failure permanent.
   */
  it('does not skip after a run that failed', async () => {
    const source = { current: { documentId: 'doc-1', title: 'Rome' } };
    const { runner, jobs, started } = createHarness(source);

    const first = await runner.start(RUN);
    await jobs.setStatus(first.id, 'failed');

    const second = await runner.start(RUN);

    expect(second.status).toBe('queued');
    expect(started).toEqual([first.id, second.id]);
  });

  /** Being unable to read the source is a reason to translate, not to stay silent. */
  it('runs when the source cannot be read', async () => {
    const source: { current: Record<string, unknown> | null } = { current: null };
    const { runner, started } = createHarness(source);

    const job = await runner.start(RUN);

    expect(job.sourceFingerprint).toBeNull();
    expect(job.status).toBe('queued');
    expect(started).toEqual([job.id]);
  });
});
