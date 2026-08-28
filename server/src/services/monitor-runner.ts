import { identifyDocuments } from './entry-identity';

import type { MonitoredRun } from './monitor-trigger';
import type { PublicJob } from './job-store';
import type { Core } from '@strapi/strapi';

/**
 * Turns a monitored publish into a run.
 *
 * Deliberately thin: what to translate was decided by `triggeredRun`, and how to translate it is
 * the same job pipeline every other surface uses. A monitored run is an ordinary run with
 * `origin: 'monitor'` — same items, same isolation, same retry, same place in the Jobs tab.
 *
 * **Nothing is overwritten in this slice.** The run authorises no overwrites, so the pipeline's
 * existing rule applies: a target locale that already holds content is skipped, and only empty
 * ones are written. The per-locale overwrite policy is a later slice, and it lands as
 * authorisation on the job rather than as a second code path.
 *
 * **No model is pinned.** Passing none tells the runner to resolve the install's default at run
 * time, which is right for a run nobody chose a model for — and if none resolves, the runner
 * already records a failed run naming that reason rather than doing nothing.
 */
const monitorRunner = ({ strapi }: { strapi: Core.Strapi }) => {
  const plugin = () => strapi.plugin('ai-bulk-translate');

  return {
    /**
     * Who published, when that is knowable.
     *
     * A publish from the admin runs inside a request that carries the user; a programmatic publish
     * does not, and that is a real state rather than an error — the run still happens, because the
     * authorisation is the monitoring configuration, not the publisher.
     */
    publisherId(): number | null {
      const request = strapi.requestContext?.get();

      return (request?.state?.user?.id as number | undefined) ?? null;
    },

    async start(run: MonitoredRun): Promise<PublicJob> {
      const documents = await identifyDocuments(
        strapi,
        run.contentType,
        [run.documentId],
        run.sourceLocale
      );

      const job = (await plugin().service('job-store').create({
        origin: 'monitor',
        contentType: run.contentType,
        sourceLocale: run.sourceLocale,
        targetLocales: run.targetLocales,
        documentIds: [run.documentId],
        documents,
        overwriteDocumentIds: [],
        modelId: null,
        createdById: this.publisherId(),
      })) as PublicJob;

      strapi.log.info(
        `[ai-bulk-translate] Monitoring started run ${job.id} for ${run.contentType} ` +
          `into ${run.targetLocales.join(', ')}.`
      );

      // Not awaited: a publish must not wait on a translation, and the run reports itself through
      // the job row either way.
      plugin().service('job-runner').start(job.id);

      return job;
    },
  };
};

export default monitorRunner;
