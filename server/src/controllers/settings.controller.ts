import { formatZodError } from '../validation/provider';
import { settingsUpdateSchema } from '../validation/settings';

import type { Context } from 'koa';

const store = () => strapi.plugin('ai-bulk-translate').service('settings-store');

const settingsController = {
  /**
   * The effective settings, plus the defaults alongside them.
   *
   * Both, because the settings page needs to show a restore-to-defaults control that is only
   * meaningful when something differs — and deciding that in the browser from a second request
   * would leave a window where the two disagree.
   */
  async find(ctx: Context) {
    const service = store();

    ctx.body = { data: await service.read(), defaults: service.defaults() };
  },

  async update(ctx: Context) {
    const parsed = settingsUpdateSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = { error: { message: formatZodError(parsed.error) } };

      return;
    }

    const service = store();

    ctx.body = { data: await service.update(parsed.data), defaults: service.defaults() };
  },

  async restore(ctx: Context) {
    const service = store();

    ctx.body = { data: await service.restoreDefaults(), defaults: service.defaults() };
  },
};

export default settingsController;
