import { loadAiSdk } from '../services/ai-sdk';

import type { Context } from 'koa';

/**
 * Reports whether the plugin is mounted and whether the ESM-only AI SDK actually
 * resolves at runtime inside the CommonJS server bundle.
 *
 * Static analysis of the build output can show the dynamic import survived, but only
 * calling it proves Node resolves the external. This route is how that gets verified in
 * a running Strapi, and it stays useful afterwards as a first diagnostic when a host
 * install misbehaves.
 */
const healthController = {
  async check(ctx: Context) {
    try {
      const sdk = await loadAiSdk();

      // Resolved from the plugin's own position in node_modules, so this reports the copy the
      // plugin will actually use — the number that matters when adapters disagree with core.
      const versionOf = (pkg: string): string => {
        try {
          return require(`${pkg}/package.json`).version as string;
        } catch {
          return 'not resolved';
        }
      };

      ctx.body = {
        ok: true,
        plugin: 'ai-bulk-translate',
        aiSdk: {
          loaded: true,
          // Proof the namespace is real rather than an empty interop shim.
          generateText: typeof sdk.generateText,
          generateObject: typeof sdk.generateObject,
          createProviderRegistry: typeof sdk.createProviderRegistry,
          version: versionOf('ai'),
          adapters: {
            openai: versionOf('@ai-sdk/openai'),
            azure: versionOf('@ai-sdk/azure'),
          },
        },
      };
    } catch (error) {
      ctx.status = 500;
      ctx.body = {
        ok: false,
        plugin: 'ai-bulk-translate',
        aiSdk: {
          loaded: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  },
};

export default healthController;
