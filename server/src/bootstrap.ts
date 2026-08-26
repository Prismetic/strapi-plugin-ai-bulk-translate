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
};

export default bootstrap;
