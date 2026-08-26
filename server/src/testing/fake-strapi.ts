/**
 * Test-only doubles for the slice of Strapi the plugin's stores and runner touch.
 *
 * Not part of the build — nothing in `server/src/index.ts` reaches it, so it never enters a bundle.
 *
 * The point is to test rules that would otherwise only be exercised by booting Strapi: one default
 * model across an install, what happens to items when one fails, whether progress reaches its
 * total. Those break silently, and a bootstrap per assertion is too slow to run on every commit.
 */
import type { Core } from '@strapi/strapi';

export type FakeRow = Record<string, unknown>;

/**
 * An in-memory `strapi.db.query`, supporting the flat-equality `where` clauses the plugin issues.
 * Deliberately not a general query engine: anything it cannot express is a signal that the code
 * under test has grown a query worth exercising against a real database instead.
 */
export const createFakeDb = (seed: Record<string, FakeRow[]> = {}) => {
  const tables = new Map<string, FakeRow[]>(
    Object.entries(seed).map(([uid, rows]) => [uid, rows.map((row) => ({ ...row }))])
  );

  const rowsFor = (uid: string) => {
    if (!tables.has(uid)) {
      tables.set(uid, []);
    }

    return tables.get(uid)!;
  };

  const matches = (row: FakeRow, where: FakeRow = {}) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  const nextId = (uid: string) =>
    rowsFor(uid).reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1;

  return {
    tables,
    rowsFor,

    query(uid: string) {
      return {
        async findMany({ where }: { where?: FakeRow } = {}) {
          return rowsFor(uid)
            .filter((row) => matches(row, where))
            .map((row) => ({ ...row }));
        },
        async findOne({ where }: { where?: FakeRow } = {}) {
          const found = rowsFor(uid).find((row) => matches(row, where));

          return found ? { ...found } : null;
        },
        async create({ data }: { data: FakeRow }) {
          const row = { id: nextId(uid), ...data };
          rowsFor(uid).push(row);

          return { ...row };
        },
        async update({ where, data }: { where?: FakeRow; data: FakeRow }) {
          const found = rowsFor(uid).find((row) => matches(row, where));

          if (!found) {
            return null;
          }

          Object.assign(found, data);

          return { ...found };
        },
        async updateMany({ where, data }: { where?: FakeRow; data: FakeRow }) {
          const affected = rowsFor(uid).filter((row) => matches(row, where));
          affected.forEach((row) => Object.assign(row, data));

          return { count: affected.length };
        },
        async delete({ where }: { where?: FakeRow } = {}) {
          const rows = rowsFor(uid);
          const index = rows.findIndex((row) => matches(row, where));

          return index === -1 ? null : { ...rows.splice(index, 1)[0] };
        },
        async deleteMany({ where }: { where?: FakeRow } = {}) {
          const rows = rowsFor(uid);
          const removed = rows.filter((row) => matches(row, where));
          removed.forEach((row) => rows.splice(rows.indexOf(row), 1));

          return { count: removed.length };
        },
      };
    },
  };
};

/** A crypto service that round-trips instead of encrypting. What is under test is never the cipher. */
export const fakeCrypto = {
  isAvailable: () => true,
  encrypt: (value: string) => `enc:${value}`,
  decrypt: (cipher: string) => cipher.replace(/^enc:/, ''),
  mask: (cipher: string | null) => (cipher ? '•••' : null),
};

export interface FakeStrapiOptions {
  seed?: Record<string, FakeRow[]>;
  /** Plugin services, by the name callers resolve them under. */
  services?: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface FakeStrapi {
  strapi: Core.Strapi;
  db: ReturnType<typeof createFakeDb>;
  /** Mutable, so a factory can register itself after construction. */
  services: Record<string, unknown>;
  logs: { level: string; message: string }[];
}

export const createFakeStrapi = ({
  seed = {},
  services = {},
  config = {},
}: FakeStrapiOptions = {}): FakeStrapi => {
  const db = createFakeDb(seed);
  const registry: Record<string, unknown> = { crypto: fakeCrypto, ...services };
  const logs: { level: string; message: string }[] = [];
  const log = (level: string) => (message: string) => logs.push({ level, message });

  const strapi = {
    db,
    log: { error: log('error'), warn: log('warn'), info: log('info'), debug: log('debug') },
    config: {
      get: (key: string) => config[key.replace('plugin::ai-bulk-translate.', '')],
    },
    plugin: () => ({ service: (name: string) => registry[name] }),
  } as unknown as Core.Strapi;

  return { strapi, db, services: registry, logs };
};
