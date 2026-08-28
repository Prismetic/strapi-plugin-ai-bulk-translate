import { useFetchClient } from '@strapi/strapi/admin';
import { useCallback, useEffect, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export interface MonitorLocale {
  code: string;
  overwriteContent: boolean;
  overwriteManualEdits: boolean;
}

export interface MonitorConfig {
  contentType: string;
  enabled: boolean;
  locales: MonitorLocale[];
}

const errorFrom = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { data?: { error?: { message?: string } } } })?.response;

  return response?.data?.error?.message ?? (error as Error)?.message ?? fallback;
};

/**
 * Which content types translate themselves on publish, keyed by content-type uid.
 *
 * A type absent from the map is not monitored. Saving is per content type rather than
 * all-at-once: the payloads stay small, and one type's invalid configuration cannot block saving
 * another's.
 */
export const useMonitorConfig = () => {
  const { get, put } = useFetchClient();

  const [configs, setConfigs] = useState<Record<string, MonitorConfig>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await get<{ data: Record<string, MonitorConfig> }>(
        `/${PLUGIN_ID}/monitor-config`
      );

      setConfigs(data.data);
      setError(null);
    } catch (caught) {
      setError(errorFrom(caught, 'Could not load monitoring configuration.'));
    } finally {
      setIsLoading(false);
    }
  }, [get]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (config: MonitorConfig) => {
      try {
        const { data } = await put<{ data: MonitorConfig }>(`/${PLUGIN_ID}/monitor-config`, config);

        setConfigs((current) => ({ ...current, [config.contentType]: data.data }));
        setError(null);

        return true;
      } catch (caught) {
        setError(errorFrom(caught, 'Could not save monitoring configuration.'));

        return false;
      }
    },
    [put]
  );

  return { configs, isLoading, error, refresh, save };
};
