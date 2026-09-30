# Releasing

How a change in `main` becomes a version on npm. For maintainers; nothing here is needed to *use*
the plugin.

Releasing is two decisions and three clicks. The decisions are what the version number is and
whether the release notes read right. Everything else is automated, and the parts that could go
wrong quietly are checked rather than trusted.

## Contents

- [How it is wired](#how-it-is-wired)
- [One-time setup](#one-time-setup)
- [Releasing a change](#releasing-a-change)
- [When something goes wrong](#when-something-goes-wrong)

---

## How it is wired

Three workflows, each with one job:


| Workflow            | Trigger                         | Does                                                            |
| ------------------- | ------------------------------- | --------------------------------------------------------------- |
| `checks.yml`        | push to `main`, and every PR    | typecheck, test, build on Node 22 and 24                        |
| `draft-release.yml` | you, from the Actions tab       | opens a **draft** GitHub Release with notes from `CHANGELOG.md` |
| `release.yml`       | **publishing** a GitHub Release | publishes that version to npm                                   |


Two things are worth knowing about the shape:

`package.json` **holds the version, not the tag.** The release is the trigger; the manifest is the
source of truth. `release.yml` refuses to publish when the tag and `package.json` disagree, so a
mistyped tag fails loudly instead of releasing notes for a version the registry never sees.

**The draft is where a human stands.** `draft-release.yml` stops at a draft deliberately. Copying a
changelog section into a release body is transcription and worth automating; deciding that a release
should happen is not. Publishing the draft is the irreversible step, and it is a person who takes
it.

There is **no npm token anywhere**. Authentication is npm Trusted Publishing: the job presents a
short-lived GitHub OIDC token and npm checks it against a publisher configured on the package. That
means nothing to rotate and no secret to leak — but it also means the publisher below must exist
before anything can be released.

## One-time setup

On npmjs.com, under the package → **Settings** → **Trusted Publisher** → **GitHub Actions**:


| Field                | Value                             |
| -------------------- | --------------------------------- |
| Organization or user | `Prismetic`                       |
| Repository           | `strapi-plugin-ai-bulk-translate` |
| Workflow filename    | `release.yml`                     |


All three are case-sensitive and matched exactly. Needs an npm login with maintainer rights on the
package.

**Renaming** `.github/workflows/release.yml` **breaks publishing** until the publisher is renamed to
match. The filename is part of the credential.

## Releasing a change



### 1. Get the work into `main`

The usual way. Let `Checks` go green before going further.

### 2. Make the release commit

Two files, one commit:

- `package.json` — the new version.
- `CHANGELOG.md` — a new section at the top, headed exactly `## 1.2.0`.

The heading is matched literally by `scripts/changelog-section.mjs`. Anything else — `## v1.2.0`,
`## 1.2.0 (2026-10-14)` — fails the next step rather than producing a release with blank notes.

Write the section the way the existing ones are written. It becomes the release body verbatim, which
is the whole reason the notes come from here instead of from a generated commit list.

Edit `package.json` by hand, or:

```bash
npm version 1.2.0 --no-git-tag-version
```

**Do not use plain** `npm version`**.** It creates a local tag, and the tag has to be created by
publishing the release so that it points where GitHub expects.

Commit as `Release 1.2.0` and push to `main`.

### 3. Draft the release

**Actions → Draft release → Run workflow**, on `main`.

It reads the version from `package.json`, lifts that section out of `CHANGELOG.md`, and opens a
draft pinned to the commit it ran against — not to whatever `main` points at later. It stops if the
tag already exists, which is what a forgotten version bump looks like, and warns if the version is
somehow already on the registry.

### 4. Read the draft, then publish it

**This is the point of no return.** Publishing creates the `v1.2.0` tag and fires `release.yml`,
which checks out that tag, re-runs typecheck and test against it, and publishes to npm.

The checks run again here rather than trusting that `Checks` passed on `main`, because a tag can be
moved, or cut from a commit `main` has since left behind.

### 5. Confirm

```bash
npm view @prismetic/strapi-plugin-ai-bulk-translate version
```



## When something goes wrong

**The publish step fails on authentication.** The trusted publisher is missing, or one of its three
fields does not match exactly. Fix it on npmjs.com, then **re-run the failed job** from Actions. The
release and tag already exist and nothing needs redoing — the re-run picks up from the failure.

`Release tag 'v…' does not match package.json version '…'`**.** They disagree. Delete the release,
delete its tag, fix the release commit, and go back to step 3:

```bash
gh release delete v1.2.0 --yes
git push origin :refs/tags/v1.2.0
```

`Tag v1.2.0 already exists`**, from the draft step.** The version was not bumped. Go back to step 2.

**The draft looks wrong.** Delete it. An unpublished draft never created a tag, so there is nothing
else to clean up. Fix and re-run step 3.

**The wrong thing reached npm.** A published version cannot be replaced — npm forbids it, and
`release.yml` skips rather than fails if the same version is released again. Cut the next patch
instead, and `npm deprecate` the bad version if it needs to carry a warning.

**Provenance.** npm attaches build provenance only when the package *and* the repository are public.
This repository is internal, so none is produced and none is expected. If it is ever made public,
provenance starts appearing on its own. If a publish ever fails trying to generate one,
`provenance=false` in `.npmrc` is the escape hatch.