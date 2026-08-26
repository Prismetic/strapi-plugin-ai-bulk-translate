import { normalizeBaseUrl, PROVIDER_CATALOG, type ProviderType } from '../config/provider-catalog';
import { PROVIDER_UID } from '../models';

import type { Core } from '@strapi/strapi';

export interface ProviderRow {
  id: number;
  type: ProviderType;
  label: string;
  baseUrl: string | null;
  apiKeyEncrypted: string | null;
  config: Record<string, unknown> | null;
  enabled: boolean;
}

export interface ProviderInput {
  type: ProviderType;
  label: string;
  baseUrl?: string | null;
  /** Plaintext, straight from the form. Encrypted here and never stored raw. */
  apiKey?: string | null;
  config?: Record<string, unknown> | null;
  enabled?: boolean;
}

/**
 * The shape sent to the browser. Deliberately has no field that could carry a key.
 */
export interface PublicProvider {
  id: number;
  type: ProviderType;
  label: string;
  baseUrl: string | null;
  config: Record<string, unknown> | null;
  enabled: boolean;
  hasApiKey: boolean;
  maskedApiKey: string | null;
}

const providerStore = ({ strapi }: { strapi: Core.Strapi }) => {
  const crypto = () => strapi.plugin('ai-bulk-translate').service('crypto');
  // Resolved lazily, so the two stores can reference each other without an import cycle.
  const modelStore = () => strapi.plugin('ai-bulk-translate').service('model-store');
  const query = () => strapi.db.query(PROVIDER_UID);

  const toPublic = (row: ProviderRow): PublicProvider => ({
    id: row.id,
    type: row.type,
    label: row.label,
    baseUrl: row.baseUrl,
    config: row.config,
    enabled: row.enabled,
    hasApiKey: Boolean(row.apiKeyEncrypted),
    maskedApiKey: crypto().mask(row.apiKeyEncrypted),
  });

  return {
    toPublic,

    async findAll(): Promise<PublicProvider[]> {
      const rows = (await query().findMany({ orderBy: { id: 'asc' } })) as ProviderRow[];

      return rows.map(toPublic);
    },

    /** Internal use only — carries the ciphertext. Never hand this to a controller response. */
    async findRaw(id: number): Promise<ProviderRow | null> {
      return (await query().findOne({ where: { id } })) as ProviderRow | null;
    },

    async create(input: ProviderInput): Promise<PublicProvider> {
      const definition = PROVIDER_CATALOG[input.type];

      if (definition.requiresApiKey && !input.apiKey) {
        throw new Error(`${definition.label} requires an API key.`);
      }

      const row = (await query().create({
        data: {
          type: input.type,
          label: input.label,
          baseUrl: normalizeBaseUrl(input.type, input.baseUrl),
          apiKeyEncrypted: input.apiKey ? crypto().encrypt(input.apiKey) : null,
          config: input.config ?? {},
          enabled: input.enabled ?? true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })) as ProviderRow;

      return toPublic(row);
    },

    async update(id: number, input: Partial<ProviderInput>): Promise<PublicProvider> {
      const existing = await this.findRaw(id);

      if (!existing) {
        throw new Error(`Provider ${id} not found.`);
      }

      const type = input.type ?? existing.type;
      const data: Record<string, unknown> = { updatedAt: new Date() };

      if (input.label !== undefined) data.label = input.label;
      if (input.enabled !== undefined) data.enabled = input.enabled;
      if (input.config !== undefined) data.config = input.config;
      if (input.type !== undefined) data.type = input.type;
      if (input.baseUrl !== undefined) data.baseUrl = normalizeBaseUrl(type, input.baseUrl);

      // An absent apiKey means "leave the stored one alone"; an empty string means "clear it".
      if (input.apiKey !== undefined) {
        data.apiKeyEncrypted = input.apiKey ? crypto().encrypt(input.apiKey) : null;
      }

      const row = (await query().update({ where: { id }, data })) as ProviderRow;

      // A disabled connection cannot answer, so nothing registered under it can be offered any
      // more. Cascading here rather than at the call site means it holds for every writer.
      if (input.enabled === false && existing.enabled) {
        await modelStore().disableForProvider(id);
      }

      return toPublic(row);
    },

    async delete(id: number): Promise<void> {
      await modelStore().deleteForProvider(id);
      await query().delete({ where: { id } });
    },
  };
};

export default providerStore;
