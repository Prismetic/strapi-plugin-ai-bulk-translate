import { jobCreateSchema } from '../validation/job';
import { jobListQuerySchema } from '../validation/job-list';
import { formatZodError } from '../validation/provider';
import { defaultLocaleCode } from '../services/default-locale';
import { identifyDocuments } from '../services/entry-identity';
import { resolveEntrySelection } from '../services/entry-selection';
import { rejectTargetLocales } from '../validation/target-locales';

import type { Context } from 'koa';

const plugin = () => strapi.plugin('ai-bulk-translate');

/** The Content Manager's own write permission for a content type. */
const CONTENT_MANAGER_UPDATE = 'plugin::content-manager.explorer.update';

const badRequest = (ctx: Context, message: string) => {
  ctx.status = 400;
  ctx.body = { error: { message } };
};

const jobController = {
  /**
   * Creates a run and returns immediately with a job reference.
   *
   * The work is deliberately not awaited: one model call per document and locale exceeds any safe
   * request timeout, so the admin polls `findOne` instead.
   */
  async create(ctx: Context) {
    const parsed = jobCreateSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      return badRequest(ctx, formatZodError(parsed.error));
    }

    const input = parsed.data;

    // Shared with the preview route, so what the dialog was shown and what the run does are
    // decided by the same code — including which single-type document "no identifier" means.
    const selection = await resolveEntrySelection(strapi, input);

    if ('refusal' in selection) {
      return badRequest(ctx, selection.refusal);
    }

    const { documentIds } = selection;

    // Guarded server-side, so a mis-click or a crafted request cannot trigger an enormous bill.
    const cap = strapi.config.get('plugin::ai-bulk-translate.maxDocumentsPerRun') as number;

    if (documentIds.length > cap) {
      return badRequest(
        ctx,
        `This run covers ${documentIds.length} entries, above the limit of ${cap}. ` +
          `Select fewer entries or raise maxDocumentsPerRun in the plugin configuration.`
      );
    }

    /**
     * Read from i18n at request time rather than trusted from the client: the default locale is the
     * one thing a run must never overwrite, so the answer has to come from the install itself.
     */
    const defaultLocale = await defaultLocaleCode(strapi);

    const refusal = rejectTargetLocales({
      targetLocales: input.targetLocales,
      sourceLocale: input.sourceLocale,
      defaultLocale,
    });

    if (refusal !== null) {
      return badRequest(ctx, refusal);
    }

    /**
     * Holding `translate` is not the same as being allowed to write *this* content type.
     *
     * Without this check the plugin permission would be a way around content permissions rather
     * than an addition to them: anyone able to translate could write to a type their role
     * otherwise excludes, by asking a model to do it for them. The Content Manager's own checker is
     * used so the answer matches what the Content Manager itself would allow.
     */
    const checker = strapi
      .plugin('content-manager')
      .service('permission-checker')
      .create({ userAbility: ctx.state?.userAbility, model: input.contentType });

    // `cannot` takes the action id; the checker exposes no bound `.update()` helper at 5.27.
    if (checker.cannot(CONTENT_MANAGER_UPDATE)) {
      ctx.status = 403;
      ctx.body = {
        error: {
          message: `You do not have permission to update "${input.contentType}", so it cannot be translated.`,
        },
      };
      return;
    }

    /**
     * Read once, now, and stored on the run. History has to name these entries long after this
     * request — including after they are renamed or deleted, which is exactly when a lookup would
     * answer nothing.
     */
    const documents = await identifyDocuments(
      strapi,
      input.contentType,
      documentIds,
      input.sourceLocale
    );

    const job = await plugin()
      .service('job-store')
      .create({
        origin: input.origin ?? 'document',
        documents,
        contentType: input.contentType,
        sourceLocale: input.sourceLocale,
        targetLocales: input.targetLocales,
        documentIds,
        overwriteDocumentIds: input.overwriteDocumentIds ?? [],
        modelId: input.modelId ?? null,
        createdById: ctx.state?.user?.id ?? null,
      });

    plugin().service('job-runner').start(job.id);

    ctx.status = 201;
    ctx.body = { data: job };
  },

  /**
   * A page of runs for the Jobs tab.
   *
   * Returns **everyone's** runs, not the caller's. Monitored runs are attributed to whoever
   * published the entry, so a per-user view would scatter automatic activity across accounts and
   * hide it from the administrator who configured it — the one person who most needs to see it.
   *
   * Creator names are resolved for the page in one query rather than per row. An absent creator is
   * a real state, not an error: a run can outlive the account that started it.
   */
  async find(ctx: Context) {
    const parsed = jobListQuerySchema.safeParse(ctx.query);

    if (!parsed.success) {
      return badRequest(ctx, formatZodError(parsed.error));
    }

    const { status, page, pageSize } = parsed.data;
    const { data, total } = await plugin()
      .service('job-store')
      .findMany({ statuses: status, page, pageSize });

    const creatorIds = [...new Set(data.map((job) => job.createdById).filter(Boolean))];

    const creators = creatorIds.length
      ? ((await strapi.db.query('admin::user').findMany({
          where: { id: { $in: creatorIds } },
          select: ['id', 'firstname', 'lastname', 'email'],
        })) as { id: number; firstname?: string; lastname?: string; email?: string }[])
      : [];

    const nameOf = new Map(
      creators.map((user) => [
        user.id,
        [user.firstname, user.lastname].filter(Boolean).join(' ').trim() || user.email || null,
      ])
    );

    ctx.body = {
      data: data.map((job) => ({
        ...job,
        createdByName: job.createdById === null ? null : (nameOf.get(job.createdById) ?? null),
      })),
      meta: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    };
  },

  /**
   * Re-runs only the failed items of a finished run.
   *
   * Successful and skipped items are left alone. Re-translating a success would pay for the same
   * output twice and overwrite a locale the editor may have corrected since the run — which is
   * exactly what someone reaching for "retry" after a transient provider error does not want.
   */
  async retry(ctx: Context) {
    const id = Number(ctx.params.id);
    const jobs = plugin().service('job-store');
    const job = await jobs.findOne(id);

    if (!job) {
      ctx.status = 404;
      ctx.body = { error: { message: 'Job not found' } };
      return;
    }

    if (job.status === 'processing' || job.status === 'queued') {
      return badRequest(
        ctx,
        'This run is still in progress. Wait for it to finish before retrying.'
      );
    }

    const reset = await jobs.resetFailedItems(id);

    if (reset === 0) {
      return badRequest(ctx, 'Nothing to retry — no items in this run failed.');
    }

    plugin().service('job-runner').start(id);

    ctx.body = { data: await jobs.findOne(id), retrying: reset };
  },

  async findOne(ctx: Context) {
    const job = await plugin().service('job-store').findOne(Number(ctx.params.id));

    if (!job) {
      ctx.status = 404;
      ctx.body = { error: { message: 'Job not found' } };
      return;
    }

    ctx.body = { data: job };
  },
};

export default jobController;
