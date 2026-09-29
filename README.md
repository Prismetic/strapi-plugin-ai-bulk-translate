# AI Bulk Translate for Strapi 5

Translate content into your other locales in bulk, using the LLM provider of your choice, with
providers and models managed from the admin panel rather than baked into a deploy.

Translations are written as **drafts**, never published. Nothing goes live because a machine decided
it should.

---

## Requirements

| | |
|---|---|
| Strapi | 5.27 or later |
| Node | 20–22 — this plugin requires ≥ 20, and Strapi 5 hosts cap at 22 |
| Plugins | **Internationalization (i18n)** must be enabled, with at least two locales |
| Host | An admin encryption key — see [below](#the-encryption-key-prerequisite) |

The i18n plugin is not optional: this plugin reads your locale list from it and writes through
Strapi's document service in a target locale. Without i18n there is nothing to translate into.

---

## Installation

```bash
npm install strapi-plugin-ai-bulk-translate
```

Enable it in `config/plugins.ts`:

```ts
export default () => ({
  'ai-bulk-translate': {
    enabled: true,
  },
});
```

Rebuild the admin panel and restart:

```bash
npm run build && npm run develop
```

### The encryption key prerequisite

**Set this before you start, or you will not be able to save a provider.**

Provider API keys are secrets, so the plugin encrypts them before they touch the database, using
Strapi's own admin encryption service. That service derives its AES-256-GCM key from
`admin.secrets.encryptionKey`. If that key is absent it returns `null` instead of a cipher — and a
plugin that shrugged at `null` would silently store credentials that are neither encrypted nor
recoverable.

So the plugin refuses. It warns at startup, the Providers section shows a banner, and saving a key
fails with a message rather than appearing to work.

Add to your `.env`:

```bash
ENCRYPTION_KEY=<a long random string>
```

And wire it through `config/admin.ts`:

```ts
export default ({ env }) => ({
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
});
```

The key's length does not matter — it is SHA-256 hashed — but **changing it does**. Stored
credentials become unreadable and have to be re-entered.

---

## Configuring a provider

**Settings → AI Bulk Translate → Providers → Add provider.**

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

**Settings → AI Bulk Translate → Models → Register model.**

A provider is *where* to send requests; a model is *what to ask for*. Register one per model you
want editors to be able to pick.

- **Connection** — only enabled connections that could actually authenticate are listed.
- **Model identifier** — exactly as the provider names it. For Azure this is the **deployment
  name**, not the model name.
- **Name** — what editors see in the picker.
- **Use as the default model** — the one used when an editor makes no explicit choice.

Set one model as default. Without it, a run that makes no explicit choice fails with *"No usable
model is configured."*

Disabling a connection cascades: its models cannot be called, so they are disabled too, and they
disappear from the editor's picker rather than offering a run that would fail at its first request.

---

## Permissions

The plugin adds three permissions, in **Settings → Roles → *[role]***:

| Permission | Tab | Grants |
|---|---|---|
| `Translate content` | Plugins | Triggering translation runs — this spends API credit |
| `Read settings` | Settings | Seeing which providers and models exist |
| `Manage providers and keys` | Settings | Adding, changing and removing them, **including API keys** |

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

- **Edit view** — the *Translate* action on a single entry.
- **List view** — select entries, then *Translate* in the bulk actions bar.

The dialog asks, in order:

**1. Which locales to translate into.** Your source locale is the one you are currently viewing.

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

---

## Translation settings

**Settings → AI Bulk Translate → Translation.**

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

**Carried across untouched:** everything else.

Three exclusions are absolute, at every depth:

- **Media** — images are re-linked, never re-uploaded or detached.
- **Relations** — links between entries survive intact, with one exception Strapi imposes: a link
  to a localized entry can only be made to that entry's version in the same locale. Where the
  linked entry has no version in the target locale yet, the link is left out of the translation
  and the run says so, naming the content types involved. Translate those entries, then add the
  link in the target locale. The source locale is never changed.
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
  terms.
- **It does not monitor content for changes.** Runs are triggered by a person. Continuous
  translation of new or edited content is planned for a later release.
- **It does not review quality.** The model's output is stored as returned. Treat the result as a
  first draft, not a finished translation.

---

## Troubleshooting

**"API keys cannot be stored" banner.** No admin encryption key. See
[the prerequisite](#the-encryption-key-prerequisite).

**A key shows as `••••(unreadable — encryption key may have changed)`.** `ENCRYPTION_KEY` was
changed or lost after the credential was stored. The stored value cannot be recovered — re-enter the
key on that provider.

**"No usable model is configured."** No model is both enabled and marked default under an enabled
connection. Register one, or mark an existing one as default.

**"You do not have permission to update …"** The role holds `Translate content` but lacks Content
Manager *update* on that content type. Both are required — see [Permissions](#permissions).

**"Policy Failed" on the settings page.** The role holds `Read settings` but not `Manage providers
and keys`.

**The translate action is missing.** The role lacks `Translate content`. Grant it, then hard-refresh
the browser — permission changes are cached in the admin panel.

**Azure returns 404.** Check the base URL points at your resource's `/openai` path. The plugin adds
the `/v1` segment for you; a URL ending in `/openai/deployments/...` is too specific.

**"This run covers N entries, above the limit of 100."** Select fewer entries, or raise
`maxDocumentsPerRun`.

---

## License

MIT
