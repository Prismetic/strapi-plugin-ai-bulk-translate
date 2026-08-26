import { z } from 'zod';

import { formatZodError } from '../validation/provider';

import type { Context } from 'koa';

/**
 * A read, but a POST.
 *
 * The request carries a list of document identifiers, and a bulk selection can hold as many as the
 * run cap allows. Putting a hundred of those in a query string invites truncation by a proxy long
 * before it is anyone's fault. The handler writes nothing.
 */
const requestSchema = z.object({
  contentType: z.string().trim().min(1),
  sourceLocale: z.string().trim().min(1).max(20),
  targetLocales: z.array(z.string().trim().min(1).max(20)).min(1),
  documentIds: z.array(z.string().trim().min(1)).min(1),
});

const localeStatusController = {
  async find(ctx: Context) {
    const parsed = requestSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: { message: formatZodError(parsed.error) } };
      return;
    }

    const input = parsed.data;
    const cap = strapi.config.get('plugin::ai-bulk-translate.maxDocumentsPerRun') as number;

    // Same ceiling the run itself enforces: a preview of a selection that could never run is only
    // a way to make the server do a lot of reads for nothing.
    if (input.documentIds.length > cap) {
      ctx.status = 400;
      ctx.body = {
        error: { message: `Select ${cap} entries or fewer.` },
      };
      return;
    }

    ctx.body = {
      data: await strapi.plugin('ai-bulk-translate').service('locale-status').build(input),
    };
  },
};

export default localeStatusController;
