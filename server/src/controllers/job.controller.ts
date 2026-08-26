import { jobCreateSchema } from '../validation/job';
import { formatZodError } from '../validation/provider';

import type { Context } from 'koa';

const plugin = () => strapi.plugin('ai-bulk-translate');

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
    const schema = strapi.contentType(input.contentType as never);

    if (!schema) {
      return badRequest(ctx, `Unknown content type "${input.contentType}".`);
    }

    const i18nOptions = schema.pluginOptions as { i18n?: { localized?: boolean } } | undefined;

    if (i18nOptions?.i18n?.localized !== true) {
      return badRequest(
        ctx,
        `"${input.contentType}" does not have internationalization enabled, so it cannot be translated.`
      );
    }

    // A single type has exactly one document, so the plugin finds it rather than trusting the
    // admin to have read an identifier off the route. Its edit view has no identifier to read.
    let documentIds = input.documentIds ?? [];

    if (documentIds.length === 0) {
      if (schema.kind !== 'singleType') {
        return badRequest(ctx, 'Choose at least one entry.');
      }

      const resolved = await plugin()
        .service('translator')
        .resolveSingleTypeDocumentId(input.contentType, input.sourceLocale);

      if (!resolved) {
        return badRequest(
          ctx,
          `"${input.contentType}" has nothing saved in ${input.sourceLocale} yet, so there is ` +
            `nothing to translate.`
        );
      }

      documentIds = [resolved];
    }

    // Guarded server-side, so a mis-click or a crafted request cannot trigger an enormous bill.
    const cap = strapi.config.get('plugin::ai-bulk-translate.maxDocumentsPerRun') as number;

    if (documentIds.length > cap) {
      return badRequest(
        ctx,
        `This run covers ${documentIds.length} entries, above the limit of ${cap}. ` +
          `Select fewer entries or raise maxDocumentsPerRun in the plugin configuration.`
      );
    }

    if (input.targetLocales.includes(input.sourceLocale)) {
      return badRequest(ctx, 'The source locale cannot also be a target locale.');
    }

    const job = await plugin()
      .service('job-store')
      .create({
        origin: 'document',
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
