import { describe, expect, it } from 'vitest';

import { DEFAULT_SYSTEM_PROMPT } from '../config';
import { createFakeStrapi } from '../testing/fake-strapi';
import settingsStore from './settings-store';

const store = (options: Parameters<typeof createFakeStrapi>[0] = {}) => {
  const fake = createFakeStrapi(options);

  return { ...fake, settings: settingsStore({ strapi: fake.strapi }) };
};

describe('settings-store', () => {
  it('falls back to the shipped defaults when nothing has been saved', async () => {
    const { settings } = store();

    expect(await settings.read()).toEqual({
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      temperature: 0.2,
    });
  });

  it("honours the host's config/plugins.ts as the default, rather than the plugin's own", async () => {
    // The convention this protects: configuration is read through `strapi.config.get` at call time
    // precisely so a host can set it. A store that ignored config would silently override the host.
    const { settings } = store({ config: { systemPrompt: 'Host prompt', temperature: 0.9 } });

    expect(await settings.read()).toEqual({ systemPrompt: 'Host prompt', temperature: 0.9 });
  });

  it('returns what was saved', async () => {
    const { settings } = store();

    await settings.update({ systemPrompt: 'Be terse.', temperature: 1.4 });

    expect(await settings.read()).toEqual({ systemPrompt: 'Be terse.', temperature: 1.4 });
  });

  it('layers per field, so saving one leaves the other on its default', async () => {
    const { settings } = store({ config: { temperature: 0.7 } });

    await settings.update({ systemPrompt: 'Be terse.' });

    expect(await settings.read()).toEqual({
      systemPrompt: 'Be terse.',
      temperature: 0.7,
    });
  });

  it('survives a restart — the value is persisted, not held in the closure', async () => {
    const first = store();
    await first.settings.update({ temperature: 1.1 });

    // Same backing store, a new service instance: what a restart looks like from here.
    const second = settingsStore({ strapi: first.strapi });

    expect((await second.read()).temperature).toBe(1.1);
  });

  it('restores defaults by clearing the override, so the host config governs again', async () => {
    const { settings } = store({ config: { temperature: 0.7 } });

    await settings.update({ systemPrompt: 'Be terse.', temperature: 1.4 });
    const restored = await settings.restoreDefaults();

    expect(restored).toEqual({ systemPrompt: DEFAULT_SYSTEM_PROMPT, temperature: 0.7 });
    expect(await settings.read()).toEqual(restored);
  });
});
