import { z } from 'zod';

import { resolveEntrySelection } from '../services/entry-selection';
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
  /** Optional for the same reason as on a run: a single type's identifier is resolved here. */
  documentIds: z.array(z.string().trim().min(1)).optional(),
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

    // The run's own resolution, so a single type previews the document it would translate and a
    // selection the run would refuse is refused here with the same words.
    const selection = await resolveEntrySelection(strapi, input);

    if ('refusal' in selection) {
      ctx.status = 400;
      ctx.body = { error: { message: selection.refusal } };
      return;
    }

    const { documentIds } = selection;
    const cap = strapi.config.get('plugin::ai-bulk-translate.maxDocumentsPerRun') as number;

    // Same ceiling the run itself enforces: a preview of a selection that could never run is only
    // a way to make the server do a lot of reads for nothing.
    if (documentIds.length > cap) {
      ctx.status = 400;
      ctx.body = {
        error: { message: `Select ${cap} entries or fewer.` },
      };
      return;
    }

    ctx.body = {
      data: await strapi
        .plugin('ai-bulk-translate')
        .service('locale-status')
        .build({ ...input, documentIds }),
    };
  },
};

export default localeStatusController;
