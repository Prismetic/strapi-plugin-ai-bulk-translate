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
/**
 * Turns an AI SDK version-mismatch error into something an operator can act on.
 *
 * Strapi itself depends on the AI SDK (`@strapi/content-type-builder` pulls in `ai`), so a host can
 * end up with that copy hoisted above the plugin's own. The adapters then implement a different
 * provider specification than the core package expects, and the SDK raises a message about
 * "specification version" that says nothing about how to fix it.
 *
 * A normal npm install of this plugin nests its own `ai` and is unaffected — this is mainly seen
 * with linked local checkouts and with package managers that hoist aggressively.
 */
const describeVersionMismatch = (message: string): string | null => {
  if (!/specification version|Unsupported model version/i.test(message)) {
    return null;
  }

  return (
    'The AI SDK core package and its provider adapters are different, incompatible versions. ' +
    'This usually means the plugin is resolving a copy of "ai" belonging to Strapi rather than its ' +
    'own. Reinstall so the plugin gets its own nested copy — for a linked checkout, run ' +
    '`npm install --omit=dev` inside node_modules/strapi-plugin-ai-bulk-translate — then restart ' +
    `Strapi. Original error: ${message}`
  );
};

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
        const mismatch = describeVersionMismatch(detail);

        if (mismatch) {
          return { ok: false, message: mismatch };
        }

        return { ok: false, message: `${definition.label} did not respond: ${detail}` };
      }
    },
  };
};

export default providerRegistry;
