import type { Core } from '@strapi/strapi';

const bootstrap = ({ strapi }: { strapi: Core.Strapi }) => {
  // Fail loudly at startup rather than silently storing unusable credentials later. Without an
  // encryption key the admin encryption service returns null, and a plugin that shrugged at that
  // would persist nulls where keys should be.
  const available = strapi.plugin('ai-bulk-translate').service('crypto').isAvailable();

  if (!available) {
    strapi.log.warn(
      '[ai-bulk-translate] No admin encryption key configured. Provider API keys cannot be saved. ' +
        'Set ENCRYPTION_KEY and expose it through config/admin as secrets.encryptionKey.'
    );
  }
};

export default bootstrap;
