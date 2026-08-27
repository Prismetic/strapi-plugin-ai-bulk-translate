import { defaultLocaleCode } from '../services/default-locale';

import type { Context } from 'koa';

/**
 * Serves the host's configured locales to the dialog.
 *
 * The admin could read i18n's own store, but that means depending on another plugin's internal
 * admin state; one route of our own is a stable contract instead.
 */
const localeController = {
  async find(ctx: Context) {
    const locales = (await strapi.plugin('i18n').service('locales').find()) as {
      code: string;
      name: string;
    }[];

    // The rows do not carry it — see defaultLocaleCode for why reading isDefault here is a trap.
    const defaultCode = await defaultLocaleCode(strapi);

    ctx.body = {
      data: locales.map((locale) => ({
        code: locale.code,
        name: locale.name,
        isDefault: locale.code === defaultCode,
      })),
    };
  },
};

export default localeController;
