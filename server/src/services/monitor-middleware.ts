import { defaultLocaleCode } from './default-locale';
import { triggeredRun, type TriggerContext } from './monitor-trigger';

import type { Core } from '@strapi/strapi';

/**
 * Translates a monitored entry when its default locale is published.
 *
 * This runs on **every** document-service call in the host — every find, every update, on every
 * content type, monitored or not. The first line is therefore the important one: anything that is
 * not a publish returns immediately, before any await, any store read, or any allocation. An
 * install that configured no monitoring should not be able to tell this exists.
 *
 * The translation is decided **after** `next()` resolves, so a publish that failed never triggers
 * one, and nothing here changes what publish returns.
 *
 * Nothing thrown here may escape into the publish path. A plugin that broke publishing because its
 * own configuration could not be read would be far worse than one that failed to translate, so
 * every failure is logged and swallowed.
 *
 * Extracted from `bootstrap` so it can be tested with a stubbed context rather than a running host.
 */
export const publishMonitor =
  (strapi: Core.Strapi) =>
  async (ctx: unknown, next: () => Promise<unknown>): Promise<unknown> => {
    const context = ctx as TriggerContext;

    if (context?.action !== 'publish') {
      return next();
    }

    const result = await next();

    try {
      const monitored = await strapi
        .plugin('ai-bulk-translate')
        .service('monitor-config')
        .monitored();

      // The common case on an install that configured nothing: stop before asking i18n anything.
      if (Object.keys(monitored).length === 0) {
        return result;
      }

      const run = triggeredRun(context, monitored, await defaultLocaleCode(strapi));

      if (run) {
        await strapi.plugin('ai-bulk-translate').service('monitor-runner').start(run);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      strapi.log.error(`[ai-bulk-translate] Monitoring could not start a run: ${message}`);
    }

    return result;
  };
