# Handoff — strapi-plugin-ai-bulk-translate

*Written 1 September 2026 at commit `4a92631`. 485 tests, all four feedback commands green, tree
clean. **Two commits are not pushed** — see below, it is an auth wall rather than a problem with the
work. A snapshot, not a living document: where it disagrees with the repo, the repo is right.*

**Supersedes** `docs/handoffs/2026-08-28-two-releases-awaiting-qa.md`. Everything it lists as open is
still open. What has changed since: a second QA host was prepared, and the plugin has its own icon.

Read first, in this order:

1. `CLAUDE.md` — how work flows here (**npm, not pnpm**)
2. `CONVENTIONS.md` — every environment trap found so far
3. The 28 August handoff — the 1.1 decisions and corrections still stand and are not repeated here
4. Issues #1 and #21 — the two PRDs

---

## Do this first

**`git push` is failing with 403.** The Prismetic organisation has enforced SAML SSO and the GitHub
CLI's OAuth token has not been authorised for it. The token itself is fine — `repo` and `workflow`
scopes are present.

```
gh auth refresh -h github.com -s repo
```

Two commits are waiting: `aea2ff2` and `4a92631`, both the plugin icon. Nothing else is affected —
the tarball install into the hosts is local and unaffected.

This is new. Pushes worked throughout the previous two sessions, so the enforcement or the session
expiry happened within the last day.

---

## State

**Both releases are still code-complete, and every open issue is `hitl`.** There is no `afk` work;
starting the loop would find nothing.

| | |
|---|---|
| Milestone **1.0** | #14 (final QA), #20 (release mechanics), #1 (PRD, open by design) |
| Milestone **1.1** | #31 (final QA), #21 (PRD, open by design) |

The order still matters: **#14 → #20 → #31**. Publishing must follow sign-off, because a published
version number can never be reused.

---

## Two QA hosts, and what each is for

Neither is "the" host any more. They cover different ends of the supported range, and between them
they are better coverage than either alone.

| | `R&D/CMS multi-locale` | `ITE/CMS` |
|---|---|---|
| Strapi | 5.27 — the peer floor | 5.49 — the top of the range |
| Database | SQLite | **PostgreSQL** |
| Port | 1340 | 1339 |
| Node | 22 (`engines` caps at 22) | 22 (`engines` allows up to 24) |
| Content | throwaway | **real**, 172 localized types |
| Git remote | none — this is why it is safe | **live Azure DevOps** |

**`ITE/CMS` was set up during this session** and is ready for #14:

- On branch **`ai-bulk-translate-qa`**, cut from `develop`. Seven modified files: `package.json` and
  the lockfile are the plugin install; `types/generated/*` and `.strapi/*` are Strapi's own
  regeneration, which happens on any boot.
- **A database dump was taken first** — `scratchpad/ite-cms-before-qa.dump`, 39M, restore with
  `pg_restore`. This matters more than the branch: translations write to Postgres, and no git branch
  protects data. The scratchpad is session-scoped, so copy it somewhere durable if QA will span days.
- **`zh-CN` added** as the only target locale; `en` remains default.
- **`ENCRYPTION_KEY` generated into `.env`** (gitignored, verified before writing) and wired as
  `secrets.encryptionKey` in `config/admin.js`.
- **The plugin auto-discovers.** No `config/plugins.js` entry was needed — Strapi 5 loads an
  installed plugin from its `strapi` manifest key. The README's "Enable it in `config/plugins.ts`"
  step is therefore optional, and saying so would spare the next person editing a config file that
  already holds 25 publisher content types and an OSS upload provider. **Worth a README correction.**

Two findings already banked from that setup, both #14 checks passing before QA formally starts:

- Booting with no encryption key logs exactly what the plan asks for, naming the fix rather than
  just complaining.
- The AI SDK nests correctly on Postgres/5.49 too — `ai@7.0.83` under the plugin, Strapi's
  `ai@5.0.52` left hoisted. That behaviour is now confirmed on both hosts.

**What blocks QA there, and neither is something an agent can do:** a second, non-super-admin
account must be created (it needs a password), and a provider API key must be entered. A super admin
bypasses every permission check, so the whole RBAC section proves nothing without the second account.

---

## The plugin has its own icon

`PluginIcon` renders the supplied artwork instead of Strapi's `Earth`. It is used in exactly three
places — the menu entry, the edit-view button, the bulk action — and all three go through that one
component, so replacing the artwork is a one-file change.

The rules any future artwork has to follow, learned across two rounds of it:

- **Inline the markup; do not import an `.svg`.** The plugin build has no svgr, so an `.svg` import
  resolves to a URL rather than a component — and an emitted asset inside a plugin installed from
  `node_modules` is a resolution risk in the host. Inline markup has nothing to resolve.
- **Strip the artwork's fixed fill and inherit `currentColor`.** Strapi ships light and dark themes
  and the mark sits inside a button that sets its own text colour. A fixed fill is wrong in one of
  them, and wrong again in a secondary button.
- **Generate the clip ids per instance.** The mark renders three times on one page. Exported artwork
  ships fixed ids like `clip0_2_2`, and three copies put duplicates in the document, where every
  `url(#…)` resolves to whichever came first — which looks correct while the instances are identical
  and stops being correct the moment they are not. `useId` handles it.
- **Do not drop clip paths without checking they are no-ops.** The first artwork's were exact
  bounding boxes and could go. The second artwork's are not: one genuinely crops its path.
- **Do not rescale the viewBox** to Strapi's 32×32. A viewBox is only a coordinate system, so a
  100×100 one renders identically at 16px, and rewriting kilobytes of path data risks the artwork
  for nothing.

**Unverified, and only a human can:** whether the mark reads at 16px in the menu, and whether it
looks right in both themes. Both were pushed to `CMS multi-locale` and are waiting to be looked at.

---

## Still open

Carried forward, all still true:

- **1.1 has no release mechanics.** #20 covers 1.0 only. When 1.1 ships it needs its own version
  bump, changelog entry and tag, and nothing tracks that.
- **Skipped runs share the retention window** with real ones. A shorter one was left unbuilt
  deliberately until volumes justify it — see #25.
- **The nightly prune has never been seen to fire.** The prune itself was run against the host
  database during this session and behaved correctly, so what is unverified is the 03:00 schedule,
  not the task. Recorded on #25 and #31.
- **The Jobs tab on `CMS multi-locale` holds eleven fabricated rows**, covering every status and
  colour condition. They are for looking at, not for QA: Retry fails on them because the document
  ids do not exist. Clear them before sign-off.

New, and small: **`tmp/` in this repo is not gitignored** and holds scratch JSON that is not part of
the project. A `git add -A` swept six of those files into a commit during this session and they had
to be amended out. Either ignore the directory or stage explicitly.

---

## Unrelated, and now worse — raised six times

Committed credentials, and this is no longer confined to a repo that cannot leak.

- **`R&D/CMS multi-locale`** commits an OCI private key as `privateKeyBase64` in `config/plugins.ts`
  (base64, so grepping for `BEGIN PRIVATE KEY` finds nothing), plus tracked `.env.oci` and
  `.env.oci.prod`. Contained **only** because that clone has no git remote.
- **`ITE/CMS`** tracks **`.env.international`, `.env.local` and `.env.regional`**, each carrying
  roughly a dozen real values — `ADMIN_JWT_SECRET`, `JWT_SECRET`, `APP_KEYS`, `API_TOKEN_SALT`,
  `TRANSFER_TOKEN_SALT`, `DATABASE_PASSWORD`, the OSS `ACCESS_KEY_ID`/`ACCESS_SECRET`,
  `AZURE_DEVOPS_TOKEN`, `CONTACT_CLASSIFICATION_TRIGGER_KEY`. **That repo has a live remote**, so
  this one is not contained at all.

Directly relevant to the setup above: **the `ENCRYPTION_KEY` added to `ITE/CMS` must never be copied
into those tracked files.** It is the key provider credentials are encrypted with; committing it
makes every stored key recoverable by anyone with repo access.

Rotating and scrubbing is a decision for whoever owns those repos. It has not been actioned across
six mentions, which is itself worth noting to whoever picks this up.

---

## Suggested skills

- **`verify-in-host`** — for #14 and #31. `npm run push -- <host>` builds, packs, installs, verifies
  the integrity hash and clears the Vite cache; restart and hard-refresh are still manual, in that
  order.
- **`coding-standards`** — before writing any code here.

Both hosts run under **Node 22 via nvm**. `CMS multi-locale` is on 1340 and was left running;
`ITE/CMS` is on 1339 and is stopped.
