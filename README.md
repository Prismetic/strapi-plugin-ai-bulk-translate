# AI Bulk Translate for Strapi 5

Translate content into your other locales in bulk, using the LLM provider of your choice, with
providers and models managed from the admin panel rather than baked into a deploy.

Translations are written as **drafts**, never published. Nothing goes live because a machine decided
it should.

**What you get**

- **AI Translate** on any localized entry, and as a bulk action on a list of them.
- A preview of what a run will create, replace and skip, before it spends anything.
- **Monitoring**: translate an entry automatically each time its default locale is published.
- A **Jobs** tab recording every run — what it translated, what it skipped and why, what failed.
- Providers, models, prompt and temperature managed from the admin, with API keys encrypted at rest.
- OpenAI, Azure OpenAI, Anthropic, Google Gemini, and any OpenAI-compatible endpoint, including
  local models.

## Contents

- [Requirements](#requirements)
- [Installation](#installation) — four steps, **in this order**
- [Your first translation](#your-first-translation)
- [Configuring a provider](#configuring-a-provider)
- [Registering a model](#registering-a-model)
- [Permissions](#permissions)
- [Running a translation](#running-a-translation)
- [Monitoring](#monitoring)
- [Jobs](#jobs)
- [Translation settings](#translation-settings)
- [Configuration options](#configuration-options)
- [What gets translated](#what-gets-translated)
- [What this plugin deliberately does not do](#what-this-plugin-deliberately-does-not-do)
- [Troubleshooting](#troubleshooting)
- [Releasing](#releasing) — maintainers only

---

## Requirements

| | |
|---|---|
| Strapi | 5.27 or later |
| Node | 22 or 24. Node 24 needs Strapi 5.31 or later |
| Plugins | **Internationalization (i18n)** must be enabled, with at least two locales |
| Host | **An admin encryption key, set before the first start** — [step 2](#2-set-the-encryption-key) of the installation |

The i18n plugin is not optional: this plugin reads your locale list from it and writes through
Strapi's document service in a target locale. Without i18n there is nothing to translate into.

**Why not any Strapi 5?** API keys are stored with Strapi's admin encryption service, which does
not exist before 5.13 — on an earlier release no provider could be saved. 5.27 is the oldest
version the plugin is tested against.

**Why not Node 20?** The AI SDK the plugin is built on requires Node 22 or later, and Node 20 has
reached end of life.

---

## Installation

Four steps. The order matters: **the encryption key comes before the first start**, because without
it the plugin loads, looks fine, and then cannot save a single provider.

### 1. Install the package

```bash
npm install @prismetic/strapi-plugin-ai-bulk-translate
```

### 2. Set the encryption key

Provider API keys are encrypted before they are stored, with Strapi's own admin encryption service.
That service needs a key from the host, and the plugin refuses to store credentials without one.

Add a long random value to your `.env`:

```bash
ENCRYPTION_KEY=<a long random string>
```

`openssl rand -base64 32` produces a suitable one.

Then pass it to Strapi in `config/admin.ts` (or `config/admin.js`), alongside whatever is already
there:

```ts
export default ({ env }) => ({
  // ...your existing admin configuration
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
});
```

Both halves are needed — a value in `.env` that `config/admin` never reads does nothing. A project
created with a recent Strapi may already have both; one upgraded from an older version usually has
neither. Check before adding a second key.

> **Set this on every environment, and treat it like a database password.** The key's length does
> not matter — it is SHA-256 hashed — but **changing it does**: credentials stored under the old key
> become unreadable and have to be entered again. The same applies to a database copied to an
> environment with a different key.

### 3. Enable the plugin

In `config/plugins.ts`:

```ts
export default () => ({
  'ai-bulk-translate': {
    enabled: true,
  },
});
```

In a JavaScript project the file is `config/plugins.js` and the first line is
`module.exports = () => ({`. The same holds for every configuration example in this document.

### 4. Build and start

```bash
npm run build && npm run develop
```

### Check that it worked

- **AI Bulk Translate** appears in the main navigation.
- The startup log does **not** contain
  `[ai-bulk-translate] No admin encryption key configured`.
- Opening **AI Bulk Translate → Settings → Providers** shows no *"API keys cannot be stored"*
  banner.

If either warning is there, go back to [step 2](#2-set-the-encryption-key), then restart. Nothing
has been lost: the plugin stores nothing until a key exists.

### Why the plugin insists on the key

Strapi's encryption service derives its AES-256-GCM key from `admin.secrets.encryptionKey`. If that
is absent it returns `null` instead of a cipher — and a plugin that shrugged at `null` would
silently store credentials that are neither encrypted nor recoverable. So the plugin refuses: it
warns at startup, the Providers section shows a banner, and saving a key fails with a message rather
than appearing to work.

---

## Your first translation

Once the plugin is installed, the shortest path from nothing to a translated draft:

1. **Add a provider** — *AI Bulk Translate → Settings → Providers → Add provider*. Use **Test
   connection** before moving on. [Details](#configuring-a-provider)
2. **Register a model** under it — *Models → Register model*. The first model you register becomes
   the default. [Details](#registering-a-model)
3. **Grant permissions**, unless you are a super admin: `Translate content`, plus Content Manager
   *update* on each content type to be translated. [Details](#permissions)
4. **Open an entry** of a localized content type, in the locale you want to translate *from*, and
   press **AI Translate**. [Details](#running-a-translation)
5. **Review the draft** in the target locale, then publish it yourself.

If the content links to other entries — a page that lists articles, say — translate the linked
entries first. [Why](#links-to-other-entries)

---

## Configuring a provider

**AI Bulk Translate → Settings → Providers → Add provider.** The plugin has its own entry in the
main navigation; it is not under Strapi's *Settings*.

A provider is a connection: an endpoint plus, usually, a key. Five types are supported.

| Type | API key | Base URL | Notes |
|---|---|---|---|
| **OpenAI** | required | optional | Empty means `api.openai.com`. Set it to point at a proxy. |
| **Azure OpenAI** | required | **required** | e.g. `https://<resource>.services.ai.azure.com/openai/v1` |
| **Anthropic** | required | optional | Empty means `api.anthropic.com`. |
| **Google Gemini** | required | optional | Empty means the default Generative Language endpoint. |
| **OpenAI-compatible** | *not* required | **required** | Any OpenAI-shaped endpoint: Ollama, vLLM, LM Studio, a self-hosted gateway. |

Once saved, a key is never shown again — only a mask like `sk-proj-…9f2a`, enough to recognise it
and useless to anyone who reads it. Leaving the key field untouched on edit keeps the stored key;
submitting it empty clears it.

**Test connection** on each provider card makes one real request with a model id you supply, and
reports what came back. It is the fastest way to tell a wrong key from a wrong URL.

### Azure and the `/v1` segment

`@ai-sdk/azure` appends `/v1` only when it recognises the host as a classic Azure OpenAI one.
Against the newer AI Foundry domain (`*.services.ai.azure.com`) it treats the URL as a custom
gateway, appends nothing, and produces a 404. The plugin therefore ensures the `/v1` segment itself,
which is correct for both domains — so you can enter the URL with or without it.

### Self-hosted and local models

Choose **OpenAI-compatible** and give the full base URL including any version segment. For Ollama
that is `http://localhost:11434/v1`. No API key is needed; the optional *Provider name* field is
used only in logging and error messages.

---

## Registering a model

**AI Bulk Translate → Settings → Models → Register model.**

A provider is *where* to send requests; a model is *what to ask for*. Register one per model you
want editors to be able to pick.

- **Connection** — only enabled connections that could actually authenticate are listed.
- **Model identifier** — exactly as the provider names it. For Azure this is the **deployment
  name**, not the model name.
- **Name** — what editors see in the picker.
- **Use as the default model** — the one used when an editor makes no explicit choice.

The first model you register becomes the default automatically. Keep one: without a default, a run
that makes no explicit choice — every [monitored](#monitoring) run, for one — fails with *"No usable
model is configured."* The default is protected for that reason: to disable or delete it, make
another model the default first.

Disabling a connection cascades: its models cannot be called, so they are disabled too, and they
disappear from the editor's picker rather than offering a run that would fail at its first request.

---

## Permissions

The plugin adds three permissions, in Strapi's **Settings → Roles → *[role]***:

| Permission | Tab | Grants |
|---|---|---|
| `Translate content` | Plugins | Triggering translation runs — this spends API credit |
| `Read settings` | Settings | Seeing which providers and models exist, and what is monitored |
| `Manage providers and keys` | Settings | Adding, changing and removing them, **including API keys**; changing translation settings and monitoring |

Read and manage are separate on purpose: someone who needs to pick a model for a run has no business
replacing the organisation's credentials.

### What a translator actually needs

`Translate content` **is not enough on its own.** It does not grant the right to write any particular
content type. Job creation separately checks the caller against the Content Manager's own *update*
permission for the target type, using the Content Manager's own checker.

So an editor who should translate `Page` needs **both**:

1. `Translate content` (Plugins tab), **and**
2. Content Manager → `Page` → **update**

Without the second, the run is refused with *"You do not have permission to update
`api::page.page`."* This is deliberate: a plugin permission that granted write access to every
content type would be a way *around* content permissions rather than an addition to them.

> Verify permissions with a second, non-super-admin account. A super admin bypasses every check, so
> testing as one proves nothing. Permission changes need a hard browser refresh.

---

## Running a translation

Two entry points, both opening the same dialog:

- **Edit view** — the **AI Translate** button in the right-hand panel, below Publish and Save. On
  collection types and single types alike.
- **List view** — select entries, then **AI Translate** in the bulk actions bar. Collection types
  only, since a single type has no list.

The dialog asks, in order:

**1. Which locales to translate into.** Your source locale is the one you are currently viewing.
The project's **default locale is never offered as a target**: it is the source of truth, and a
machine does not get to overwrite it.

**2. Which model.** Enabled models only, with the default preselected and marked. Pick a cheaper
model for a bulk backfill and a stronger one for pages that matter. The choice is recorded on the
job, so the history shows which model produced the text.

**3. What will happen.** Each selected entry gets a badge per target locale:

| Badge | Meaning | What the run does |
|---|---|---|
| `fr · new` (green) | Nothing in that locale yet | **Translates it** |
| `fr · has content` (amber) | A translation already exists | **Leaves it alone**, unless you opt in |
| `fr · no source` (grey) | Nothing in the *source* locale to translate | **Skips the entry** |

**4. Which existing translations to replace.** Every amber entry is listed with an unticked
checkbox. **Nothing is overwritten unless you tick it.** Ticking an entry authorises replacing its
existing content in the locales you chose. There is a select-all, but it is opt-in, never the
default — an accidental bulk run should cost you nothing but tokens.

**5. The outcome, in words**, above the confirm button: how many locales will be created, how many
replaced, how many skipped. The button is disabled when there is no work to do.

Results appear per entry as the run proceeds, with a link to view each translated locale. Failed
items can be retried without repeating the ones that succeeded.

**A run cannot be stopped once started.** Closing the dialog does not cancel it — the button says
*Close*, not *Cancel*, for that reason — and the run carries on and is recorded under
[Jobs](#jobs). What bounds a mistaken run is `maxDocumentsPerRun`.

### Links to other entries

A translated item can come back with a notice:

> Links to 3 entries with no zh-CN version were left out: Article (2), Sector (1). Translate them to
> link them from zh-CN.

The translation **succeeded**; some links were not carried across. Strapi only lets a localized
entry link to another localized entry's version *in the same locale*, so a `zh-CN` page cannot link
to an article that exists only in `en`.

To avoid it, **translate the entries being linked to first** — articles before the page that lists
them. To repair it afterwards, translate the entries the notice names, then either add the links in
the target locale by hand, or translate the page again with overwrite ticked.

Links to content types that are not localized are unaffected, as is media.

---

## Monitoring

**AI Bulk Translate → Settings → Monitoring.**

Monitoring translates an entry automatically when it is published, so translations keep up with
the source without anyone remembering to run them. It is **off for every content type** until
switched on, and a content type added to the project later does not arrive switched on.

For each localized content type, choose the locales to translate into. Then, per locale:

| Option | Off (the default) | On |
|---|---|---|
| **Overwrite content** | A locale that already has content is left alone | An existing translation is replaced |
| **Overwrite manual edits** | A translation somebody has edited by hand since the plugin wrote it is left alone | It is replaced anyway |

*Overwrite manual edits* is only available with *Overwrite content*. With both off, monitoring only
ever fills in locales that are empty.

How it behaves:

- **Only publishing the default locale triggers it.** Saving a draft does not, and publishing a
  translation does not — which is also why monitoring cannot trigger itself.
- **Only the entry published is translated**, not the entries it links to.
- **Results are drafts**, as always. Publishing the source does not publish its translations.
- **It uses the default model.** There is nobody to ask.
- **Republishing unchanged text costs nothing.** If no translatable text has changed since the last
  run, no model is called and the run is recorded as skipped.
- **It cannot break publishing.** A failure to start a run is logged, and the publish goes through
  regardless.

Monitored runs appear under [Jobs](#jobs) with *Monitoring* in the **From** column.

---

## Jobs

**AI Bulk Translate → Jobs.**

Every run is recorded here, whoever or whatever started it: from an entry, from a bulk action, or
by monitoring.

By default the list shows what needs attention — runs that are queued, in progress, or failed.
**Show completed** and **Show skipped** add the rest.

A run's badge is green only when every item in it was translated. Anything failed turns it red;
anything skipped, amber. Expand a run to see each entry and locale, with the reason beside anything
skipped or failed, any notice about [links left out](#links-to-other-entries), and **Retry** for
failed items.

Finished runs are kept for 30 days, configurable as `jobRetentionDays`. Runs still queued or in
progress are never discarded.

---

## Translation settings

**AI Bulk Translate → Settings → Translation.**

| Setting | Default | Notes |
|---|---|---|
| **System prompt** | A translator brief — preserve formatting, don't translate brand names or URLs, no commentary | Sent as the system message on every request |
| **Temperature** | `0.2` | Between 0 and 2. Low keeps translations faithful; higher makes the model freer, which for translation usually means less accurate |

Changes apply to the **next** run; a run already in progress is unaffected.

Out-of-range values are **rejected, not clamped** — if you enter `5`, you get a refusal, not a silent
correction to `2`. **Restore defaults** returns both to whatever your `config/plugins.ts` specifies,
or to the shipped values if you have not configured them.

---

## Configuration options

All optional, all set under `'ai-bulk-translate'` in `config/plugins.ts`:

```ts
export default () => ({
  'ai-bulk-translate': {
    enabled: true,
    config: {
      temperature: 0.2,
      maxTokensPerRequest: 3000,
      maxDocumentsPerRun: 100,
      maxConcurrency: 3,
      jobRetentionDays: 30,
    },
  },
});
```

| Option | Default | What it does |
|---|---|---|
| `systemPrompt` | *(the shipped translator brief)* | Steers tone and formatting rules. Editable from the settings page, which overrides this. |
| `temperature` | `0.2` | Must be 0–2. Also editable from the settings page. |
| `maxTokensPerRequest` | `3000` | Ceiling for one model request, in estimated tokens. Long fields are split across requests and rejoined. Minimum 100. |
| `maxDocumentsPerRun` | `100` | Ceiling on entries per run, so a mis-click cannot trigger an enormous bill. Enforced server-side. |
| `maxConcurrency` | `3` | Concurrent model requests within a run. Raise it if your provider's rate limits allow. |
| `jobRetentionDays` | `30` | How long finished runs are kept before a nightly task discards them. Runs still queued or processing are never removed, whatever this is set to. |

The settings page takes precedence over `systemPrompt` and `temperature` once an administrator saves
them; *Restore defaults* clears that override and hands control back to this file.

---

## What gets translated

**Translated:** `string`, `text`, `richtext`, and the prose inside `blocks` and `json` fields —
including inside components, repeatable components and dynamic zones, at any depth.

**Carried across untouched:** everything else. When a locale is created, every per-locale field
the source has — images, numbers, dates, switches, links — goes with it, as Strapi's own "fill in
from another locale" would. When the locale already exists, only its empty fields are filled in;
a value an editor set there is kept. Fields shared across locales are left to Strapi, which copies
them itself.

Three exclusions are absolute, at every depth:

- **Media** — images are re-linked, never re-uploaded or detached.
- **Relations** — links between entries survive intact, with one exception Strapi imposes: a link
  to a localized entry can only be made to that entry's version in the same locale. Where the
  linked entry has no version in the target locale yet, the link is left out of the translation
  and the run says so, naming the content types involved — see
  [Links to other entries](#links-to-other-entries). The source locale is never changed.
- **Identifier fields (`uid`)** — a slug derived from another field is *regenerated* from the
  translated title rather than translated as prose, so URLs stay well-formed. A free-standing `uid`
  with no target field is left alone, because inventing a new value would change a URL nobody asked
  to change.

None of the three is ever sent to a model — which also means a populated document's `createdBy`,
password hash and all, cannot leak into a request.

### Which fields count as localized

Two rules, and they are deliberately different — this matches how i18n itself behaves.

**On the content type**, a field is translated only when it is *explicitly* marked localized. A
field with no flag is **not** localized. That is the opposite of the intuitive reading, and it
matters: Strapi shares non-localized fields across every locale, so translating one would overwrite
all of them at once.

**Inside a component**, a field is translated unless it is explicitly marked `localized: false`.
i18n never consults these flags — whether a component's contents are per-locale is decided entirely
by the content-type attribute holding it — and in practice almost no component attribute carries a
flag at all. Requiring one would silently skip nearly every nested field.

So: if a field you expected to be translated was not, check that its attribute on the **content
type** has localization enabled.

---

## What this plugin deliberately does not do

- **It does not publish.** Every translation is written as a **draft**, for a human to review. There
  is no setting to change this.
- **It does not translate media.** Alt text stored on the media library entry itself is not touched;
  images are re-linked as they are.
- **It does not translate relations.** Linked entries are left alone — translate them on their own
  terms, and [before the entries that link to them](#links-to-other-entries).
- **It does not translate into the default locale.** Not even to repair a bad default-locale entry
  from a good translation.
- **It does not watch drafts.** [Monitoring](#monitoring) reacts to a publish of the default locale
  and to nothing else. Every other run is started by a person.
- **It does not stop a run in progress.** See `maxDocumentsPerRun`.
- **It does not review quality.** The model's output is stored as returned. Treat the result as a
  first draft, not a finished translation.

---

## Troubleshooting

**"API keys cannot be stored" banner**, or `No admin encryption key configured` in the startup
log. The host has no admin encryption key, or has one in `.env` that `config/admin` does not read.
See [step 2 of the installation](#2-set-the-encryption-key), then restart.

**AI Bulk Translate is missing from the navigation, or AI Translate from an entry.** The admin
panel was not rebuilt after installing. Run `npm run build`, restart, and hard-refresh the browser.
If only the button is missing: the content type must have localization enabled, and the entry
must have been saved at least once. Otherwise see *"The translate action is missing"* below.

**A key shows as `••••(unreadable — encryption key may have changed)`.** `ENCRYPTION_KEY` was
changed or lost after the credential was stored. The stored value cannot be recovered — re-enter the
key on that provider.

**"Missing or invalid credentials" above the API key field.** Despite where it appears, this is
Strapi reporting an expired admin session, not the provider rejecting a key. Sign in again before
re-checking the key.

**"No usable model is configured."** No model is both enabled and marked default under an enabled
connection. Register one, or mark an existing one as default.

**"You do not have permission to update …"** The role holds `Translate content` but lacks Content
Manager *update* on that content type. Both are required — see [Permissions](#permissions).

**"Policy Failed" on the settings page.** The role holds `Read settings` but not `Manage providers
and keys`.

**The translate action is missing.** The role lacks `Translate content`. Grant it, then hard-refresh
the browser — permission changes are cached in the admin panel.

**`Document with id "…", locale "…" not found`.** Version 1.0.0 only. The entry links to another
localized entry that has no version in the target locale, and the whole translation fails. From
1.1.0 the link is left out and the run says so — upgrade, or translate the linked entry first. See
[Links to other entries](#links-to-other-entries).

**A translation succeeded but links are missing in the target locale.** Expected where the linked
entries have not been translated; the item's notice names them. See
[Links to other entries](#links-to-other-entries).

**A translated entry has no image, no priority order, or a wrong date.** Versions up to 1.1.0
sent only the translated text, and left localized fields of other types empty in a new locale.
From 1.2.0 they are carried across. To repair an entry translated earlier, run the translation
again with overwrite ticked: only what is missing or still at its schema default is filled in.

**The dialog shows "What will happen" with nothing under it.** Version 1.1.0 and earlier, on a
single type. Upgrade.

**A monitored entry was published and nothing was translated.** Look under [Jobs](#jobs) with
*Show skipped* on. A skipped run means nothing translatable changed, or the target already has
content and is not set to be overwritten. No run at all means the publish was not of the default
locale, or the content type is not monitored.

**A field was not translated.** Its attribute on the content type is not marked localized. See
[Which fields count as localized](#which-fields-count-as-localized).

**Azure returns 404.** Check the base URL points at your resource's `/openai` path. The plugin adds
the `/v1` segment for you; a URL ending in `/openai/deployments/...` is too specific.

**"This run covers N entries, above the limit of 100."** Select fewer entries, or raise
`maxDocumentsPerRun`.

---

## Releasing

For maintainers, not for using the plugin: [docs/RELEASING.md](docs/RELEASING.md) covers how a
change in `main` becomes a version on npm.

---

## License

MIT
