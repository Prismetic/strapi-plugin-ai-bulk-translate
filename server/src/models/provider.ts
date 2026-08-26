/**
 * Raw database model for provider connections.
 *
 * Registered through `strapi.get('models').add()` rather than declared as a content type, so it
 * never appears in the Content Manager. Credentials are not editorial content.
 */
export const PROVIDER_UID = 'plugin::ai-bulk-translate.provider';

export const providerModel = {
  uid: PROVIDER_UID,
  tableName: 'ai_bulk_translate_providers',
  singularName: 'provider',
  attributes: {
    id: { type: 'increments' },
    type: { type: 'string', column: { notNullable: true } },
    label: { type: 'string', column: { notNullable: true } },
    baseUrl: { type: 'string' },
    /** AES-256-GCM ciphertext from admin::encryption. Never the raw key. */
    apiKeyEncrypted: { type: 'text' },
    /** Non-secret per-provider extras from the catalog. */
    config: { type: 'json' },
    enabled: { type: 'boolean', default: true },
    createdAt: { type: 'datetime', default: () => new Date() },
    updatedAt: { type: 'datetime', default: () => new Date() },
  },
};
