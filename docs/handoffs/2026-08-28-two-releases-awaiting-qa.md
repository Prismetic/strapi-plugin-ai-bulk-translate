# Handoff — strapi-plugin-ai-bulk-translate

*Written 28 August 2026 at commit `39eb259`, revised the same day at `76daab4`. 477 tests, all four
feedback commands green, tree clean, `main` level with `origin/main`, CI green on Node 20 and 22. A snapshot, not a living
document: where it disagrees with the repo, the repo is right.*

**Superseded by** `docs/handoffs/2026-09-01-qa-hosts-ready.md`, which is the current one. Its 1.1
decisions and corrections below still stand and are not repeated there.

**Supersedes** `docs/handoffs/2026-08-27-1.0-qa-pending.md`. Everything it lists as open is still
open, and 1.1 has been built on top since.

Read first, in this order:

1. `CLAUDE.md` — how work flows here (**npm, not pnpm**)
2. `CONVENTIONS.md` — every environment trap found so far
3. `README.md` and `CHANGELOG.md` — the user-facing contract
4. Issues #1 and #21 — the two PRDs

Per-slice reasoning lives in the issues and commit messages. **Twenty-four commits landed since the
last handoff and the reasoning is in them, not here** — read them rather than re-deriving.

---

## State

**Both releases are code-complete. Nothing left is code.**

| | |
|---|---|
| Milestone **1.0** | 15 closed, 3 open — #14 (final QA), #20 (release mechanics), #1 (PRD, open by design) |
| Milestone **1.1** | 10 closed, 2 open — #31 (final QA), #21 (PRD, open by design) |

Every remaining issue is `hitl`. There is no `afk` work to pick up, and starting the AFK loop would
find nothing to do.

---

## Three human gates, in order

**1. #14 — final QA for 1.0**, in a **fresh** Strapi project with a second non-super-admin account.
Unchanged from the previous handoff except that its plan now also covers #18 and #19, which were
pulled forward from 1.1.

**2. #20 — publish 1.0.0.** Everything is prepared: version bumped, metadata added, `CHANGELOG.md`
written, CI running the four feedback commands on Node 20 and 22, `prepublishOnly` wired so a publish
cannot ship a stale `dist`. What is left is `npm login` and `npm publish`, then tagging `v1.0.0` and
creating the release.

**Publishing is deliberately not automated and must follow #14, not precede it.** A published
version number can never be reused, even after `npm unpublish`. The tag should mark the commit that
was actually released.

**3. #31 — final QA for 1.1.** Needs a real provider and real publishes; monitoring spends money on a
trigger rather than a button, so check the Jobs tab after each step rather than at the end.

Two orderings inside that plan are easy to get wrong, and both waste a test rather than reporting a
bug. **The fingerprint check runs before the overwrite policy**, so to exercise overwriting you must
change the source text rather than republish unchanged — otherwise the run is skipped before the
policy is consulted. And **monitoring configuration must be saved before it applies**, which now
announces itself per row rather than only as a count.

---

## What 1.1 is

Two features, one PRD (#21), sliced into #22–#30 and all delivered.

**A Jobs tab**, under the plugin's own menu entry beside Settings. Lists every run — manual and
monitored — defaulting to what needs attention (queued, processing, failed), with independent
**Completed** and **Skipped** checkboxes. Rows name the entries they touched by a title frozen at run
time, show how long a run took, and expand to per-entry, per-locale outcomes with reasons. Failed
runs retry in place. There is no Cancel, deliberately.

Two rules about a run's status are easy to mistake for bugs, and both were reported as such before
they were settled:

- **A monitored run that changed nothing is `skipped`, not `completed`** — whether it was the
  fingerprint check or the overwrite policy that declined. One meaning per bucket: skipped is
  "nothing changed", completed is "something was written". **A run somebody started stays
  `completed`** in the same situation, because they pressed a button and should find the result
  where they expect rather than behind a filter that is off by default. The asymmetry is deliberate.
- **The badge colour answers a different question from the label.** A run is *called* completed as
  soon as anything translated, so the colour says whether it was clean: green only when every item
  translated, yellow if anything was skipped, red if anything failed.

**Monitoring.** Publishing the default locale of a monitored entry translates that entry
automatically. Configured per content type and per locale, with a two-level opt-in — *Overwrite
content*, and nested beneath it *Overwrite manual edits*.

Four decisions in it are load-bearing. Do not undo them without reading the issue first:

- **The middleware runs on every document-service call in the host.** Its first line returns for
  anything that is not a publish, before any await or store read. There is a test asserting the
  configuration is never even read for other actions.
- **Nothing thrown in it may escape into the publish path.** Breaking publishing because the plugin
  cannot read its own configuration would be far worse than failing to translate.
- **Monitoring cannot feed itself**, structurally rather than by a guard: only the default locale
  triggers it, and the plugin only ever writes drafts.
- **Every uncertainty resolves toward preserving human work.** Content the plugin has no record of
  writing is treated as somebody's; an entry that cannot say when it changed is assumed edited.

---

## Corrections made — do not reintroduce

These cost real time. The earlier handoffs' corrections still stand; these are new.

- **`addDocumentHeaderAction` is not the route to a labelled button**, whatever #16 section 3 says.
  It renders an `IconButton`, so the label becomes a tooltip — and at **5.27**, the peer floor and
  the host's version, an action without `type: 'icon'` renders **nothing at all**. 5.52 dropped that
  check, which is why it looks fine against the devDependency. The working route is injection into
  `editView.right-links`.
- **Never read `isDefault` off i18n's `locales.find()`.** The rows do not carry it; i18n's own
  controller decorates them afterwards. Use `defaultLocaleCode`.
- **Never read `params.id` as an identifier without `documentIdFromRoute`.** The Content Manager
  routes creation as `/…/:slug/create`, so on a new entry it is the literal string `create`.
- **Do not append a locale's code to its name.** i18n's display name usually already carries a
  parenthetical — "Arabic (ar)" — and appending produced "Arabic (ar) (ar)" in two places. Stripping
  it instead would be wrong as often: `zh-CN` is named "Chinese (cn)".
- **`1rem` is `10px` in the admin.** The design system sets `html { font-size: 62.5% }`. Column
  widths borrowed from Strapi's own pages are in that scale.
- **A section-wide Save needs per-row unsaved state.** The monitoring section briefly had one Save
  for the whole section and a change count at the far end of it — which is not where anyone is
  looking when they tick a box, so an unsaved tick looked exactly like a saved one. A locale was
  configured to overwrite, the run skipped it, and the plugin was right: the configuration had never
  been written. Each row now carries an **Unsaved** badge and a warning border, keyed to the same
  comparison that enables Save so the two cannot disagree. The per-content-type Save buttons that
  preceded it made this impossible; if the layout changes again, keep the row-level signal.
- **The server entry point had no declaration file at all.** `TS2742` errors were exiting 0 while
  `vite-plugin-dts` emitted nothing, and `package.json` advertised types that were never in the
  tarball. Fixed by annotating `getModel` with a **type-only** import of `ai` — see the ESM boundary
  section of `CONVENTIONS.md` before touching it.

---

## The trap worth naming twice

**A test harness that silently ignores what it cannot express will pass for the wrong reason.**

The fake database matched flat equality only. The retention prune and the monitoring fingerprint
lookup both query with `$in` and `$lt`, so both got "no rows" — which is indistinguishable from the
feature correctly deciding not to act. Two features' tests were green while never exercising the
query at all.

It was found only because a test that should have gone red went green. The harness now implements
the operators the plugin issues, and `job-store.test.ts` covers the prune specifically because it
was the one that had never been observed working.

The general form, which `CONVENTIONS.md` records: **when a value comes from outside your code, verify
what it actually contains rather than what its type says** — and stub the real contract when testing
a boundary, so re-deriving it the wrong way fails the test instead of shipping.

---

## Still open

- **The release mechanics of 1.1.** #20 covers 1.0 only. When 1.1 ships it needs its own version
  bump, changelog entry and tag; nothing tracks that yet.
- **Skipped runs have no shorter retention window.** They are the volume once monitoring is on and
  carry the least value. Noted on #25 as a deliberate omission rather than an oversight.
- **`npm install` under npm 11 rewrites `package-lock.json`** with `"peer": true` annotations. The
  lockfile is owned by **npm 10 / Node 22** — the version the host requires — and CI runs `npm ci`,
  so drift fails loudly. Use `nvm use 22` before installing.

---

## Unrelated, still outstanding — raised five times now

`../CMS multi-locale` commits live credentials: an OCI private key as `privateKeyBase64` in
`config/plugins.ts` (base64, so grepping for `BEGIN PRIVATE KEY` finds nothing), and tracked
`.env.oci` / `.env.oci.prod` carrying `ADMIN_JWT_SECRET`, `JWT_SECRET`, `APP_KEYS`, `API_TOKEN_SALT`,
`TRANSFER_TOKEN_SALT` and `ENCRYPTION_KEY` — that last is the key this plugin encrypts provider
credentials with, so committing it makes every stored provider key recoverable.

Contained only because that clone still has **no git remote**. Rotating and scrubbing is a contained
job now and a much larger one after someone adds one.

---

## Suggested skills

- **`verify-in-host`** — for #14 and #31, and for anything that has to be seen in a running host.
- **`coding-standards`** — before writing any code here.
- **`do-work`** — nothing to run it on today; every open issue is `hitl`.

The verification host is `../CMS multi-locale` on port 1340, under **Node 22 via nvm**. `npm run push`
builds, packs, installs, verifies the integrity hash and clears the Vite cache; restarting the server
and hard-refreshing the browser are still manual, in that order.
