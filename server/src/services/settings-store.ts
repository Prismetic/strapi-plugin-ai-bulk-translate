import { DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPERATURE } from '../config';

import type { Core } from '@strapi/strapi';

/**
 * The translation settings an administrator can change from the settings page.
 *
 * Deliberately small. These two steer every request the plugin makes, and both are things an
 * operator legitimately wants to tune without a redeploy — house tone in the prompt, and how
 * literal the model should be.
 */
export interface TranslationSettings {
  systemPrompt: string;
  temperature: number;
}

const STORE_KEY = 'translation-settings';

/**
 * Persisted overrides layered over configuration.
 *
 * Three layers, in order: the plugin's shipped defaults, whatever the host set in
 * `config/plugins.ts`, then whatever an administrator saved here. Each layer applies *per field*,
 * so saving a prompt does not silently pin the temperature to whatever it happened to be at the
 * time — a whole-object write would freeze a host's later config change out of effect.
 *
 * Stored in `strapi.store` rather than a plugin table: this is one row of key/value settings, not
 * an entity, and core_store is both the idiomatic home for it and already outside the Content
 * Manager. The raw-model convention in `register` is about tables the plugin owns; this is not one.
 */
const settingsStore = ({ strapi }: { strapi: Core.Strapi }) => {
  const store = () => strapi.store({ type: 'plugin', name: 'ai-bulk-translate' });

  const config = <T>(key: string, fallback: T): T =>
    strapi.config.get(`plugin::ai-bulk-translate.${key}`, fallback) as T;

  return {
    /**
     * What `read` would return with nothing saved. Note this is the *configured* default, not the
     * plugin's hardcoded one: a host that set a house prompt in `config/plugins.ts` should get it
     * back when an administrator restores defaults, not have it replaced by the shipped text.
     */
    defaults(): TranslationSettings {
      return {
        systemPrompt: config<string>('systemPrompt', DEFAULT_SYSTEM_PROMPT),
        temperature: config<number>('temperature', DEFAULT_TEMPERATURE),
      };
    },

    /** The values a run should actually use. */
    async read(): Promise<TranslationSettings> {
      const saved = ((await store().get({ key: STORE_KEY })) ?? {}) as Partial<TranslationSettings>;
      const defaults = this.defaults();

      return {
        systemPrompt:
          typeof saved.systemPrompt === 'string' ? saved.systemPrompt : defaults.systemPrompt,
        temperature:
          typeof saved.temperature === 'number' ? saved.temperature : defaults.temperature,
      };
    },

    /**
     * Saves the fields present in `input`, leaving the rest to fall through to configuration.
     * Validation belongs to the caller — see `validation/settings.ts`. Nothing here clamps: a value
     * out of range is a rejected request, not a quietly corrected one.
     */
    async update(input: Partial<TranslationSettings>): Promise<TranslationSettings> {
      const saved = ((await store().get({ key: STORE_KEY })) ?? {}) as Partial<TranslationSettings>;

      const next: Partial<TranslationSettings> = { ...saved };

      if (input.systemPrompt !== undefined) {
        next.systemPrompt = input.systemPrompt;
      }

      if (input.temperature !== undefined) {
        next.temperature = input.temperature;
      }

      await store().set({ key: STORE_KEY, value: next });

      return this.read();
    },

    /**
     * Clears the override rather than writing the defaults back as values. The difference shows up
     * later: a host that changes `config/plugins.ts` after a restore should take effect, which it
     * cannot if the old defaults were frozen into the store as explicit values.
     */
    async restoreDefaults(): Promise<TranslationSettings> {
      await store().delete({ key: STORE_KEY });

      return this.read();
    },
  };
};

export default settingsStore;
