#!/usr/bin/env node
// Prints one version's section of CHANGELOG.md to stdout, for the draft-release workflow to use as
// GitHub Release notes.
//
// The changelog here is written by hand, in prose, and is the best description of a release that
// exists. GitHub's generated "what's changed" commit list is strictly worse, so the release notes
// are lifted from the changelog rather than regenerated.
//
// Every failure below exits non-zero rather than printing nothing. An empty stdout would sail
// through the workflow and produce a release with blank notes, which nobody notices until the
// release is already public.
//
// Usage: node scripts/changelog-section.mjs <version> [path]

import { readFileSync } from 'node:fs';

const fail = (message) => {
  console.error(`[ERROR] ${message}`);
  process.exit(1);
};

const version = process.argv[2];
const path = process.argv[3] ?? 'CHANGELOG.md';

if (!version) fail('Usage: node scripts/changelog-section.mjs <version> [path]');

let lines;
try {
  lines = readFileSync(path, 'utf8').split('\n');
} catch (error) {
  fail(`Could not read ${path}: ${error.message}`);
}

// Only `## ` opens a version. `### Changed` and `### Fixed` are subheadings inside one and must not
// end it — which is why this tests for `## ` with the trailing space rather than for `##`.
const isVersionHeading = (line) => line.startsWith('## ');

const start = lines.findIndex((line) => line.trim() === `## ${version}`);
if (start === -1) {
  fail(
    `${path} has no '## ${version}' section. Write the changelog entry before drafting the release.`
  );
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (isVersionHeading(lines[i])) {
    end = i;
    break;
  }
}

const body = lines.slice(start + 1, end).join('\n').trim();
if (!body) {
  fail(`${path} has a '## ${version}' heading with nothing under it.`);
}

process.stdout.write(`${body}\n`);
