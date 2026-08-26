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

**Probes must be CommonJS.** The host's `@strapi/core` ESM entry fails Node's resolver with
`ERR_UNSUPPORTED_DIR_IMPORT` on `lodash/fp`, so `import { createStrapi }` cannot be used. Use
`require`.

### Probes that touch content

Learned the hard way, after a probe silently added a locale to the host's real footer:

- **`documents(uid).findOne({ locale })` without a `documentId` always returns null**, including for
  single types. It is not a way to ask "does this single type have content" — it will answer "no"
  about a document that exists. Inspect with `db.query(uid).findMany({})`, which is the only
  reliable view.
- **`documents(uid).create()` on a single type adds another document** rather than reusing the
  existing one. Nothing at the document-service level enforces one row per single type.
- Every localized single type on `CMS multi-locale` holds real `en` content. There is no empty one
  to borrow.
- So: **snapshot the rows first, and assert the table is byte-identical afterwards.** Deleting a
  single locale with `documents(uid).delete({ documentId, locale })` removes only that row and
  leaves the other locales' drafts and published versions untouched — verified.
- Prefer creating a throwaway document over touching real content, but check with `db.query` that
  it is genuinely throwaway.

## AI SDK version conflicts with the host

**Strapi depends on the AI SDK itself** — `@strapi/content-type-builder` pulls in `ai` (5.0.26 on
Strapi 5.27). A host therefore already has a copy of `ai`, and it may be hoisted above ours.

The plugin's adapters and the core `ai` package must be the same generation: `ai@5` pairs with
`@ai-sdk/*@2.x` (provider spec v2), `ai@7` pairs with `@ai-sdk/*@4.x` (spec v4). Cross them and every
model call fails with an unhelpful message about "specification version".

A **real npm install nests correctly** — verified by packing the plugin and installing it into a
project that already had `ai@5.0.26`: npm placed `ai@7.0.79` under the plugin and left `ai@5.0.26`
hoisted for Strapi. Published installs are not affected.

**A yalc-linked checkout is affected**, because yalc copies only `dist/` and npm dedupes to the
host's copy instead of nesting. After `yalc add`/`yalc push`, run once:

```
cd <host>/node_modules/strapi-plugin-ai-bulk-translate && npm install --omit=dev --no-package-lock
```

The nested tree survives later `yalc push` calls, so this is a one-time step per host.

`GET /ai-bulk-translate/health` reports the resolved `ai` version and adapter versions, which is the
fastest way to confirm they match. `testConnection` also detects the mismatch and returns an
actionable message rather than passing the SDK's raw error through.

## Writing host probes

Two traps, both found the hard way:

**Probes must be CommonJS.** `@strapi/core`'s `.mjs` entry fails Node's ESM resolver with
`ERR_UNSUPPORTED_DIR_IMPORT` on `lodash/fp`, so a probe cannot `import` Strapi. Write `.cjs`.

**Never `import('ai')` directly in a probe.** Module resolution starts from the probe's own location,
so a probe living in the host resolves Strapi's hoisted `ai@5` while plugin services resolve the
plugin's nested `ai@7`. Mixing them produces the same "specification version" error as a broken
install, but the plugin is fine — only the probe is wrong. Drive everything through plugin services
(`provider-registry`, `model-store`), which resolve the SDK from the plugin's own position.

A probe that fails partway leaves rows behind. Clean up defensively at the start of the next run
rather than trusting the previous one reached its teardown.
