import { beforeEach, describe, expect, it } from 'vitest';

import { MODEL_UID, PROVIDER_UID } from '../models';
import modelStore from './model-store';
import providerStore from './provider-store';

import type { Core } from '@strapi/strapi';

/**
 * An in-memory stand-in for `strapi.db.query`, supporting only the flat-equality `where` clauses
 * these stores actually issue.
 *
 * The invariants under test — one default across the install, and what happens to models when
 * their connection goes away — are exactly the kind that break silently, so they are worth testing
 * without a Strapi bootstrap rather than not at all.
 */
const createFakeDb = (seed: Record<string, Record<string, unknown>[]>) => {
  const tables = new Map<string, Record<string, unknown>[]>(
    Object.entries(seed).map(([uid, rows]) => [uid, rows.map((row) => ({ ...row }))])
  );

  const rowsFor = (uid: string) => {
    if (!tables.has(uid)) {
      tables.set(uid, []);
    }

    return tables.get(uid)!;
  };

  const matches = (row: Record<string, unknown>, where: Record<string, unknown> = {}) =>
    Object.entries(where).every(([key, value]) => row[key] === value);

  const nextId = (uid: string) =>
    rowsFor(uid).reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1;

  return {
    tables,

    query(uid: string) {
      return {
        async findMany({ where }: { where?: Record<string, unknown> } = {}) {
          return rowsFor(uid)
            .filter((row) => matches(row, where))
            .map((row) => ({ ...row }));
        },
        async findOne({ where }: { where?: Record<string, unknown> } = {}) {
          const found = rowsFor(uid).find((row) => matches(row, where));

          return found ? { ...found } : null;
        },
        async create({ data }: { data: Record<string, unknown> }) {
          const row = { id: nextId(uid), ...data };
          rowsFor(uid).push(row);

          return { ...row };
        },
        async update({
          where,
          data,
        }: {
          where?: Record<string, unknown>;
          data: Record<string, unknown>;
        }) {
          const found = rowsFor(uid).find((row) => matches(row, where));

          if (!found) {
            return null;
          }

          Object.assign(found, data);

          return { ...found };
        },
        async updateMany({
          where,
          data,
        }: {
          where?: Record<string, unknown>;
          data: Record<string, unknown>;
        }) {
          const affected = rowsFor(uid).filter((row) => matches(row, where));
          affected.forEach((row) => Object.assign(row, data));

          return { count: affected.length };
        },
        async delete({ where }: { where?: Record<string, unknown> } = {}) {
          const rows = rowsFor(uid);
          const index = rows.findIndex((row) => matches(row, where));

          return index === -1 ? null : { ...rows.splice(index, 1)[0] };
        },
        async deleteMany({ where }: { where?: Record<string, unknown> } = {}) {
          const rows = rowsFor(uid);
          const removed = rows.filter((row) => matches(row, where));
          removed.forEach((row) => rows.splice(rows.indexOf(row), 1));

          return { count: removed.length };
        },
      };
    },
  };
};

interface Harness {
  models: ReturnType<typeof modelStore>;
  providers: ReturnType<typeof providerStore>;
  db: ReturnType<typeof createFakeDb>;
}

/**
 * Wires the two stores against the fake database, with a crypto service that round-trips rather
 * than encrypting. What is being tested here is the registry's rules, not `admin::encryption`.
 */
const createHarness = (seed: Record<string, Record<string, unknown>[]> = {}): Harness => {
  const db = createFakeDb(seed);
  const services: Record<string, unknown> = {};

  const strapi = {
    db,
    plugin: () => ({ service: (name: string) => services[name] }),
  } as unknown as Core.Strapi;

  services.crypto = {
    isAvailable: () => true,
    encrypt: (value: string) => `enc:${value}`,
    decrypt: (cipher: string) => cipher.replace(/^enc:/, ''),
    mask: (cipher: string | null) => (cipher ? '•••' : null),
  };

  const providers = providerStore({ strapi });
  const models = modelStore({ strapi });

  services['provider-store'] = providers;
  services['model-store'] = models;

  return { models, providers, db };
};

const openaiProvider = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  type: 'openai',
  label: 'OpenAI production',
  baseUrl: null,
  apiKeyEncrypted: 'enc:sk-test',
  config: {},
  enabled: true,
  ...overrides,
});

describe('model-store', () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness({
      [PROVIDER_UID]: [openaiProvider(), openaiProvider({ id: 2, label: 'OpenAI staging' })],
      [MODEL_UID]: [],
    });
  });

  it('clears the previous default when a new model is marked default', async () => {
    const first = await harness.models.create({
      providerId: 1,
      modelId: 'gpt-5.4-mini',
      label: 'Mini',
      isDefault: true,
    });
    const second = await harness.models.create({
      providerId: 2,
      modelId: 'gpt-5.4',
      label: 'Full',
      isDefault: true,
    });

    const all = await harness.models.findAll();

    expect(all.find((model) => model.id === first.id)?.isDefault).toBe(false);
    expect(all.find((model) => model.id === second.id)?.isDefault).toBe(true);
    expect(all.filter((model) => model.isDefault)).toHaveLength(1);
  });

  it('disables a connection`s models and clears its default when the connection is disabled', async () => {
    const kept = await harness.models.create({
      providerId: 2,
      modelId: 'gpt-5.4',
      label: 'Staging full',
    });
    const cascaded = await harness.models.create({
      providerId: 1,
      modelId: 'gpt-5.4-mini',
      label: 'Mini',
      isDefault: true,
    });

    await harness.providers.update(1, { enabled: false });

    const all = await harness.models.findAll();
    const after = all.find((model) => model.id === cascaded.id);

    expect(after?.enabled).toBe(false);
    expect(after?.isDefault).toBe(false);
    expect(all.find((model) => model.id === kept.id)?.enabled).toBe(true);
    expect(await harness.models.resolveDefault()).toBeNull();
  });

  it('removes a connection`s models when the connection is deleted', async () => {
    await harness.models.create({ providerId: 1, modelId: 'gpt-5.4-mini', label: 'Mini' });
    await harness.models.create({ providerId: 2, modelId: 'gpt-5.4', label: 'Full' });

    await harness.providers.delete(1);

    const all = await harness.models.findAll();

    expect(all).toHaveLength(1);
    expect(all[0].providerId).toBe(2);
  });

  it('refuses to register a model under a connection with no key', async () => {
    const keyless = createHarness({
      [PROVIDER_UID]: [openaiProvider({ apiKeyEncrypted: null })],
      [MODEL_UID]: [],
    });

    await expect(
      keyless.models.create({ providerId: 1, modelId: 'gpt-5.4-mini', label: 'Mini' })
    ).rejects.toThrow(/no API key stored/);
  });

  it('refuses to register a model under a disabled connection', async () => {
    const off = createHarness({
      [PROVIDER_UID]: [openaiProvider({ enabled: false })],
      [MODEL_UID]: [],
    });

    await expect(
      off.models.create({ providerId: 1, modelId: 'gpt-5.4-mini', label: 'Mini' })
    ).rejects.toThrow(/is disabled/);
  });

  it('allows a keyless connection when its provider type needs no key', async () => {
    const ollama = createHarness({
      [PROVIDER_UID]: [
        openaiProvider({
          type: 'openai-compatible',
          label: 'Local Ollama',
          baseUrl: 'http://localhost:11434/v1',
          apiKeyEncrypted: null,
        }),
      ],
      [MODEL_UID]: [],
    });

    const model = await ollama.models.create({
      providerId: 1,
      modelId: 'llama3.3',
      label: 'Llama',
    });

    expect(model.enabled).toBe(true);
  });

  it('clears the default flag when the default model is disabled', async () => {
    const model = await harness.models.create({
      providerId: 1,
      modelId: 'gpt-5.4-mini',
      label: 'Mini',
      isDefault: true,
    });

    const updated = await harness.models.update(model.id, { enabled: false });

    expect(updated.isDefault).toBe(false);
    expect(await harness.models.resolveDefault()).toBeNull();
  });

  it('resolves the default model together with the connection that can call it', async () => {
    await harness.models.create({ providerId: 2, modelId: 'gpt-5.4', label: 'Full' });
    await harness.models.create({
      providerId: 1,
      modelId: 'gpt-5.4-mini',
      label: 'Mini',
      isDefault: true,
    });

    const resolved = await harness.models.resolveDefault();

    expect(resolved?.model.modelId).toBe('gpt-5.4-mini');
    expect(resolved?.provider.label).toBe('OpenAI production');
  });
});
