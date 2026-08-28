import { RBAC_ACTIONS } from './permissions/actions';

import type { Core } from '@strapi/strapi';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  // Registered here rather than in `register`: the action provider is not ready until the admin
  // plugin has bootstrapped.
  await strapi.service('admin::permission').actionProvider.registerMany(RBAC_ACTIONS);

  // Fail loudly at startup rather than silently storing unusable credentials later. Without an
  // encryption key the admin encryption service returns null, and a plugin that shrugged at that
  // would persist nulls where keys should be.
  if (!strapi.plugin('ai-bulk-translate').service('crypto').isAvailable()) {
    strapi.log.warn(
      '[ai-bulk-translate] No admin encryption key configured. Provider API keys cannot be saved. ' +
        'Set ENCRYPTION_KEY and expose it through config/admin as secrets.encryptionKey.'
    );
  }

  /**
   * Keeps job history bounded.
   *
   * Nightly rather than on a timer from boot, so a host restarted often does not prune repeatedly
   * — and one that runs for months still prunes. The window is read inside the task rather than
   * captured here, so a host's config change takes effect without a rebuild.
   */
  strapi.cron.add({
    'ai-bulk-translate:prune-jobs': {
      async task({ strapi: instance }) {
        const days = instance.config.get(
          'plugin::ai-bulk-translate.jobRetentionDays',
          30
        ) as number;

        const removed = await instance
          .plugin('ai-bulk-translate')
          .service('job-store')
          .prune(new Date(), days);

        if (removed > 0) {
          instance.log.info(
            `[ai-bulk-translate] Pruned ${removed} translation run(s) older than ${days} days.`
          );
        }
      },
      options: { rule: '0 3 * * *' },
    },
  });
};

export default bootstrap;
