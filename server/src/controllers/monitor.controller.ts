import { defaultLocaleCode } from '../services/default-locale';
import { monitorConfigSchema } from '../validation/monitor';
import { formatZodError } from '../validation/provider';

import type { Context } from 'koa';

const plugin = () => strapi.plugin('ai-bulk-translate');

const badRequest = (ctx: Context, message: string) => {
  ctx.status = 400;
  ctx.body = { error: { message } };
};

/**
 * Reads and writes which content types translate themselves on publish.
 *
 * Thin, as controllers here are: the shape is validated by the schema, and the two things a schema
 * cannot know — which locale is default, and whether a content type is localized at all — are
 * checked against the install before anything is stored.
 */
const monitorController = {
  async find(ctx: Context) {
    ctx.body = { data: await plugin().service('monitor-config').readAll() };
  },

  async update(ctx: Context) {
    const parsed = monitorConfigSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      return badRequest(ctx, formatZodError(parsed.error));
    }

    const config = parsed.data;
    const schema = strapi.contentType(config.contentType as never);

    if (!schema) {
      return badRequest(ctx, `Unknown content type "${config.contentType}".`);
    }

    const options = schema.pluginOptions as { i18n?: { localized?: boolean } } | undefined;

    if (options?.i18n?.localized !== true) {
      return badRequest(
        ctx,
        `"${config.contentType}" does not have internationalization enabled, so it cannot be monitored.`
      );
    }

    /**
     * The same rule the translation dialog enforces, for the same reason: the default locale is the
     * install's source of truth and is never written by a run. Monitoring must not be a way around
     * it, and a monitored write happens with nobody watching.
     */
    const defaultLocale = await defaultLocaleCode(strapi);

    if (defaultLocale !== null && config.locales.some((locale) => locale.code === defaultLocale)) {
      return badRequest(
        ctx,
        `"${defaultLocale}" is the default locale, which is the source of truth for this install ` +
          `and is never written by a translation run.`
      );
    }

    const known = (await strapi.plugin('i18n').service('locales').find()) as { code: string }[];
    const unknown = config.locales.find(
      (locale) => !known.some((entry) => entry.code === locale.code)
    );

    if (unknown) {
      return badRequest(ctx, `"${unknown.code}" is not a locale configured on this install.`);
    }

    ctx.body = { data: await plugin().service('monitor-config').write(config) };
  },
};

export default monitorController;
