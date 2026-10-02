/**
 * Builds the plugin and installs it into a host Strapi project as a real tarball.
 *
 * This replaces the yalc loop, for three reasons found the hard way:
 *
 * 1. yalc copies `dist/` only, so npm deduped the AI SDK to the host's hoisted `ai@5`
 *    instead of nesting our `ai@7` — a mismatch that had to be repaired by hand inside
 *    the host's node_modules after every fresh link. A tarball install is a real install:
 *    npm nests correctly and installs our dependencies, so neither repair is needed.
 * 2. `yalc push` preserves source mtimes, so a host copy could look older than a build it
 *    was byte-identical to. "Is my build in the host?" needed a shasum of two directories.
 *    Packing gives an integrity hash that npm records verbatim in the host's lockfile, so
 *    the same question is now one string comparison — which this script makes for you.
 * 3. It is the path users actually take, so verification exercises the shipped artefact.
 *
 * One trap survives the switch and is the reason this script always passes the tarball
 * path explicitly: a plain `npm install` in the host will NOT pick up a rebuilt tarball of
 * the same version. The lockfile already lists the spec, npm reports "up to date", and the
 * host silently keeps serving the previous build. Verified on npm 11.6.2. Only
 * `npm install <path-to-tgz>` re-extracts.
 *
 * Usage:
 *   node scripts/push-to-host.mjs <host-path>     # or set PLUGIN_HOST
 *   npm run push -- "../my-strapi-host"
 *
 * Flags:
 *   --no-build     install the current dist/ without rebuilding
 *   --server-only  skip the Vite cache clear (server-only changes do not need it)
 *   --any-node     install even though this Node is outside the host's engines range
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD_DIR = join(PLUGIN_DIR, '.host-builds');

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const positional = args.filter((arg) => !arg.startsWith('--'));

const die = (message) => {
  console.error(`\n[ERROR] ${message}\n`);
  process.exit(1);
};

const run = (command, commandArgs, cwd) =>
  execFileSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  });

const { name: PLUGIN_NAME } = JSON.parse(readFileSync(join(PLUGIN_DIR, 'package.json'), 'utf8'));

// --- Resolve and sanity-check the host ------------------------------------------------

const hostArg = positional[0] ?? process.env.PLUGIN_HOST;

if (!hostArg) {
  die(
    'No host given. Pass the host project path, or set PLUGIN_HOST:\n' +
      '    npm run push -- "../my-strapi-host"\n' +
      '    export PLUGIN_HOST="../my-strapi-host"'
  );
}

const HOST_DIR = resolve(PLUGIN_DIR, hostArg);
const hostManifestPath = join(HOST_DIR, 'package.json');

if (!existsSync(hostManifestPath)) {
  die(`${HOST_DIR} has no package.json. That is not a Strapi host.`);
}

const hostManifest = JSON.parse(readFileSync(hostManifestPath, 'utf8'));
const hostDeps = { ...hostManifest.dependencies, ...hostManifest.devDependencies };

// Guards against installing into the wrong directory, which is expensive to undo.
if (!hostDeps['@strapi/strapi']) {
  die(`${HOST_DIR} does not depend on @strapi/strapi. Refusing to install into it.`);
}

// The host's Node range is not advice. `npm install` can rebuild native modules against
// whichever Node is running: better-sqlite3 compiled under Node 25 leaves the host unbootable
// under the Node 22 it actually supports, and rebuilding it back breaks it for everyone else.
// Majors only, and ranges using `||` are not evaluated — this catches the case that has bitten,
// not every expressible range.
const hostNodeRange = hostManifest.engines?.node;

if (hostNodeRange && !flags.has('--any-node') && !hostNodeRange.includes('||')) {
  const current = Number(process.versions.node.split('.')[0]);
  const unmet = hostNodeRange
    .split(/\s+/)
    .filter(Boolean)
    .map((comparator) => {
      const [, operator, major] = comparator.match(/^(>=|<=|>|<|=|\^|~)?v?(\d+)/) ?? [];
      if (major === undefined) return null;
      const bound = Number(major);
      const satisfied = {
        '>=': current >= bound,
        '>': current > bound,
        '<=': current <= bound,
        '<': current < bound,
        '=': current === bound,
        '^': current === bound,
        '~': current === bound,
      }[operator ?? '='];
      return satisfied ? null : comparator;
    })
    .filter(Boolean);

  if (unmet.length > 0) {
    die(
      `Node ${process.versions.node} does not satisfy the host's engines.node "${hostNodeRange}" (${unmet.join(' ')}).\n` +
        `    Installing under the wrong major can rebuild the host's native modules against it.\n` +
        `    Switch first — \`nvm use 22\` — or pass --any-node if you are certain.`
    );
  }
}

console.log(
  `[INFO] Node ${process.versions.node} satisfies the host's engines.node "${hostNodeRange ?? 'unset'}".`
);

console.log(`[INFO] Host: ${HOST_DIR}`);

// --- Build ----------------------------------------------------------------------------

if (flags.has('--no-build')) {
  console.log('[INFO] --no-build: packing the current dist/.');
} else {
  console.log('[INFO] Building...');
  execFileSync('npm', ['run', 'build'], { cwd: PLUGIN_DIR, stdio: 'inherit' });
}

if (!existsSync(join(PLUGIN_DIR, 'dist'))) {
  die('No dist/ to pack. Run the build first.');
}

// --- Pack -----------------------------------------------------------------------------

mkdirSync(BUILD_DIR, { recursive: true });

const packOutput = run('npm', ['pack', '--json', '--pack-destination', BUILD_DIR], PLUGIN_DIR);
const [packed] = JSON.parse(packOutput);
const tarball = join(BUILD_DIR, packed.filename);

console.log(`[INFO] Packed ${packed.filename} (${packed.entryCount} files, ${packed.integrity}).`);

// --- Install --------------------------------------------------------------------------

// The path is passed explicitly on every push. See the header: a bare `npm install`
// reports "up to date" and leaves the previous build in place.
console.log('[INFO] Installing into the host...');
execFileSync('npm', ['install', tarball, '--no-audit', '--no-fund'], {
  cwd: HOST_DIR,
  stdio: 'inherit',
});

// --- Verify the host actually got this build -------------------------------------------

const lockPath = join(HOST_DIR, 'package-lock.json');

if (!existsSync(lockPath)) {
  die(`The host has no package-lock.json, so this build cannot be verified as installed.`);
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
const installed = lock.packages?.[`node_modules/${PLUGIN_NAME}`];

if (!installed) {
  die(`${PLUGIN_NAME} is absent from the host's lockfile after installing it.`);
}

if (installed.integrity !== packed.integrity) {
  die(
    `The host is running a different build.\n` +
      `    packed:    ${packed.integrity}\n` +
      `    installed: ${installed.integrity}`
  );
}

console.log('[INFO] Verified: the host lockfile carries this build’s integrity hash.');

// --- Clear the Vite pre-bundle ----------------------------------------------------------

// Strapi pre-bundles the plugin's admin code into node_modules/.strapi/vite/deps and
// nothing invalidates that cache when the plugin is reinstalled. It fails silently: the
// admin serves the old bundle, so a shipped feature is simply absent from the UI.
if (flags.has('--server-only')) {
  console.log('[INFO] --server-only: left the Vite cache alone.');
} else {
  for (const cache of [
    join(HOST_DIR, 'node_modules/.strapi/vite'),
    join(HOST_DIR, '.strapi/client'),
  ]) {
    rmSync(cache, { recursive: true, force: true });
    console.log(`[INFO] Cleared ${relative(HOST_DIR, cache)}`);
  }
}

// --- What is left for a human ------------------------------------------------------------

console.log(
  '\nNext, in this order — clearing the cache under a running host is not enough:\n' +
    '  1. Restart the host dev server.\n' +
    '  2. Hard-refresh the browser.\n'
);
