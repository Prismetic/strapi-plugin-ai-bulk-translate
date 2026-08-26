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
  resolved: unknown = RESOLVED
) => {
  const seen: TranslateRequest[] = [];
  const { strapi, services, logs } = createFakeStrapi();

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
});
