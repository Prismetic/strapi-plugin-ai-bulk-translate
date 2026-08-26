# Conventions

Derived during the Phase 0 scaffold. Follow these rather than general preferences; if the codebase
and this file disagree, the codebase wins and this file should be corrected.

## Language and tooling

- TypeScript throughout. Server and admin have separate tsconfigs; both extend Strapi's stock configs
  **unmodified**. Do not add compiler overrides without a demonstrated failure they fix.
- Prettier: single quotes, 100 columns, semicolons, ES5 trailing commas.
- `tsc` never emits JavaScript. Vite/esbuild produce the bundles and `vite-plugin-dts` produces
  declarations. `npm run typecheck` is `--noEmit` only.
- Feedback commands, in order: `npm install`, `npm run typecheck`, `npm test`, `npm run build`.
  All four must pass before any commit.

## The ESM boundary (read before touching the AI SDK)

The AI SDK is ESM-only; the server bundle is CommonJS. Two rules, both load-bearing:

1. **Reach the SDK only through `server/src/services/ai-sdk.ts`**, which uses `await import()` inside
   an async function. Never add a static top-level import of `ai` or `@ai-sdk/*` anywhere.
2. **Never import the SDK from `admin/`.** All model calls are server-side.

A static import compiles, typechecks, and passes review — then throws `ERR_REQUIRE_ESM` when Strapi
loads the plugin. No tsconfig catches it (verified against three module/resolution combinations).
`scripts/assert-esm-boundary.mjs` runs as a postbuild step and is the only thing that does.

## Server

- Directory layout follows Strapi's plugin convention: `config`, `controllers`, `routes`, `services`,
  `content-types`, `policies`, `middlewares`, each with an `index.ts` barrel.
- Controllers are thin: parse and validate input, delegate to a service, shape the response. No
  business logic.
- Services hold the logic. Pure logic goes in its own module with no Strapi imports so it can be
  unit-tested without a bootstrap.
- Plugin-owned database tables are registered as raw models in `register`, so they stay out of the
  Content Manager.
- Never read or write another plugin's tables, particularly `plugin::i18n.ai-localization-job`.
- Read configuration through `strapi.config.get` at call time. No module-level singletons capturing
  `process.env` — that pattern makes configuration untestable and ignores `config/plugins.ts`.

## Admin

- Function components, named exports, hooks for data access.
- `PLUGIN_ID` comes from `admin/src/pluginId.ts`; never hardcode the plugin name.
- All user-facing strings go through `formatMessage` with a `getTranslation('...')` id **and** a
  `defaultMessage`, and are added to `admin/src/translations/en.json`.
- Use `@strapi/design-system` components. Do not hand-roll styling that the design system provides.

## Testing

- Vitest. Test files sit next to their subject as `*.test.ts` / `*.test.tsx`.
- Pure modules (field extractor, chunker, path codec, locale status) are tested directly with no
  Strapi bootstrap. These carry the highest-value tests — schema traversal is where the subtle bugs
  live.
- Prefer red/green: one failing test, make it pass, next. Do not write the whole suite upfront.
- A guard that has never failed is not a guard. Verify assertions by deliberately breaking the thing
  they protect, as `assert-esm-boundary.mjs` was verified.

## Host projects and Node

Two hosts are used for verification, and they are not the same:

| Host | Strapi | Node | Port | `ENCRYPTION_KEY` |
|---|---|---|---|---|
| `R&D/CMS multi-locale` | 5.27.0 | **22** (`engines: >=18 <=22.x`) | 1340 | ✅ set and wired in `config/admin.ts` |
| `ITE/CMS-V5` | 5.49.0 | — | — | ❌ absent from both `.env` and `config/admin` |

Develop credential work against **CMS multi-locale** — it is the host where `admin::encryption` can
actually produce ciphertext. Key length does not matter: the service SHA-256 hashes whatever it is
given, so any non-empty value works and only a missing key causes `encrypt()` to return `null`.

- **Run host projects under Node 22 via nvm**, not the machine default (currently v25). Under Node 25
  the host fails to boot: `better-sqlite3` is compiled for `NODE_MODULE_VERSION 127` and Node 25 wants
  141. Rebuild the native module and you break it for everyone using the supported version — switch
  Node instead.
- The plugin's `peerDependencies` floor is `@strapi/strapi ^5.27.0`, the lower of the two hosts.
  `addBulkAction`, `admin::encryption` and `populate-builder` were all confirmed present at 5.27, so
  nothing in the plan requires a newer floor.
- `@strapi/i18n` at 5.27 has **no** `ai-localizations` service, so the coexistence guard is a no-op on
  that host. Test it against CMS-V5, where the built-in feature exists.
- React is pinned to 18 and react-router-dom to 6 to match both hosts. `@strapi/icons` peers on
  React 18, so React 19 will not install.

## Commits

- Explain the decision, not the diff. Say why, and note anything the next iteration should know.
- Record corrections explicitly when a prior assumption turns out to be wrong.

## Working with the linked host

`yalc push` syncs built files only — it does **not** install the plugin's dependencies into the
host. After adding any dependency to the plugin, run `npm install` in the host as well, or the
plugin will fail at runtime with `Cannot find package '…'` from a dynamic import. That failure
surfaces only when the code path runs, not at build or startup.

To exercise plugin services against a booted Strapi on a TypeScript host, run the probe from the
compiled `dist/` directory with the host's `.env` exported, and copy `package.json` into `dist`
first. `createStrapi()` from the project root reads the `.ts` config files, which plain `node`
cannot load, and boots with no database configured.
