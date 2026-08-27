import { useFetchClient } from '@strapi/strapi/admin';
import { useCallback, useEffect, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export interface TranslationSettings {
  systemPrompt: string;
  temperature: number;
}

interface SettingsResponse {
  data: TranslationSettings;
  defaults: TranslationSettings;
}

const errorFrom = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { data?: { error?: { message?: string } } } })?.response;

  return response?.data?.error?.message ?? (error as Error)?.message ?? fallback;
};

/**
 * The admin-editable translation settings, alongside the defaults they would revert to.
 *
 * Defaults come from the server rather than being restated here, because "default" means whatever
 * the host's `config/plugins.ts` says — a copy in the browser would be wrong for any host that
 * configured its own.
 */
export const useSettings = () => {
  const { get, put, post } = useFetchClient();

  const [settings, setSettings] = useState<TranslationSettings | null>(null);
  const [defaults, setDefaults] = useState<TranslationSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apply = (payload: SettingsResponse) => {
    setSettings(payload.data);
    setDefaults(payload.defaults);
  };

  const refresh = useCallback(async () => {
    const { data } = await get<SettingsResponse>(`/${PLUGIN_ID}/settings`);

    apply(data);
    setIsLoading(false);
  }, [get]);

  useEffect(() => {
    refresh().catch(() => setIsLoading(false));
  }, [refresh]);

  /**
   * Server refusals — a temperature out of range, an empty prompt — are the operator's answer to
   * "why did that not save", so they are surfaced rather than thrown past the section. The server
   * rejects rather than clamps, so a refusal means the stored value is unchanged.
   */
  const run = async (action: () => Promise<{ data: SettingsResponse }>, fallback: string) => {
    setError(null);

    try {
      apply((await action()).data);

      return true;
    } catch (caught) {
      setError(errorFrom(caught, fallback));

      return false;
    }
  };

  return {
    settings,
    defaults,
    isLoading,
    error,
    dismissError: () => setError(null),

    save: (payload: Partial<TranslationSettings>) =>
      run(
        () => put<SettingsResponse>(`/${PLUGIN_ID}/settings`, payload),
        'Could not save translation settings'
      ),

    restoreDefaults: () =>
      run(
        () => post<SettingsResponse>(`/${PLUGIN_ID}/settings/restore`),
        'Could not restore the defaults'
      ),
  };
};
