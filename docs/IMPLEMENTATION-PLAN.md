# Strapi AI Translate — Implementation Plan

**Status:** Draft for review · **Date:** 24 August 2026 · **Target:** Strapi v5 (verified against 5.49.0)

A proposed Strapi v5 plugin that translates localized content with an LLM: bulk translation from the
list view, admin-managed provider and model selection, and optional continuous monitoring that
translates on publish.

---

## Summary

| | |
|---|---|
| **What we're building** | A Strapi v5 plugin: bulk AI translation from the Content Manager list view, with multi-provider/multi-model configuration and optional auto-translate on publish. |
| **Why not off-the-shelf** | The existing OSS plugin is single-document and doesn't save. Strapi's own built-in AI localization is hosted-only with no provider or model choice. Details below. |
| **Biggest technical risk** | The AI SDK is ESM-only; the plugin server bundle is CommonJS. **Investigated and resolved** — see [Build](#build-the-esmcjs-question-settled). One tsconfig change is mandatory. |
| **Host prerequisite** | `ENCRYPTION_KEY` must be added to the host Strapi project before API keys can be stored. Not something the plugin can do for itself. |
| **MVP lands at** | Phase 2 of 5. Phases 0–1 are foundation. |
| **Deferred past 1.0** | Continuous monitoring and cost reporting are specified here but built after the initial public release. |

---

## Context

We want a Strapi v5 plugin that translates localized content with an LLM, going beyond what exists in
four ways:

1. **Bulk translation from the list view** — select rows, pick target locales, one button, translations
   **written to the database** rather than filled into a form.
2. **Multi-provider / multi-model** — admins register provider connections and models from the settings
   page, including API keys, then pick which model to translate with.
3. **Continuous monitoring** *(specified now, built after 1.0)* — once enabled for a content type,
   publishing the default locale automatically translates into a per-content-type set of target locales.
4. **Override policy** — off by default. When off, items that already have content in a target locale are
   surfaced individually in the confirmation dialog so the user can opt them in one by one, rather than
   being silently skipped.

### Why not use what already exists

**`strapi-llm-translator`** (the OSS plugin we evaluated) is one-document-at-a-time from the edit view,
posts the whole form payload from the browser, fills form fields without saving, and builds its OpenAI
client once at module load from `process.env`. Its `json-utils.ts` — brace balancing, smart-quote
stripping, and a second LLM call to repair broken JSON — exists purely to work around unconstrained text
output.

**Strapi's built-in AI localization** (`@strapi/i18n` 5.49 ships `ai-localizations`,
`ai-localization-jobs`, `fill-from-locale`) is gated on `strapi.ai.admin.isEnabled()` and calls Strapi's
**hosted** service at `https://strapi-ai.apps.strapi.io` with a Strapi AI token. No BYO key, no provider
or model choice, and it fires only on create/update of the **default locale**. There is no list-view bulk
action anywhere in its admin bundle.

Its architecture is still the right reference: Strapi's own team backed this with a **jobs table plus an
admin polling hook**, which confirms the work cannot ride on a single HTTP request.

### Decisions taken

| Decision | Choice |
|---|---|
| Execution model | Background job + polling |
| Credentials | Managed in the settings page, **encrypted at rest** via `admin::encryption` |
| Providers | Core 5 bundled (`openai`, `azure`, `anthropic`, `google`, `openai-compatible`); the OpenAI-compatible adapter covers Groq, DeepSeek, xAI, Together, Fireworks, Perplexity, Ollama, vLLM |
| Confirmation | **Always** show a dialog before translating — target-locale picker plus a preview of exactly which items go to which locales |
| Existing target locale | Override off by default; conflicting items get a **per-item checkbox** in the dialog to opt in individually |
| Publish state | Translations always written as **draft** |
| Monitoring scope | **Per-content-type opt-in**, collection *and* single types, each with its own target-locale set |
| Monitoring trigger | **Publish** of the default locale |
| Monitoring timing | **Deferred to post-1.0** — specified here, built after the initial public release |
| Codebase | Fresh standalone repo, `@strapi/sdk-plugin` 6.x |
| Surfaces | List-view bulk action (collection types) **and** edit-view document action (collection *and* single types), one shared service |

Package `strapi-plugin-ai-bulk-translate`, plugin id `ai-bulk-translate` — so admin routes sit under
`/ai-bulk-translate/…` and translation keys under `ai-bulk-translate.*`.

### Content-type coverage

| Surface | Collection types | Single types |
|---|---|---|
| List-view bulk action | ✅ | ❌ — single types have no list view |
| Edit-view document action | ✅ | ✅ |
| Monitoring opt-in *(post-1.0)* | ✅ | ✅ |

Single types still carry a `documentId` in v5; the plugin resolves it rather than being handed one.
Strapi's own built-in service treats both kinds — hence its split routes
`/ai-localization-jobs/collection-types/:contentType/:documentId` and
`/ai-localization-jobs/single-types/:contentType`.

---

## Architecture

```
list view ──selection──► modal ──POST /jobs──┐
edit view ──────────────► modal ──POST /jobs─┤
publish(default locale) ─► middleware ───────┴──► job row ──► runner (concurrency-capped)
                                                                    │
                                     per (document × target locale): ▼
             documents.findOne(source) → extract → generateObject → documents.update(target, draft)
```

All three entry points converge on one job row and one translator service.

**The client sends identifiers only:**

```jsonc
{
  "contentType":   "api::article.article",
  "sourceLocale":  "en",
  "targetLocales": ["de", "fr"],
  "documentIds":   ["abc…", "def…"],
  "overwriteDocumentIds": ["abc…"],   // the subset the user ticked in the dialog
  "modelId":       12
}
```

It never sends document content. List-view rows are shaped by the list layout and do not carry nested
component / dynamic-zone data, so the server must load documents itself; this also keeps payloads small
and means the server never trusts client-supplied content.

`overwriteDocumentIds` carries the per-item opt-ins from the confirmation dialog. The server stays
authoritative: for each `(document, locale)` pair it re-checks whether the target locale has content, and
skips unless that document is in `overwriteDocumentIds`. A client that lies can only ever cause a skip it
was already entitled to, never an unauthorised overwrite of an item the user didn't tick.

---

## Data model

Three raw DB models registered in `server/src/register.ts` via `strapi.get('models').add(...)` — the same
mechanism `@strapi/i18n` uses in `models/ai-localization-job.js`, which keeps them out of the Content
Manager. These are **our own tables**; we never read or write `plugin::i18n.ai-localization-job`.

**`ai_translate_providers`** — one row per configured connection
`id`, `type` (`openai` | `azure` | `anthropic` | `google` | `openai-compatible`), `label`, `baseUrl`,
`apiKeyEncrypted`, `config` (json: `resourceName`, `apiVersion`, region, …), `enabled`, timestamps.

**`ai_translate_models`** — one row per model an admin has added under a connection
`id`, `providerId`, `modelId` (e.g. `gpt-4o`), `label`, `enabled`, `isDefault`, timestamps.

**`ai_translate_jobs`** — one row per run
`id`, `origin` (`bulk` | `document` | `monitor`), `contentType`, `sourceLocale`, `targetLocales` (json),
`documentIds` (json), `overwriteDocumentIds` (json), `items` (json:
`[{ documentId, locale, status, skippedReason?, error? }]`), `status`
(`queued` | `processing` | `completed` | `failed`), `modelId`, `createdById`, timestamps.

Storing `overwriteDocumentIds` on the job — rather than only applying it at creation — means the row is a
complete audit record of what the user authorised, which matters when someone asks why a locale got
overwritten.

Singleton settings (system prompt, temperature, default override policy, monitored content types) stay in
the plugin store — but with **server-side validation on write**, which the OSS plugin lacks (it spreads
`ctx.request.body` unchecked).

### Key storage

```ts
const enc = strapi.service('admin::encryption');
apiKeyEncrypted = enc.encrypt(plaintextKey);   // AES-256-GCM
```

Keyed off `admin.secrets.encryptionKey`. Decrypt only inside the provider registry, never in a controller.
The settings API returns a **masked** value (`sk-…4f2a`) and a `hasKey` boolean — never the plaintext,
under any role.

> ### ⚠️ Host prerequisite
>
> `CMS-V5/config/admin.js` currently has no `secrets.encryptionKey` and `.env` has no `ENCRYPTION_KEY`.
> Without it, `admin::encryption` logs a warning and returns `null`. Adding it is a host-project change
> the plugin cannot make for itself. The plugin must detect the missing key at bootstrap and refuse to
> accept credentials with a clear message rather than silently storing nulls.

---

## Server

### Provider catalog & registry — `server/src/services/provider-registry.ts`

A static catalog describes each supported type: package name, credential fields, whether a custom
`baseURL` applies. The settings UI renders its form from this catalog, so adding a provider later is one
catalog entry plus a dependency.

At translation time, build an AI SDK registry from **enabled** connections and resolve one string:

```ts
const registry = createProviderRegistry({ openai: createOpenAI({...}), azure: createAzure({...}), ... });
registry.languageModel(`${connection.type}:${model.modelId}`);
```

Cache the registry in memory, invalidated whenever provider/model settings are written.

### Field extraction — `server/src/services/field-extractor.ts`

Walk schema and data together, returning flat `{ path, value, type }` records. Adapted from the OSS
plugin's `extractTranslatableFields`, with fixes:

- Include `string`, `text`, `richtext`, `blocks`, `json`; recurse into `component` (incl. repeatable) and
  `dynamiczone` via `item.__component`.
- **Skip `uid`, relations and media** — extract-and-reinject, the way Strapi's built-in
  `mergeUnsupportedFields` does. Never send them to the model.
- Skip attributes with `pluginOptions.i18n.localized === false`.
- Resolve component schemas from `strapi.components` server-side, not from a client-supplied map.

### Translator — `server/src/services/translator.ts`

Per document × target locale:

1. **Skip check** — if the target locale already has content and the document is **not** in the job's
   `overwriteDocumentIds`, mark the item `skipped` with `skippedReason: 'exists'` and stop. Re-checked
   server-side at execution time, not trusted from the dialog: content can appear between the user
   opening the dialog and the job running.
2. **Load** with a genuinely deep populate, reusing content-manager's builder rather than hand-rolling:
   ```ts
   const populate = await strapi.plugin('content-manager').service('populate-builder')(uid)
     .populateDeep(Infinity).build();
   const doc = await strapi.documents(uid).findOne({ documentId, locale: sourceLocale, status: 'draft', populate });
   ```
3. **Extract** translatable fields; bail early if none.
4. **Chunk by estimated token count**, not field count. The OSS plugin's `BATCH_SIZE = 10` (marked
   `// TODO` in its source) means one huge richtext field is still a single oversized request.
5. **Translate** with `generateObject` against a zod schema built from the chunk's paths, constraining the
   model to return exactly those keys. This is what makes the JSON-repair stack unnecessary — no brace
   balancing, no repair round-trip.
6. **Reinject** by path into a clone of the source document.
7. **Regenerate UID fields** for the target locale via
   `strapi.service('plugin::content-manager.uid').generateUIDField(...)`, run per locale so slugs derive
   from translated titles.
8. **Write**:
   ```ts
   await strapi.documents(uid).update({ documentId, locale: targetLocale, status: 'draft', data });
   ```
   Verified in `@strapi/core/dist/services/document-service/repository.js:351-368`: when the document
   exists but the target locale entry does not, `update` **creates** it and runs `copyNonLocalizedFields`.
   A true per-locale upsert with shared fields carried across — no create/update branching on our side.

Publishing is never triggered by the plugin.

### Job runner — `server/src/services/job-runner.ts`

In-process queue, concurrency capped from config. Each item is isolated: one document failing records an
error on that item and does not abort the run. The job row updates as items complete so polling shows real
progress. `maxDocumentsPerRun` guarded at creation.

Deliberately no message broker — a single Strapi instance handles this fine, and the job row means a
restart leaves an auditable `processing` record rather than silent loss.

### Continuous monitoring — `server/src/services/monitor.ts` *(post-1.0)*

> **Not built for the initial release.** Specified in full here so the 1.0 architecture doesn't foreclose
> it — the job row already carries `origin: 'monitor'`, and the runner is written to accept jobs from any
> entry point. Shipping the manual path first means the translator, chunker and job runner are proven
> against real content before anything fires automatically. A bug behind a button wastes one run; the same
> bug behind a publish hook bills you for every publish until someone notices.

```ts
strapi.documents.use(async (context, next) => {
  const result = await next();
  if (context.action !== 'publish') return result;
  // ... default-locale check, monitored-content-type check, enqueue
  return result;
});
```

Context shape confirmed as `{ ...ctxDefaults, action, params }` in `middleware-manager.js:30-37`;
`context.contentType.uid` and `context.action` are what `@strapi/i18n` uses. The exact `publish`
params/result shape should be confirmed in the spike.

Guards, in order:

- Content type is in the monitored allowlist (per-content-type opt-in from settings).
- Published locale **is** the default locale (`locales.getDefaultLocale()`).
- **Re-entrancy:** our own writes are *draft updates on non-default locales*, so they structurally cannot
  match a `publish` on the default locale. Add an `AsyncLocalStorage` flag as defence in depth anyway.
- **Coalescing:** one pending `origin: 'monitor'` job per `(contentType, documentId)` — upsert rather than
  append. This is why Strapi's `upsertJobForDocument` exists.
- Enqueue and return immediately; never block the publish request.

**Per-content-type target locales.** Enabling monitoring for a content type is not just an on/off flag —
each entry carries its own target-locale set, so an `api::article.article` can auto-translate into German
and French while `api::legal-page.legal-page` goes to German only. Settings shape:

```jsonc
"monitoring": {
  "api::article.article":       { "enabled": true,  "targetLocales": ["de", "fr"] },
  "api::homepage.homepage":     { "enabled": true,  "targetLocales": ["de"] },      // single type
  "api::legal-page.legal-page": { "enabled": false, "targetLocales": [] }
}
```

Defaults to every non-default locale when a content type is first enabled, then narrowed by the user.
Locales removed from the install are pruned on read, so a deleted locale can't resurrect a job.

**Single types are included.** The allowlist enumerates every localized content type of either kind; for
single types the monitor resolves the `documentId` at trigger time. Coalescing keys on
`(contentType, documentId)` either way, which collapses to one row per single type naturally.

Overwrite behaviour in monitoring mode is a per-content-type setting rather than a dialog — there is no
user present to tick boxes. Default is **overwrite**, on the reasoning that an automatic pipeline exists
to keep locales in lockstep with the source; a content type where translations get hand-edited should not
be monitored in the first place.

**Coexistence guard:** at bootstrap and whenever monitoring is enabled, check
`strapi.plugin('i18n').service('ai-localizations')?.isEnabled?.()` and refuse to enable ours while
Strapi's built-in feature is active — otherwise both fire on default-locale changes, doubling spend and
racing on the same locale rows. Optional-chaining is required; `strapi.ai` does not exist on older 5.x.

### RBAC — `server/src/bootstrap.ts`

Real permissions, not the `policies: []` the OSS plugin leaves open to every authenticated admin.
Pattern from `@strapi/i18n`'s `services/permissions/actions.js`:

```ts
await strapi.service('admin::permission').actionProvider.registerMany([
  { section: 'plugins',  pluginName: 'ai-translate', displayName: 'Translate content', uid: 'translate' },
  { section: 'settings', category: 'AI Translate', pluginName: 'ai-translate',
    displayName: 'Read settings',   uid: 'settings.read' },
  { section: 'settings', category: 'AI Translate', pluginName: 'ai-translate',
    displayName: 'Manage providers and keys', uid: 'settings.update' },
]);
```

Job creation must additionally verify the caller can write the target content type:

```ts
const pc = strapi.plugin('content-manager').service('permission-checker')
  .create({ userAbility: ctx.state.userAbility, model });
if (pc.cannot('plugin::content-manager.explorer.update')) return ctx.forbidden();
```

### Routes — `server/src/routes/admin.ts`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/jobs` | Create a run → `{ jobId }` |
| `GET` | `/jobs/:id` | Poll status + per-item results |
| `GET` | `/locale-status` | `documentId → locale → 'empty' \| 'has-content' \| 'no-source'` matrix for a selection; drives the dialog's preview and conflict list |
| `GET`/`POST`/`PUT`/`DELETE` | `/providers` | Connection CRUD; keys masked on read |
| `POST` | `/providers/:id/test` | Validate credentials with a cheap call |
| `GET`/`POST`/`PUT`/`DELETE` | `/models` | Model CRUD, enable/disable, set default |
| `GET`/`PUT` | `/settings` | Prompt, temperature, override default, monitored content types |

---

## Admin

### `admin/src/index.ts`

```ts
bootstrap(app) {
  const cm = app.getPlugin('content-manager').apis;
  cm.addBulkAction([TranslateBulkAction]);         // list view
  cm.addDocumentAction([TranslateDocumentAction]); // edit view
}
```

Both verified present on `ContentManagerPlugin` in
`@strapi/content-manager/dist/admin/src/content-manager.d.ts`.

### `TranslateBulkAction.tsx`

Receives `{ documents, model, collectionType }` (`BulkActionComponentProps`) and returns a
`BulkActionDescription`:

```ts
{ label, icon: <Magic />, variant: 'secondary',
  disabled: !isLocalized || documents.length === 0,
  dialog: { type: 'modal', title, content: <TranslateModal ... />, footer } }
```

`dialog: { type: 'modal' }` is natively supported — no custom portal needed.

### The confirmation dialog — `TranslateModal.tsx`

**The dialog always appears.** Translation is expensive, irreversible without a revert, and writes to
records the user may not be looking at, so it never fires straight from the button. Both surfaces open
the same component; the edit-view case is simply a one-row list.

It has three stacked regions:

**1. Target locales.** Multi-select from `/i18n/locales`, source locale excluded. Source comes from the
list-view URL query param `plugins[i18n][locale]` (or the current locale in the edit view). Nothing below
renders until at least one target is chosen.

**2. Preview — what will actually happen.** One row per selected item, showing its title (from the
`mainField`, already present in the list-view row data — no server round-trip needed) and one badge per
chosen target locale:

| Badge | Meaning |
|---|---|
| **New** | Locale is empty — will be created |
| **Has content** | Locale already has content — needs an explicit opt-in |
| **No source** | Item has nothing in the source locale — nothing to translate, excluded |

Driven by `GET /locale-status`, which returns a `documentId → locale → state` matrix for the selection.

**3. Conflicts — per-item opt-in.** Any item with a **Has content** badge gets its own checkbox,
**unchecked by default**, labelled with that item's title and the specific locales that would be
overwritten — *"Overwrite German, French for 'Pricing FAQ'"*. Ticking it adds that documentId to
`overwriteDocumentIds`.

This replaces the blanket override toggle from the earlier draft. A single global switch forces an
all-or-nothing choice across a mixed selection, which in practice means either clobbering translations
someone hand-edited or abandoning the run and re-selecting rows. Per-item opt-in lets one dialog express
*"create the twelve empty ones, and also refresh these two specific stale ones"*.

A **Select all conflicts** control sits above the list for the case where the user genuinely does want
everything refreshed — the convenience of the global toggle, without it being the default.

**Footer** states the resolved outcome in words before the button — *"Translating 14 items into 2 locales:
26 new, 2 overwritten, 4 skipped"* — so the consequence is legible without re-reading the table. Submit →
`POST /jobs` → hand `jobId` to the progress component.

If the selection produces no work at all (everything skipped), the submit button is disabled and the
footer says so.

### `TranslateDocumentAction.tsx`

Registered for **both collection and single types** — `addDocumentAction` covers each, and
`EditViewContext.collectionType` distinguishes them. For a single type the plugin resolves the
`documentId` itself via `documents(uid).findFirst({ locale: sourceLocale })` rather than reading it from
the route.

Opens the same `TranslateModal` with a one-row selection, and writes to the target locale rather than
filling the current form — so a translation triggered from the edit view and one triggered from the list
view produce identical results, including the conflict opt-in.

### `useTranslationJob.ts`

RTK Query with `pollingInterval` (~2s), stopping on `completed` / `failed`, then invalidating
content-manager document tags so the list view refreshes its locale column. Mirrors
`useAILocalizationJobsPolling`.

### Settings page — accordions of cards

`@strapi/design-system@2.2.1` ships `Accordion` as a compound component (`Accordion.Root`, `.Item`,
`.Header`, `.Trigger`, `.Actions`, `.Content`) and `Card`. Use both, at different levels:

- **Page sections are `Accordion.Item`s** — *Providers*, *Models*, *Translation*, *Monitoring*. Setting
  this up is a sequential task (add a provider → add a model → tune the prompt → turn on monitoring), and
  an accordion lets an admin keep two sections open at once while cross-referencing. Tabs would hide the
  provider list exactly when you're naming a model under it.
- **Rows inside a section are `Card`s** — one card per provider connection (type badge, masked key,
  Enabled toggle, Test / Edit / Delete) and one per model (parent connection, model id, Enabled, Default
  radio). Cards give each row its own affordances without a table's cramped action column.
- `Accordion.Actions` carries the section-level "Add provider" / "Add model" buttons in the header, so
  they stay reachable while the section is collapsed.
- Default open state: *Providers* expanded when none is configured, otherwise all collapsed — the page
  opens on the next thing that needs doing.

The *Monitoring* section renders the per-content-type toggle list, plus the coexistence warning banner if
Strapi's built-in AI localization is detected as enabled.

---

## Build: the ESM/CJS question, settled

`ai@7.0.77` and every `@ai-sdk/*` are **ESM-only** — `"type": "module"` with no `require` condition in
their `exports` map. Our plugin's server bundle is CommonJS. We traced what `@strapi/sdk-plugin@6.1.1`
actually does, and the outcome is: **this works, but one tsconfig change is mandatory.**

### How the build is configured

From `@strapi/sdk-plugin@6.1.1/dist/vite-config-dJKE9-En.js`:

- **Everything in `dependencies` + `peerDependencies` is externalised** — `getExternals(cwd)` reads
  `package.json` and the ids are marked external twice, once by a `resolveId` plugin and again by
  `rollupOptions.external`. So `ai` and `@ai-sdk/*` are never bundled; they stay bare specifiers resolved
  by Node at runtime.
- `build.lib.formats` is `['es', 'cjs']` → `dist/server/index.mjs` and `dist/server/index.js`.
- `build.target` is `'node20'` for server bundles.
- `rollupOptions.output` sets only `interop: 'auto'` and `exports: 'named'`.

### Does `await import('ai')` survive into the CJS bundle?

**Yes.** Rollup controls the CJS emit, and its `dynamicImportInCjs` option defaults to `true` —
`config.dynamicImportInCjs ?? true` in `rollup@4.62.5/dist/shared/rollup.js`. Vite never overrides it:
grepping all three of Vite 6.4.2's dist chunks (1.5 MB, 340 KB, 236 KB) for `dynamicImportInCjs` returns
**zero** occurrences. With the default in force, Rollup preserves `import()` as a real dynamic import in
CJS output rather than rewriting it to `require()`. Because `ai` is external, there is no chunk to create
either. Strapi `require()`s `dist/server/index.js`, and Node ≥20 (guaranteed by Strapi's `engines`)
supports `import()` from CommonJS.

So the runtime path is sound, provided the import is **inside an async function, never at module top
level**:

```ts
const { generateObject } = await import('ai');
```

### The real problem is TypeScript, not the bundler

`@strapi/typescript-utils/tsconfigs/server` — which `server/tsconfig.json` extends — sets:

```json
{ "module": "CommonJS", "moduleResolution": "Node" }
```

`moduleResolution: "Node"` is node10-style resolution, which **cannot read `exports` maps**. `ai` and
every `@ai-sdk/*` publish their types *only* through `exports["."].types`. So `npm run test:ts:back`
(`tsc -p server/tsconfig.json`) will fail with *"Cannot find module 'ai' or its corresponding type
declarations"* — a concrete failure, not a hypothetical one.

Fix by overriding both options in the plugin's own `server/tsconfig.json`:

```json
{
  "extends": "@strapi/typescript-utils/tsconfigs/server",
  "compilerOptions": { "module": "Preserve", "moduleResolution": "Bundler" }
}
```

Both must change together — TS 5 rejects `module: CommonJS` with `moduleResolution: Bundler`.

This is safe **because tsc never emits JS in this pipeline**: Vite/esbuild produce the JS and
`vite-plugin-dts` emits only declarations. That's also the trap to avoid — if anyone later routes the
build through `tsc` for emit, `module: CommonJS` would downlevel `await import()` into `require()` and
break at runtime with `ERR_REQUIRE_ESM`.

### Two smaller notes

- **Keep `ai` out of the admin bundle.** All model calls are server-side. Importing it from `admin/`
  would pull an ESM-only SDK into the browser bundle for nothing.
- **Don't rely on Node's `require(esm)`.** Node 20.19+/22.12+ can `require()` ESM, but `ai`'s exports map
  has no `require` condition, so that path is unreliable across versions. Dynamic import is the contract.

### Fallback

If any of the above shifts in a future toolchain version, `new Function('s', 'return import(s)')('ai')`
is opaque to every bundler and cannot be rewritten.

### Spike acceptance checks

```bash
npm run build
grep -c "import(" dist/server/index.js          # expect >= 1
grep -c 'require("ai")' dist/server/index.js    # expect 0
npm run test:ts:back                            # expect clean
```

Then a throwaway route inside a running Strapi that calls `generateText` once against a live key —
static analysis can't prove Node resolves the external at runtime.

---

## Phasing

| Phase | Scope | Notes |
|---|---|---|
| **0 — Spike** | Scaffold with `@strapi/sdk-plugin` 6.x, link into the host project via yalc, run the acceptance checks above. Confirm `admin::encryption` works once `ENCRYPTION_KEY` is added. | *This is where the risk is.* |
| **1 — Provider & model management** | Three DB models, encrypted key storage, provider catalog and registry, settings page Providers + Models sections, Test-connection endpoint, RBAC actions. | Everything downstream depends on being able to resolve a model. Larger than it looks — a settings app before a word gets translated. |
| **2 — Translation core + bulk action** | Field extractor, chunker, translator, job runner, job routes, list-view bulk action, the confirmation dialog with preview and per-item conflict opt-in, polling progress. | **MVP** — the point at which the plugin is genuinely useful. |
| **3 — Edit-view document action** | Same dialog, one-row selection. Collection *and* single types. | Thin reuse of Phase 2's service. |
| **4 — Hardening** | Unit tests for extractor, chunker and the locale-status matrix; retry of failed items; docs; README. | Ships as **1.0**. |

### After the initial public release

| Phase | Scope | Notes |
|---|---|---|
| **5 — Continuous monitoring** | Publish middleware, per-content-type opt-in with its own target-locale set, single-type support, coalescing, re-entrancy guard, coexistence guard, Monitoring settings section. | Specified in full above. Held back deliberately — a bug behind a button wastes one run; behind a publish hook it bills on every publish. |
| **6 — Cost & usage reporting** | Per-job token and cost accounting, aggregated per content type and provider. | Needs a pricing table per model. |

---

## Verification

- **Build/link**: `npm run build`, `npx yalc push`, restart the host Strapi. Plugin loads; bootstrap
  reports whether `ENCRYPTION_KEY` is present.
- **Keys**: add an OpenAI connection via settings; confirm the DB column holds `v1:…` ciphertext, the API
  returns only a masked value, and Test-connection succeeds. Confirm no role can read plaintext.
- **Bulk path**: open a localized collection in `en`, select several rows, translate to `de` + `fr` with
  override off. Expect a row in `ai_translate_jobs`, progress advancing, and new locales in the list
  view's locale column on refresh.
- **Dialog preview**: select a mix of items — one with an empty `de`, one with populated `de`, one with
  nothing in the source locale. Confirm the three badge states render correctly and the footer count
  matches the table.
- **Per-item opt-in**: leave all conflict checkboxes unticked → conflicting items come back `skipped`
  with `skippedReason: 'exists'`, the rest are created. Tick exactly one → only that item is overwritten,
  and `overwriteDocumentIds` on the job row records precisely that one id.
- **Race on the conflict check**: open the dialog, populate the target locale in a second tab, then
  submit without ticking. The item must be skipped — the server re-checks rather than trusting the
  dialog's snapshot.
- **Empty work set**: select items whose target locales are all populated and tick nothing — submit
  disabled, footer explains why.
- **Upsert**: confirm non-localized fields were carried onto a newly created locale.
- **Draft safety**: every translated entry has `publishedAt = null`; the published source locale is
  unchanged.
- **Nested content**: a content type with a repeatable component and a dynamic zone — nested text
  translated, media and relations inside them untouched.
- **UID**: the `de` slug derives from the translated title, not copied from `en`.
- **RBAC**: an editor lacking `translate` gets 403 from `POST /jobs` and no bulk action in the UI.
- **Failure isolation**: break a key mid-run; one item fails, the rest complete, error surfaced per item.
- **Single types**: run the edit-view action on a localized single type and confirm the target locale is
  written; confirm no bulk action appears anywhere for single types, since they have no list view.
- **Monitoring** *(post-1.0)*: enable for one content type, publish a default-locale change, confirm
  exactly one `origin: 'monitor'` job appears and only the configured target locales fill — not every
  locale. Publish a *non*-default locale and confirm nothing triggers. Publish twice rapidly and confirm
  the jobs coalesce rather than duplicating.
- **Coexistence** *(post-1.0)*: with Strapi's built-in AI localization enabled, confirm our monitoring
  refuses to enable and explains why.
- **Unit tests** for extractor and chunker — pure functions, no Strapi bootstrap. This is where the subtle
  bugs live.

---

## Open items for reviewers

1. ~~**Repo name and location.**~~ **Settled** — `strapi-plugin-ai-bulk-translate`, plugin id
   `ai-bulk-translate`, at `github.com/Prismetic/strapi-plugin-ai-bulk-translate` (internal). The two
   obvious npm names, `strapi-plugin-ai-translate` and `strapi-plugin-ai-translator`, were already taken;
   the latter is an active plugin tied to the l10n.dev hosted service.
2. ~~**Single-type support.**~~ **Settled** — edit-view action and monitoring opt-in cover single types;
   the bulk action necessarily does not. See *Content-type coverage* above.
3. **`ENCRYPTION_KEY` on host projects.** Needs adding to `config/admin.js` and `.env` on every Strapi
   instance that runs the plugin. Who owns that change per environment?
4. **Phase 1 sequencing.** Phase 1 is a full settings app before any translation happens. A viable
   reshuffle is to ship Phase 2 first against a single env-configured provider, then retrofit Phase 1's
   UI — at the cost of writing the config layer twice. Worth a decision if time-to-first-demo matters.
5. **Provider roster.** Core 5 bundled; the long tail is reachable through the OpenAI-compatible adapter.
   Flag now if any provider needs its native adapter (Bedrock and Vertex are the two whose auth doesn't
   fit the OpenAI-compatible shape).

---

### Appendix: versions this plan was verified against

| Package | Version |
|---|---|
| `@strapi/strapi` | 5.49.0 |
| `@strapi/sdk-plugin` | 6.1.1 |
| `@strapi/design-system` | 2.2.1 |
| `ai` | 7.0.77 |
| `@ai-sdk/openai` | 4.0.46 |
| `@ai-sdk/azure` | 4.0.48 |
| `@ai-sdk/anthropic` | 4.0.41 |
| `@ai-sdk/google` | 4.0.50 |
| `@ai-sdk/openai-compatible` | 3.0.35 |
| `rollup` (via Vite) | 4.62.5 |
| `vite` (via sdk-plugin) | 6.4.2 |
