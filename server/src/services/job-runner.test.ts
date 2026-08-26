import { describe, expect, it } from 'vitest';

import { createFakeStrapi } from '../testing/fake-strapi';
import jobRunner from './job-runner';
import jobStore from './job-store';

import type { TranslateOutcome, TranslateRequest } from './translator';

const RESOLVED = {
  model: {
    id: 1,
    providerId: 1,
    modelId: 'gpt-5.4-mini',
    label: 'Mini',
    enabled: true,
    isDefault: true,
  },
  provider: {
    id: 1,
    type: 'openai',
    label: 'OpenAI',
    baseUrl: null,
    apiKeyEncrypted: 'enc:k',
    config: {},
    enabled: true,
  },
};

/**
 * Wires the runner against a fake database and a scripted translator, so an item's outcome is
 * whatever the test says it is — including throwing.
 */
const createHarness = (
  translate: (request: TranslateRequest) => Promise<TranslateOutcome>,
  resolved: unknown = RESOLVED,
  config: Record<string, unknown> = {}
) => {
  const seen: TranslateRequest[] = [];
  const { strapi, services, logs } = createFakeStrapi({ config });

  services.translator = {
    translateDocument: (request: TranslateRequest) => {
      seen.push(request);

      return translate(request);
    },
  };
  services['model-store'] = {
    resolveDefault: async () => resolved,
    resolve: async () => resolved,
  };

  const jobs = jobStore({ strapi });
  services['job-store'] = jobs;

  return { runner: jobRunner({ strapi }), jobs, seen, logs };
};

const twoItemJob = {
  origin: 'document' as const,
  contentType: 'api::page.page',
  sourceLocale: 'en',
  targetLocales: ['ar', 'zh-CN'],
  documentIds: ['doc-1'],
};

describe('job-runner', () => {
  it('records an outcome for every item and completes the run', async () => {
    const { runner, jobs } = createHarness(async () => ({ status: 'translated' }));
    const job = await jobs.create(twoItemJob);

    const finished = await runner.run(job.id);

    expect(finished?.status).toBe('completed');
    expect(finished?.progress).toEqual({ total: 2, done: 2, translated: 2, skipped: 0, failed: 0 });
  });

  it('keeps going when one item throws, and records why against that item', async () => {
    const { runner, jobs } = createHarness(async ({ targetLocale }) => {
      if (targetLocale === 'ar') {
        throw new Error('provider rejected the request: invalid api key');
      }

      return { status: 'translated' };
    });
    const job = await jobs.create(twoItemJob);

    const finished = await runner.run(job.id);

    expect(finished?.progress).toEqual({ total: 2, done: 2, translated: 1, skipped: 0, failed: 1 });

    const failed = finished?.items.find((item) => item.locale === 'ar');
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('invalid api key');

    // The point of isolation: the other locale still landed.
    expect(finished?.items.find((item) => item.locale === 'zh-CN')?.status).toBe('translated');
  });

  it('reports a run as completed when some items failed but others succeeded', async () => {
    const { runner, jobs } = createHarness(async ({ targetLocale }) =>
      targetLocale === 'ar' ? { status: 'failed', error: 'nope' } : { status: 'translated' }
    );
    const job = await jobs.create(twoItemJob);

    // A run that produced real work is not a failed run; the per-item errors say what went wrong.
    expect((await runner.run(job.id))?.status).toBe('completed');
  });

  it('reports a run as failed only when nothing succeeded', async () => {
    const { runner, jobs } = createHarness(async () => ({ status: 'failed', error: 'nope' }));
    const job = await jobs.create(twoItemJob);

    expect((await runner.run(job.id))?.status).toBe('failed');
  });

  it('passes the overwrite authorisation through per document', async () => {
    const { runner, jobs, seen } = createHarness(async () => ({ status: 'translated' }));
    const job = await jobs.create({
      ...twoItemJob,
      documentIds: ['doc-1', 'doc-2'],
      targetLocales: ['ar'],
      overwriteDocumentIds: ['doc-2'],
    });

    await runner.run(job.id);

    expect(seen.map((request) => [request.documentId, request.allowOverwrite])).toEqual([
      ['doc-1', false],
      ['doc-2', true],
    ]);
  });

  it('fails every item with a readable reason when no model is configured', async () => {
    const { runner, jobs } = createHarness(async () => ({ status: 'translated' }), null);
    const job = await jobs.create(twoItemJob);

    const finished = await runner.run(job.id);

    expect(finished?.status).toBe('failed');
    expect(finished?.items[0].error).toMatch(/No usable model is configured/);
  });

  it('resolves the model once for the whole run, not per item', async () => {
    let resolutions = 0;
    const { strapi, services } = createFakeStrapi();

    services.translator = { translateDocument: async () => ({ status: 'translated' }) };
    services['model-store'] = {
      resolveDefault: async () => {
        resolutions += 1;

        return RESOLVED;
      },
    };

    const jobs = jobStore({ strapi });
    services['job-store'] = jobs;

    const job = await jobs.create({ ...twoItemJob, documentIds: ['doc-1', 'doc-2'] });
    await jobRunner({ strapi }).run(job.id);

    // Four items, one resolution: a settings change mid-run cannot split a job across models.
    expect(resolutions).toBe(1);
  });

  it('never runs more items at once than maxConcurrency allows', async () => {
    let inFlight = 0;
    let peak = 0;

    const { runner, jobs } = createHarness(
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;

        return { status: 'translated' };
      },
      RESOLVED,
      { maxConcurrency: 2 }
    );

    // Six documents across two locales is twelve items, comfortably more than the cap.
    const job = await jobs.create({
      origin: 'bulk',
      contentType: 'api::page.page',
      sourceLocale: 'en',
      targetLocales: ['ar', 'zh-CN'],
      documentIds: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'],
    });

    const finished = await runner.run(job.id);

    expect(peak).toBe(2);
    expect(finished?.progress.translated).toBe(12);
  });

  it('runs items concurrently rather than one at a time', async () => {
    let peak = 0;
    let inFlight = 0;

    const { runner, jobs } = createHarness(
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;

        return { status: 'translated' };
      },
      RESOLVED,
      { maxConcurrency: 3 }
    );

    const job = await jobs.create({
      origin: 'bulk',
      contentType: 'api::page.page',
      sourceLocale: 'en',
      targetLocales: ['ar', 'zh-CN'],
      documentIds: ['d1', 'd2', 'd3'],
    });

    await runner.run(job.id);

    expect(peak).toBeGreaterThan(1);
  });

  it('isolates a failure while other items run concurrently', async () => {
    const { runner, jobs } = createHarness(
      async ({ documentId }) => {
        if (documentId === 'd2') {
          throw new Error('provider rejected the request');
        }

        return { status: 'translated' };
      },
      RESOLVED,
      { maxConcurrency: 3 }
    );

    const job = await jobs.create({
      origin: 'bulk',
      contentType: 'api::page.page',
      sourceLocale: 'en',
      targetLocales: ['ar'],
      documentIds: ['d1', 'd2', 'd3'],
    });

    const finished = await runner.run(job.id);

    expect(finished?.status).toBe('completed');
    expect(finished?.progress).toMatchObject({ translated: 2, failed: 1 });
    expect(finished?.items.find((i) => i.documentId === 'd2')?.error).toContain('provider rejected');
  });

  it('retries only the failed items, leaving successes untouched', async () => {
    let failNext = true;

    const { runner, jobs, seen } = createHarness(async ({ documentId }) => {
      if (documentId === 'd2' && failNext) {
        throw new Error('transient provider error');
      }

      return { status: 'translated' };
    });

    const job = await jobs.create({
      origin: 'bulk',
      contentType: 'api::page.page',
      sourceLocale: 'en',
      targetLocales: ['ar'],
      documentIds: ['d1', 'd2', 'd3'],
    });

    await runner.run(job.id);
    expect(seen).toHaveLength(3);

    failNext = false;
    const reset = await jobs.resetFailedItems(job.id);
    expect(reset).toBe(1);

    const retried = await runner.run(job.id);

    // Only the failed item was translated again — the two successes were not re-sent, so they were
    // neither paid for twice nor allowed to overwrite a locale edited since.
    expect(seen).toHaveLength(4);
    expect(seen[3].documentId).toBe('d2');
    expect(retried?.progress).toMatchObject({ translated: 3, failed: 0 });
  });

  it('reports nothing to reset when no item failed', async () => {
    const { runner, jobs } = createHarness(async () => ({ status: 'translated' }));
    const job = await jobs.create(twoItemJob);

    await runner.run(job.id);

    expect(await jobs.resetFailedItems(job.id)).toBe(0);
  });

  // Reopening a job that had nothing to reset would strand it: the caller refuses to start a run
  // with no work, leaving a `queued` job that will never be picked up.
  it('leaves the job completed when a reset finds nothing to retry', async () => {
    const { runner, jobs } = createHarness(async () => ({ status: 'translated' }));
    const job = await jobs.create(twoItemJob);

    await runner.run(job.id);
    await jobs.resetFailedItems(job.id);

    expect((await jobs.findOne(job.id))?.status).toBe('completed');
  });

  it('clears a previous error when an item is reset, so a stale failure is not shown', async () => {
    const { runner, jobs } = createHarness(async () => {
      throw new Error('gone wrong');
    });
    const job = await jobs.create(twoItemJob);

    await runner.run(job.id);
    await jobs.resetFailedItems(job.id);

    const reset = await jobs.findOne(job.id);
    expect(reset?.items.every((i) => i.status === 'pending' && i.error === undefined)).toBe(true);
  });
});
