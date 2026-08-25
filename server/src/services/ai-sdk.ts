/**
 * Single entry point for reaching the AI SDK from this plugin's server code.
 *
 * The SDK is ESM-only: its package `exports` map has no `require` condition. This
 * plugin's server bundle is CommonJS, because that is what Strapi loads. The two are
 * bridged with a dynamic import, which Rollup preserves verbatim in CommonJS output
 * rather than rewriting into a synchronous require.
 *
 * Two rules follow, and breaking either fails at runtime rather than at build time:
 *
 *   1. Never import the SDK at module top level. A static import is emitted as a
 *      synchronous require and throws ERR_REQUIRE_ESM when Strapi loads the plugin.
 *   2. Never import it from `admin/`. All model calls are server-side; pulling an
 *      ESM-only SDK into the browser bundle buys nothing.
 *
 * Everything that needs the SDK goes through here, so there is exactly one place to
 * change if the packaging story shifts.
 */
type AiSdk = typeof import('ai');

let pending: Promise<AiSdk> | undefined;

/**
 * Resolves the AI SDK, caching the module promise so repeated calls share one import.
 */
export const loadAiSdk = (): Promise<AiSdk> => {
  if (!pending) {
    pending = import('ai');
  }

  return pending;
};
