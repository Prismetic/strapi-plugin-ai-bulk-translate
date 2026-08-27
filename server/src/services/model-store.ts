import { PROVIDER_CATALOG, type ProviderType } from '../config/provider-catalog';
import { MODEL_UID } from '../models';

import type { Core } from '@strapi/strapi';
import type { ProviderRow } from './provider-store';

export interface ModelRow {
  id: number;
  providerId: number;
  modelId: string;
  label: string;
  enabled: boolean;
  isDefault: boolean;
}

export interface ModelInput {
  providerId: number;
  modelId: string;
  label: string;
  enabled?: boolean;
  isDefault?: boolean;
}

/**
 * The shape sent to the browser. Carries the parent connection's label and state so a card can
 * explain why a model is unusable without a second request.
 */
export interface PublicModel extends ModelRow {
  providerLabel: string;
  providerType: ProviderType;
  providerEnabled: boolean;
}

/** What a model resolves to when something is about to call it. */
export interface ResolvedModel {
  model: ModelRow;
  provider: ProviderRow;
}

/**
 * Registry of named models, each belonging to a provider connection.
 *
 * Two rules live here rather than in a controller, so they hold whoever writes:
 *
 * 1. **At most one default across the install.** Setting one clears the rest. Editors should not
 *    have to choose a model on every run, and "two defaults" has no meaning to fall back on.
 * 2. **A model is only offered if it can actually be called.** Disabling or deleting a connection
 *    disables its models, and anything disabled loses the default flag. Otherwise a run would
 *    resolve a default that fails at the first request — after the job record exists and the
 *    editor has been told work is underway.
 */
const modelStore = ({ strapi }: { strapi: Core.Strapi }) => {
  const providerStore = () => strapi.plugin('ai-bulk-translate').service('provider-store');
  const query = () => strapi.db.query(MODEL_UID);

  /** Clears the default flag everywhere except `keepId`, so exactly one row can hold it. */
  const clearDefaultsExcept = async (keepId: number | null) => {
    const flagged = (await query().findMany({ where: { isDefault: true } })) as ModelRow[];

    for (const row of flagged) {
      if (row.id !== keepId) {
        await query().update({ where: { id: row.id }, data: { isDefault: false } });
      }
    }
  };

  const requireUsableProvider = async (providerId: number): Promise<ProviderRow> => {
    const provider = (await providerStore().findRaw(providerId)) as ProviderRow | null;

    if (!provider) {
      throw new Error(`Provider connection ${providerId} not found.`);
    }

    if (!provider.enabled) {
      throw new Error(
        `"${provider.label}" is disabled. Enable the connection before registering models under it.`
      );
    }

    // A key is only required where the provider needs one — a local OpenAI-compatible gateway
    // such as Ollama legitimately has none, and rejecting it would rule out self-hosting.
    const definition = PROVIDER_CATALOG[provider.type];

    if (definition?.requiresApiKey && !provider.apiKeyEncrypted) {
      throw new Error(
        `"${provider.label}" has no API key stored, so a model registered under it could not be ` +
          `called. Add the key to the connection first.`
      );
    }

    return provider;
  };

  return {
    async findAll(): Promise<PublicModel[]> {
      const [rows, providers] = await Promise.all([
        query().findMany({ orderBy: { id: 'asc' } }) as Promise<ModelRow[]>,
        providerStore().findAll() as Promise<
          { id: number; label: string; type: ProviderType; enabled: boolean }[]
        >,
      ]);

      return rows.map((row) => {
        const provider = providers.find((candidate) => candidate.id === row.providerId);

        return {
          ...row,
          providerLabel: provider?.label ?? `Deleted connection ${row.providerId}`,
          providerType: provider?.type ?? ('openai' as ProviderType),
          providerEnabled: provider?.enabled ?? false,
        };
      });
    },

    async findRaw(id: number): Promise<ModelRow | null> {
      return (await query().findOne({ where: { id } })) as ModelRow | null;
    },

    async create(input: ModelInput): Promise<ModelRow> {
      await requireUsableProvider(input.providerId);

      const enabled = input.enabled ?? true;
      const row = (await query().create({
        data: {
          providerId: input.providerId,
          modelId: input.modelId,
          label: input.label,
          enabled,
          isDefault: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })) as ModelRow;

      if (input.isDefault) {
        return this.setDefault(row.id);
      }

      /**
       * The first model on an install becomes the default without being asked.
       *
       * This is the one case where the right default is unambiguous — there is nothing else to
       * choose — so it does not conflict with the rule that a run must never use a model nobody
       * selected. Without it a fresh install sits in a state where every run fails with "No usable
       * model is configured", reached by doing nothing wrong.
       *
       * Deliberately only the *first*: a later model never displaces a default silently. Skipped
       * when the model is disabled, which `setDefault` would refuse in any case.
       */
      if (enabled) {
        const existing = (await query().findMany({})) as ModelRow[];

        if (existing.length === 1) {
          return this.setDefault(row.id);
        }
      }

      return row;
    },

    async update(id: number, input: Partial<ModelInput>): Promise<ModelRow> {
      const existing = await this.findRaw(id);

      if (!existing) {
        throw new Error(`Model ${id} not found.`);
      }

      if (input.providerId !== undefined && input.providerId !== existing.providerId) {
        await requireUsableProvider(input.providerId);
      }

      const data: Record<string, unknown> = { updatedAt: new Date() };

      if (input.modelId !== undefined) data.modelId = input.modelId;
      if (input.label !== undefined) data.label = input.label;
      if (input.providerId !== undefined) data.providerId = input.providerId;

      if (input.enabled !== undefined) {
        data.enabled = input.enabled;

        // A disabled model must never be offered, so it cannot stay the default.
        if (!input.enabled) {
          data.isDefault = false;
        }
      }

      const row = (await query().update({ where: { id }, data })) as ModelRow;

      if (input.isDefault === true) {
        return this.setDefault(id);
      }

      if (input.isDefault === false) {
        return (await query().update({ where: { id }, data: { isDefault: false } })) as ModelRow;
      }

      return row;
    },

    async delete(id: number): Promise<void> {
      // No replacement default is chosen. Picking one silently would mean a run quietly using a
      // model nobody selected; an explicit "no default" is the honest state.
      await query().delete({ where: { id } });
    },

    /** Marks one model default, clearing every other. Refuses if it could not be used. */
    async setDefault(id: number): Promise<ModelRow> {
      const model = await this.findRaw(id);

      if (!model) {
        throw new Error(`Model ${id} not found.`);
      }

      if (!model.enabled) {
        throw new Error(`"${model.label}" is disabled and cannot be the default model.`);
      }

      await requireUsableProvider(model.providerId);
      await clearDefaultsExcept(id);

      return (await query().update({
        where: { id },
        data: { isDefault: true, updatedAt: new Date() },
      })) as ModelRow;
    },

    /**
     * The default model together with the connection that can call it, or null when there is none.
     * This is the entry point later slices use to run a translation without an explicit choice.
     */
    async resolveDefault(): Promise<ResolvedModel | null> {
      const model = (await query().findOne({
        where: { isDefault: true, enabled: true },
      })) as ModelRow | null;

      if (!model) {
        return null;
      }

      const provider = (await providerStore().findRaw(model.providerId)) as ProviderRow | null;

      if (!provider || !provider.enabled) {
        return null;
      }

      return { model, provider };
    },

    /** Resolves any registered model by id, for a per-run choice. */
    async resolve(id: number): Promise<ResolvedModel | null> {
      const model = await this.findRaw(id);

      if (!model || !model.enabled) {
        return null;
      }

      const provider = (await providerStore().findRaw(model.providerId)) as ProviderRow | null;

      if (!provider || !provider.enabled) {
        return null;
      }

      return { model, provider };
    },

    /**
     * Cascade for a connection being disabled. Its models cannot be called, so they are disabled
     * and any default they held is cleared.
     */
    async disableForProvider(providerId: number): Promise<void> {
      await query().updateMany({
        where: { providerId },
        data: { enabled: false, isDefault: false, updatedAt: new Date() },
      });
    },

    /** Cascade for a connection being deleted. Orphaned models would be unusable rows. */
    async deleteForProvider(providerId: number): Promise<void> {
      await query().deleteMany({ where: { providerId } });
    },
  };
};

export default modelStore;
