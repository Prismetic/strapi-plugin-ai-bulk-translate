import { identifyDocuments } from './entry-identity';
import { extractFields, type ComponentSchemas } from './field-extractor';
import { fingerprintFields } from './source-fingerprint';

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

    /**
     * A hash of the text this publish would actually translate.
     *
     * Read with the same deep populate the translator uses. A shallower read would miss text
     * inside components and report an edited entry as unchanged — which would silently stop
     * translating it, the worst failure this feature could have.
     *
     * Failing to fingerprint is a reason to translate, not to skip: being wrong here costs one
     * translation, and being wrong the other way costs silence.
     */
    async fingerprint(run: MonitoredRun): Promise<string | null> {
      try {
        const populate = await plugin().service('translator').buildDeepPopulate(run.contentType);

        const source = (await strapi.documents(run.contentType as never).findOne({
          documentId: run.documentId,
          locale: run.sourceLocale,
          status: 'draft',
          ...(populate ? { populate } : {}),
        } as never)) as Record<string, unknown> | null;

        if (!source) {
          return null;
        }

        return fingerprintFields(
          extractFields(
            strapi.contentType(run.contentType as never) as never,
            source,
            strapi.components as unknown as ComponentSchemas
          )
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';

        strapi.log.warn('[ai-bulk-translate] Could not fingerprint the source: ' + message);

        return null;
      }
    },

    async start(run: MonitoredRun): Promise<PublicJob> {
      const documents = await identifyDocuments(
        strapi,
        run.contentType,
        [run.documentId],
        run.sourceLocale
      );

      const fingerprint = await this.fingerprint(run);

      const job = (await plugin()
        .service('job-store')
        .create({
          origin: 'monitor',
          contentType: run.contentType,
          sourceLocale: run.sourceLocale,
          targetLocales: run.targetLocales,
          documentIds: [run.documentId],
          documents,
          overwriteDocumentIds: [],
          modelId: null,
          createdById: this.publisherId(),
          sourceFingerprint: fingerprint,
        })) as PublicJob;

      /**
       * Nothing a translation depends on has changed, so no model is called.
       *
       * The run is still recorded. "Why didn't it translate?" must be answerable by looking,
       * because a monitor that correctly does nothing and one that is broken are otherwise
       * indistinguishable — which is why skips are rows rather than log lines.
       */
      const previous = fingerprint
        ? await plugin()
            .service('job-store')
            .lastFingerprintFor(run.contentType, run.documentId, run.sourceLocale)
        : null;

      if (fingerprint !== null && previous === fingerprint) {
        strapi.log.info(
          '[ai-bulk-translate] Monitoring skipped run ' +
            job.id +
            ': ' +
            run.contentType +
            ' is unchanged in ' +
            run.sourceLocale +
            ' since the last translation.'
        );

        return (await plugin()
          .service('job-store')
          .recordSkipped(
            job.id,
            'Nothing has changed in ' +
              run.sourceLocale +
              ' since the last translation, so no model was called.'
          )) as PublicJob;
      }

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
