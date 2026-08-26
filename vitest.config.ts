import { defineConfig } from 'vitest/config';

/**
 * `@strapi/design-system` and `@strapi/ui-primitives` are mispackaged: they declare
 * `"type": "module"`, point `main` at a CommonJS bundle, name the ESM build only in `module`, and
 * publish **no `exports` map**. Node's resolver therefore takes `main`, parses that CommonJS file as
 * ESM, and dies on `exports is not defined`.
 *
 * Two levers are needed together, and neither works alone:
 *
 * - **alias** each to the ESM build its own `module` field names, so resolution finds real ESM;
 * - **inline** them, because that ESM build imports named exports from CommonJS `lodash`, which Node
 *   cannot do and Vite can — but only for modules it processes rather than externalises.
 *
 * `@strapi/icons` is deliberately *not* aliased. It has the same `type`/`main` shape but does ship an
 * `exports` map, so it resolves correctly on its own; aliasing it past that map breaks it with
 * `Missing "./dist/index.mjs" specifier`.
 *
 * Tests only. The real admin bundle is built by Strapi's own Vite plugin, which resolves all of these
 * correctly.
 */
const MISPACKAGED = ['design-system', 'ui-primitives'];

export default defineConfig({
  resolve: {
    alias: MISPACKAGED.map((name) => ({
      find: new RegExp(`^@strapi/${name}$`),
      replacement: `@strapi/${name}/dist/index.mjs`,
    })),
  },
  test: {
    // Deep modules (field extractor, chunker, path codec, locale status) are pure and run in node.
    // Component tests opt into jsdom with a `@vitest-environment jsdom` docblock, so the fast
    // majority is not slowed down by a DOM none of it touches.
    environment: 'node',
    include: ['server/src/**/*.test.ts', 'admin/src/**/*.test.{ts,tsx}'],
    server: {
      deps: {
        inline: MISPACKAGED.map((name) => `@strapi/${name}`),
      },
    },
  },
});
