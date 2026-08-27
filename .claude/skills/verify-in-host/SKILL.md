---
name: verify-in-host
description: Push a build of this plugin into a host Strapi project and confirm the host is really running it. Use when verifying a change against a real Strapi host, when an admin UI change does not appear after a push, when the plugin fails to load or model calls fail with a "specification version" error, or when the user mentions the verification host, pushing to the host, a stale bundle, or yalc.
---

# Verify in host

The plugin is only half-tested by `npm test`. Anything touching Strapi's admin, permissions, or the
AI SDK has to be seen in a host project. This is that loop.

## Quick start

```
nvm use 22
npm run push -- "../CMS multi-locale"
```

Then **restart the host dev server** and **hard-refresh the browser**, in that order. The script
prints this reminder because skipping either step is the most common way to "verify" a build the
host is not serving.

Set `PLUGIN_HOST` once and the argument becomes optional.

## The loop

1. **Push.** `npm run push -- <host>` builds, packs, installs the tarball, verifies the host lockfile
   carries this build's integrity hash, and clears the Vite pre-bundle. It refuses before doing any
   of that if the current Node is outside the host's `engines.node`.
2. **Restart** the host dev server. Clearing the cache under a *running* host is not enough — it
   regenerates before the restart and the browser is served the old bundle anyway.
3. **Hard-refresh** the browser. After a permissions change, this is mandatory, not hygiene.
4. **Confirm what you are looking at** before concluding anything about the feature. See below.

Flags: `--no-build` (pack the current `dist/`), `--server-only` (skip the cache clear; Strapi reloads
server code itself), `--any-node` (override the Node check — you had better have a reason).

## When the change is not there

Work down this list. Each step separates two explanations that look identical in the UI.

1. **Is it built?** Grep `dist/` for a string you expect. **Minified identifiers prove nothing** — a
   component name is minified away, so grep for something that survives: a translation key from
   `admin/src/translations/en.json`, or a `defaultMessage`.
2. **Is it installed?** The push already compared integrity hashes and would have failed loudly. If
   you installed by hand, re-push — **a bare `npm install` in the host does not re-extract a rebuilt
   tarball of the same version.** It reports "up to date" and leaves the previous build in place.
3. **Is it served?** Compare the mtime of `<host>/node_modules/.strapi/vite/deps/_metadata.json`
   against the plugin's `dist`. Cache older than the build means the admin is serving a stale
   pre-bundle: re-push and restart.
4. **Only now** suspect the feature.

## Traps

- **"Missing or invalid credentials" is Strapi's session 401, not a credential problem.** It comes
  from `@strapi/core`'s auth service and is rendered raw above the API key field on the provider
  form, so an expired admin session reads exactly like a rejected Azure key. Log in again before
  diagnosing anything else. `/ai-bulk-translate/health` is an admin route, so a bare `curl` returns
  this too — that is the route working, not failing.
- **Node major matters.** The host caps at Node 22 and this machine defaults to 25. Installing under
  the wrong major can rebuild `better-sqlite3` against it and leave the host unbootable under the
  version it supports. `nvm use 22` first; the push refuses otherwise.
- **A super admin bypasses every permission check.** Verifying anything permission-shaped needs a
  second, non-super-admin account — the verification host already has one on the Editor role; a fresh
  project needs one created.
- **Model calls failing with a "specification version" error** mean `ai` and `@ai-sdk/*` are from
  different generations. `GET /ai-bulk-translate/health` reports both resolved versions. A tarball
  install nests them correctly on its own, so this now points at something genuinely wrong rather
  than at the link method.
- **Probes are not a substitute for the UI, and they bite.** Read the probe rules in
  `CONVENTIONS.md` before writing one — CommonJS only, never `import('ai')` directly, and snapshot
  the tables first: a probe once added a locale to the host's real footer.

## Fresh host vs the verification host

Use `../CMS multi-locale` for iteration. Use a **fresh** Strapi project for anything that has to work
from nothing — the README walkthrough, first-run setup, the "no encryption key configured" path. The
verification host has too much state to test those honestly.
