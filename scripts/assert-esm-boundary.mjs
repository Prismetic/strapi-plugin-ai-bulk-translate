/**
 * Enforces the ESM/CommonJS boundary that this plugin depends on.
 *
 * The AI SDK is ESM-only. Strapi loads our server bundle with require(), so the SDK can
 * only be reached through a dynamic import, which Rollup preserves verbatim in CommonJS
 * output. A static top-level import compiles and typechecks perfectly happily — the SDK
 * declares a `default` export condition, so TypeScript believes it is requireable — and
 * then throws ERR_REQUIRE_ESM the moment Strapi loads the plugin.
 *
 * No tsconfig catches this. That was verified against `module`/`moduleResolution` set to
 * Preserve/Bundler, NodeNext/NodeNext and CommonJS/Node: all three accept the broken
 * static import. So the build output is asserted instead, which is the only check that
 * actually observes what ships.
 *
 * Runs automatically as a postbuild step.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SERVER_BUNDLE = 'dist/server/index.js';
const ADMIN_DIR = 'dist/admin';
const ESM_ONLY = ['ai', '@ai-sdk/'];

const failures = [];

const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    failures.push(`Missing build output: ${path}. Run the build first.`);
    return null;
  }
};

const server = read(SERVER_BUNDLE);

if (server !== null) {
  // Any ESM-only package reached through require() in CommonJS output is fatal.
  for (const pkg of ESM_ONLY) {
    const pattern = new RegExp(`require\\(["'](${pkg.replace('/', '\\/')}[^"']*)["']\\)`, 'g');
    for (const [, specifier] of server.matchAll(pattern)) {
      failures.push(
        `${SERVER_BUNDLE} calls require("${specifier}") on an ESM-only package. ` +
          `Reach it through await import() inside an async function instead — see server/src/services/ai-sdk.ts.`
      );
    }
  }

  // The dynamic import must survive the CommonJS emit. If Rollup ever starts
  // downleveling it, this catches the regression at build time rather than at runtime.
  if (!/\bimport\(["']ai["']\)/.test(server)) {
    failures.push(
      `${SERVER_BUNDLE} contains no dynamic import("ai"). Either the AI SDK is no longer ` +
        `reached from the server bundle, or the bundler downleveled the dynamic import.`
    );
  }
}

// The SDK has no business in a browser bundle.
const walk = (dir) => {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
};

for (const file of walk(ADMIN_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.mjs'))) {
  const contents = readFileSync(file, 'utf8');
  if (/(?:require|import)\(["']ai["']\)|from["']\s*ai["']/.test(contents)) {
    failures.push(`${file} references the AI SDK. Model calls belong on the server only.`);
  }
}

if (failures.length > 0) {
  console.error('\nESM boundary assertion FAILED:\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error('');
  process.exit(1);
}

console.log('[INFO] ESM boundary OK: dynamic import preserved, no require() of ESM-only packages, admin bundle clean.');
