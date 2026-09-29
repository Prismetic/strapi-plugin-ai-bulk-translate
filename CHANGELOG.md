# Changelog

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Fixed

- **A link to an untranslated entry no longer fails the whole translation.** A component is
  written whole, so the links inside it go with it, and Strapi rejects a write at a target locale
  when a linked localized entry has no version there (`Document with id "…", locale "…" not
  found`). Such links are now left out, as Strapi's own "fill in from another locale" does, and
  the item carries a notice naming what was left out. Links to entries that do exist in the
  target locale, and to content types that are not localized, are carried across as before.

## 1.0.0

First public release. Bulk AI translation for Strapi 5, with providers and models managed from the
admin rather than from configuration files.

### Translating

- **Translate one entry or many.** A bulk action in the list view for collection types, and an
  **AI Translate** button in the edit view for both collection types and single types (#5, #6, #8,
  #19).
- **Content fidelity.** Nested components, repeatables, dynamic zones and block rich text are all
  translated. Media and relations are left alone, including nested ones; non-localized fields are
  untouched; identifiers derived from a title are regenerated from the translated title (#7).
- **Translations are always drafts.** The plugin never publishes — that stays a human decision (#5).
- **The default locale is never a target.** It is the install's source of truth, whatever locale the
  editor is viewing, so a machine cannot overwrite it (#18).
- **You see what a run will do before it starts.** A per-locale status matrix marks each entry as
  empty, populated or missing its source, and existing translations are skipped unless ticked
  individually (#9, #10).
- **Runs report themselves.** Progress is grouped by entry title, failures and skips carry their
  reason, and failed items can be retried without repeating the ones that succeeded (#8, #10).

### Configuring

- **Provider connections with encrypted credentials.** Keys are encrypted with the host's
  `ENCRYPTION_KEY`, masked in the interface, and never returned to the browser. **Test Connection**
  exercises a stored key against the live provider (#3).
- **A model registry with a default.** Register models under any connection, enable and disable them,
  and mark one default. The first model registered becomes the default automatically; the default is
  then protected — Disable and Delete are withheld from it and from the connection holding it, each
  explaining why (#4, #15).
- **Per-run model choice.** The dialog preselects the default and lets an editor choose another for a
  single run; the job records which model was actually used (#11).
- **Translation settings.** System prompt and temperature are editable, validated, and restorable to
  the host's configured defaults (#11).

### Permissions

- Three permissions — **Translate content**, **Read settings**, **Manage providers and keys** — and
  translating a content type additionally requires the caller's own Content Manager update rights for
  that type, so the plugin permission adds to content permissions rather than bypassing them (#12).

### Known limits

- The default-model guards are **presentation only**. The API still permits the four operations that
  can leave an install with no default. Accepted deliberately: this guards against a slip by a trusted
  administrator, not against an adversary.
- There is no route through the settings page to zero models or zero connections. Removing the last
  of either means registering a replacement, promoting it, then removing the original.
- There is no way to AI-translate *into* the default locale, including to repair a bad default-locale
  entry from a good translation. That is the point of treating it as the source of truth.
- **A monitored republish that changes nothing costs nothing.** The plugin fingerprints the text a
  run would send to a model, so an unpublish/republish, or an edit that only touched a relation or a
  non-translated field, records a skipped run and makes no model call.
- **A run in progress cannot be stopped.** Closing the dialog does not cancel it, and the button says
  `Close` rather than `Cancel` for that reason. What bounds a mistaken run is the server-side entry
  cap, `maxDocumentsPerRun`.
- **An expired admin session is reported as `Missing or invalid credentials`**, rendered above the
  API key field on the provider and model forms. It reads as a rejected provider key. If credentials
  that worked yesterday appear to fail, sign in again before re-checking them.

### Requires

- Strapi **5.27** or later, Node **20–22**, and the i18n plugin with at least two locales. An
  `ENCRYPTION_KEY` must be configured on the host before credentials can be stored.
