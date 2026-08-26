import { useFetchClient } from '@strapi/strapi/admin';
import { useCallback, useEffect, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export interface RegisteredModel {
  id: number;
  providerId: number;
  /** The identifier the provider expects, e.g. `gpt-5.4-mini`. */
  modelId: string;
  label: string;
  enabled: boolean;
  isDefault: boolean;
  providerLabel: string;
  providerType: string;
  providerEnabled: boolean;
}

export interface ModelPayload {
  providerId: number;
  modelId: string;
  label: string;
  enabled?: boolean;
  isDefault?: boolean;
}

const errorFrom = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { data?: { error?: { message?: string } } } })?.response;

  return response?.data?.error?.message ?? (error as Error)?.message ?? fallback;
};

export const useModels = () => {
  const { get, post, put, del } = useFetchClient();

  const [models, setModels] = useState<RegisteredModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data } = await get<{ data: RegisteredModel[] }>(`/${PLUGIN_ID}/models`);

    setModels(data.data);
    setIsLoading(false);
  }, [get]);

  useEffect(() => {
    refresh().catch(() => setIsLoading(false));
  }, [refresh]);

  /**
   * The store rejects registering under a keyless or disabled connection, and those refusals are
   * the operator's answer to "why can I not add this" — so they are surfaced rather than thrown
   * past the section into a console.
   */
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setError(null);

    try {
      await action();
      await refresh();
    } catch (caught) {
      setError(errorFrom(caught, fallback));
      throw caught;
    }
  };

  return {
    models,
    isLoading,
    error,
    refresh,
    dismissError: () => setError(null),

    async create(payload: ModelPayload) {
      await run(() => post(`/${PLUGIN_ID}/models`, payload), 'Could not register this model.');
    },

    async update(id: number, payload: Partial<ModelPayload>) {
      await run(() => put(`/${PLUGIN_ID}/models/${id}`, payload), 'Could not update this model.');
    },

    async remove(id: number) {
      await run(() => del(`/${PLUGIN_ID}/models/${id}`), 'Could not delete this model.');
    },

    async setDefault(id: number) {
      await run(
        () => post(`/${PLUGIN_ID}/models/${id}/default`, {}),
        'Could not set the default model.'
      );
    },
  };
};
