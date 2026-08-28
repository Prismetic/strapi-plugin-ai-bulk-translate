import type { MonitorConfig } from '../validation/monitor';
import type { Core } from '@strapi/strapi';

const STORE_KEY = 'monitor-config';

/**
 * Which content types translate themselves when their default locale is published.
 *
 * Stored in `strapi.store` rather than a plugin table, for the same reason translation settings
 * are: this is one object of settings per content type, not an entity. The raw-model convention in
 * `register` is about tables the plugin owns, and this is not one.
 *
 * Keyed by content-type uid. A type absent from the map is not monitored — absence is the default,
 * so enabling monitoring is always a deliberate act and a type added to the host later cannot
 * arrive already switched on.
 */
const monitorConfigStore = ({ strapi }: { strapi: Core.Strapi }) => {
  const store = () => strapi.store({ type: 'plugin', name: 'ai-bulk-translate' });

  const readAll = async (): Promise<Record<string, MonitorConfig>> =>
    ((await store().get({ key: STORE_KEY })) as Record<string, MonitorConfig> | null) ?? {};

  return {
    readAll,

    async readOne(contentType: string): Promise<MonitorConfig | null> {
      return (await readAll())[contentType] ?? null;
    },

    /** Only content types that are actually monitored, which is what the publish hook asks for. */
    async monitored(): Promise<Record<string, MonitorConfig>> {
      return Object.fromEntries(
        Object.entries(await readAll()).filter(([, config]) => config.enabled)
      );
    },

    async write(config: MonitorConfig): Promise<MonitorConfig> {
      const all = await readAll();

      await store().set({ key: STORE_KEY, value: { ...all, [config.contentType]: config } });

      return config;
    },
  };
};

export default monitorConfigStore;
