# Handoff — strapi-plugin-ai-bulk-translate

*Written 26 August 2026, at commit `856a64d` — 150 tests, all four feedback commands green.
A snapshot, not a living document: where it disagrees with the repo, the repo is right.*

**Verification host:** `../CMS multi-locale` (Strapi 5.27, Node 22, port 1340).

Read first, in this order:

1. `CLAUDE.md` — how work flows here (AI Workflow Harness; **npm, not pnpm**)
2. `CONVENTIONS.md` — every environment trap found so far. Long, and all of it earned.
3. `docs/IMPLEMENTATION-PLAN.md` — the reviewed plan
4. Issue #1 — the PRD

Per-slice evidence lives in the GitHub issues and commit messages. Don't re-derive it.

---

## State

**Done:** #2 skeleton · #3 credentials · #4 model registry · #5 tracer · #6 single types ·
#7 content fidelity · #8 bulk action · #9 locale-status · #10 conflict opt-in

**Open:** #11 (afk, model picker + translation settings) · #12 (hitl, **code complete, awaiting
manual sign-off**) · #13 (afk, docs) · #14 (hitl, QA) · #1 (PRD, stays open)

---

## Immediate next step: verify #12, then close it

#12 is committed and machine-verified (18 routes, 0 ungated; 403 for a caller lacking content
rights). What is missing is a human clicking it. **A second admin user is required — super admin
bypasses every check.** Permission changes need a hard browser refresh.

Host: `http://localhost:1340` (see *Environment* — it may need restarting).

1. **Settings → Roles → [a non-super role] → Plugins / Settings tabs.** The permissions live
   *inside a role*, not in the Settings sidebar. Expect `Translate content`, `Read settings`,
   `Manage providers and keys`.
2. Role **without** `Translate content` → the action must be absent from list view and edit view.
3. Tick it → the action returns and works.
4. **The one that matters:** `Translate content` ticked **but** Content Manager *update* removed on
   `Page` → triggering it must fail with *"You do not have permission to update api::page.page"*.
   This proves the plugin permission adds to content permissions rather than routing around them.
   Only ever verified with a synthetic ability object, never a real role.

Also worth one end-to-end translation from the list view before building further — it exercises the
UI of #5/#8/#9/#10, none of which has been clicked. Select two `Page` entries, translate to `ar` and
`zh-CN`, leave conflict checkboxes unticked, and confirm existing `zh-CN` content is **untouched**.

After that, #11 and #13 are both afk and unblocked.

---

## Environment (this is where the time goes)

`CONVENTIONS.md` has the full list. The four that bite hardest:

- **Run the host under Node 22 via nvm.** Machine default is v25; the host will not boot on it.
- **After any `yalc push` touching admin code**, clear the Vite dep cache or the admin silently
  serves stale code with no error:
  `rm -rf <host>/node_modules/.strapi/vite <host>/.strapi/client`, restart, hard-refresh.
- **The plugin has a nested `node_modules`** inside the host holding `ai`, `@ai-sdk/*`, `zod`. It
  must contain **nothing else** — see the open decision below.
- **Host probes must be CommonJS**, run from `dist/` with `package.json` copied in, and must reach
  the AI SDK only through plugin services. Verify cleanup with `db.query`, not
  `documents.findMany`.

Check the host is alive before trusting anything:

```
lsof -nP -iTCP:1340 -sTCP:LISTEN
```

---

## Open decision: replace yalc with tarball installs

Four failures traced to one root cause — **Strapi ships its own `ai` copy**
(`@strapi/content-type-builder` → `ai@5`) — and the yalc loop diverging from how npm really
installs:

1. Spec-version mismatch, because npm deduped to Strapi's `ai@5`
2. Fixed by installing nested deps inside the linked plugin
3. That install also pulled **duplicate `@strapi/admin`, `@strapi/strapi`, `react`, `react-dom`**
   (npm 7+ auto-installs peers), giving the browser two React contexts and breaking the entire
   Content Manager with *"`useRBAC` must be used within `Auth`"*
4. A stale Vite dep cache hid a shipped change for three hours

None of this happens with a real install. Verified: `npm pack` + `npm install ./*.tgz` into a
project already holding `ai@5.0.26` nests `ai@7.0.79` under the plugin correctly.

**Recommendation:** switch the verification loop to tarball installs. Slower per iteration, but it
stops the dev environment diverging from what users actually get. Raised with the user; not decided.

If yalc is kept: after any nested `npm install` inside the linked plugin, delete `@strapi`, `react`,
`react-dom`, `react-router*`, `styled-components`, `react-intl` from its `node_modules`. Only `ai`,
`@ai-sdk/*` and `zod` may be nested.

---

## Corrections already made to the plan (do not reintroduce)

- **No tsconfig override is needed** for the AI SDK. The plan claimed one was mandatory; it was
  wrong. `server/tsconfig.json` extends Strapi's config unmodified. The real hazard — a static
  import of the ESM-only SDK — is caught by `scripts/assert-esm-boundary.mjs` postbuild, because no
  compiler setting catches it.
- **i18n's localized rule requires `=== true`**, so a missing flag means *not* localized. The plan
  had this inverted, which would have propagated a translated value into every locale. The extractor
  deliberately uses a *different* rule inside components (`!== false`) — see its comments.
- **`documents.delete({ documentId })` is locale-scoped.** It does not delete the document.

---

## Working agreements that produced the good outcomes

- **Verify claims, don't relay them.** Several loop reports and several plan statements were wrong;
  every one was caught by running the thing rather than reading it.
- **A guard that has never failed is not a guard.** Sabotage-check every assertion. The ESM guard
  and the route-gating guard were both proven by deliberately breaking what they protect.
- **Host probes find what unit tests cannot.** A stranded-job bug survived 14 passing tests and was
  caught by running the real controller against the real database.
- **Probes must clean up and prove it.** One left a row behind; an earlier one modified real content.

---

## Suggested skills

- `do-work` — for #11 or #13: plan → implement → validate → commit against the configured feedback
  commands.
- `coding-standards` — loads `CONVENTIONS.md`. Worth running before writing any code here.
- AFK loop for #11/#13: `npx tsx .sandcastle/interactive.ts` (npm, not pnpm; `main.ts` needs Docker,
  which is not installed).

---

## Unrelated, still outstanding

`CMS multi-locale/config/plugins.ts` contains a **live OCI private key** committed in `fc3e390`,
with tenancy OCID, user OCID and fingerprint. No git remote on that clone, so it may never have been
pushed. Needs rotating in OCI and scrubbing from history. Raised twice; not acted on.
