import { mapWithLimit } from './concurrency';

import type { Core } from '@strapi/strapi';
import type { JobItem, PublicJob } from './job-store';
import type { ResolvedModel } from './model-store';

/**
 * Executes a job's items outside the HTTP request that created it.
 *
 * A real run makes one model call per document and locale, which comfortably exceeds any safe
 * request timeout, so the controller returns a job reference immediately and the admin polls. The
 * job row is what makes that honest: a restart leaves an auditable `processing` record rather than
 * work that silently vanished.
 *
 * **Items are isolated.** One document failing records an error against that item and the run
 * carries on. A batch of twenty is not worth discarding because the third entry has a bad value.
 *
 * **Items run concurrently, up to `maxConcurrency`.** Twenty entries across three locales is sixty
 * model calls; issuing them all at once is how a provider rate-limits you and how a mis-clicked run
 * spends a lot very fast. A fixed-size pool keeps the request rate the same whether the editor
 * selected two entries or two hundred.
 *
 * **Only `pending` items are worked.** That is what makes retry cheap: reset the failed ones and run
 * the same job again, and the successes are left alone rather than translated and paid for twice.
 */
const jobRunner = ({ strapi }: { strapi: Core.Strapi }) => {
  const plugin = () => strapi.plugin('ai-bulk-translate');
  const jobs = () => plugin().service('job-store');
  const translator = () => plugin().service('translator');
  const models = () => plugin().service('model-store');

  const runItem = async (job: PublicJob, item: JobItem, resolved: ResolvedModel) => {
    try {
      const outcome = await translator().translateDocument({
        contentType: job.contentType,
        documentId: item.documentId,
        sourceLocale: job.sourceLocale,
        targetLocale: item.locale,
        allowOverwrite: job.overwriteDocumentIds.includes(item.documentId),
        resolved,
      });

      await jobs().updateItem(job.id, item.documentId, item.locale, outcome);
    } catch (error) {
      // The message is shown to an editor, so it must be readable rather than a stack trace.
      const message = error instanceof Error ? error.message : 'Unknown error';

      strapi.log.error(`[ai-bulk-translate] job ${job.id} item failed: ${message}`);
      await jobs().updateItem(job.id, item.documentId, item.locale, {
        status: 'failed',
        error: message,
      });
    }
  };

  return {
    /**
     * Runs a job to completion. Resolves when every item has an outcome.
     *
     * Callers that must not block on this — controllers — should start it without awaiting and let
     * the client poll. Awaiting is what tests and probes want.
     */
    async run(jobId: number): Promise<PublicJob | null> {
      const job = await jobs().findOne(jobId);

      if (!job) {
        return null;
      }

      await jobs().setStatus(jobId, 'processing');

      // Resolved once per run, not per item: every item of a run must use the model the run
      // recorded, and re-resolving would let a settings change mid-run split a job across models.
      const resolved: ResolvedModel | null = job.modelId
        ? await models().resolve(job.modelId)
        : await models().resolveDefault();

      if (!resolved) {
        const reason =
          'No usable model is configured. Register a model under an enabled provider connection ' +
          'and mark one as the default.';

        for (const item of job.items.filter((i) => i.status === 'pending')) {
          await jobs().updateItem(jobId, item.documentId, item.locale, {
            status: 'failed',
            error: reason,
          });
        }

        return jobs().finish(jobId);
      }

      // Only pending items: on a retry the successful ones must not be repeated.
      const pending = job.items.filter((item) => item.status === 'pending');
      const limit = Number(strapi.config.get('plugin::ai-bulk-translate.maxConcurrency', 3));

      // mapWithLimit never rejects — a throwing item is recorded against that item by runItem, and
      // the rest of the run continues.
      await mapWithLimit<JobItem, void>(pending, limit, (item) => runItem(job, item, resolved));

      return jobs().finish(jobId);
    },

    /**
     * Starts a run and returns immediately.
     *
     * The rejection handler is not optional: an unhandled rejection here would take down the Node
     * process on a translation failure, and per-item errors are already recorded on the job.
     */
    start(jobId: number): void {
      void this.run(jobId).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown error';

        strapi.log.error(`[ai-bulk-translate] job ${jobId} aborted: ${message}`);
        void jobs().setStatus(jobId, 'failed');
      });
    },
  };
};

export default jobRunner;
