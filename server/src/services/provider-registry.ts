import { PROVIDER_CATALOG, type ProviderType } from '../config/provider-catalog';
import { loadAiSdk } from './ai-sdk';

import type { Core } from '@strapi/strapi';
import type { ProviderRow } from './provider-store';

/**
 * Turns a stored connection into a language model the AI SDK can call.
 *
 * Every adapter package is ESM-only, so they are reached through dynamic import for the same
 * reason the core SDK is — see `ai-sdk.ts`. This is also the only place a decrypted key exists;
 * it is passed straight into the adapter and never returned, logged, or put on a response.
 */
const providerRegistry = ({ strapi }: { strapi: Core.Strapi }) => {
  const crypto = () => strapi.plugin('ai-bulk-translate').service('crypto');

  const buildProvider = async (row: ProviderRow) => {
    const apiKey = row.apiKeyEncrypted ? crypto().decrypt(row.apiKeyEncrypted) : undefined;

    if (row.apiKeyEncrypted && !apiKey) {
      throw new Error(
        `Stored key for "${row.label}" could not be decrypted. The admin encryption key may have ` +
          `changed since it was saved; re-enter the key to fix this.`
      );
    }

    const baseURL = row.baseUrl ?? undefined;

    switch (row.type) {
      case 'openai': {
        const { createOpenAI } = await import('@ai-sdk/openai');
        return createOpenAI({ apiKey, baseURL });
      }
      case 'azure': {
        const { createAzure } = await import('@ai-sdk/azure');
        // baseUrl is normalised on write to include the version segment; see provider-catalog.
        return createAzure({ apiKey, baseURL });
      }
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic');
        return createAnthropic({ apiKey, baseURL });
      }
      case 'google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
        return createGoogleGenerativeAI({ apiKey, baseURL });
      }
      case 'openai-compatible': {
        const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');

        if (!baseURL) {
          throw new Error(`"${row.label}" needs a base URL.`);
        }

        return createOpenAICompatible({
          name: (row.config?.name as string) || row.label,
          apiKey,
          baseURL,
        });
      }
      default: {
        const exhaustive: never = row.type;
        throw new Error(`Unsupported provider type: ${String(exhaustive)}`);
      }
    }
  };

  return {
    /** Resolves a callable language model for a connection and model identifier. */
    async getModel(row: ProviderRow, modelId: string) {
      const provider = await buildProvider(row);

      return provider(modelId);
    },

    /**
     * Confirms a connection genuinely works by making the smallest real call possible.
     *
     * Checking credential shape locally would prove nothing — a well-formed key against the wrong
     * endpoint, a model that is not deployed, or a revoked key all look fine until something is
     * actually sent. This is the check that catches those, before a bulk run does.
     */
    async testConnection(
      row: ProviderRow,
      modelId: string
    ): Promise<{ ok: boolean; message: string; model?: string; usage?: unknown }> {
      const definition = PROVIDER_CATALOG[row.type as ProviderType];

      try {
        const [{ generateText }, model] = await Promise.all([
          loadAiSdk(),
          this.getModel(row, modelId),
        ]);

        const result = await generateText({
          model,
          prompt: 'Reply with the single word: ok',
        });

        return {
          ok: true,
          message: `${definition.label} responded using "${modelId}".`,
          model: modelId,
          usage: result.usage,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown error';

        return { ok: false, message: `${definition.label} did not respond: ${detail}` };
      }
    },
  };
};

export default providerRegistry;
