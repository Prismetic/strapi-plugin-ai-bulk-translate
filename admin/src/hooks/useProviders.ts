import { useFetchClient } from '@strapi/strapi/admin';
import { useCallback, useEffect, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export interface ProviderDefinition {
  type: string;
  label: string;
  requiresApiKey: boolean;
  fields: { name: string; label: string; required: boolean; placeholder?: string; hint?: string }[];
  baseUrl: { required: boolean; hint: string };
}

export interface Provider {
  id: number;
  type: string;
  label: string;
  baseUrl: string | null;
  config: Record<string, unknown> | null;
  enabled: boolean;
  hasApiKey: boolean;
  /** Never the real key — the server masks before responding. */
  maskedApiKey: string | null;
}

export interface ProviderPayload {
  type: string;
  label: string;
  baseUrl?: string | null;
  /** Omit to keep the stored key; empty string clears it. */
  apiKey?: string | null;
  config?: Record<string, unknown> | null;
  enabled?: boolean;
}

const errorFrom = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { data?: { error?: { message?: string } } } })?.response;

  return response?.data?.error?.message ?? (error as Error)?.message ?? fallback;
};

export const useProviders = () => {
  const { get, post, put, del } = useFetchClient();

  const [providers, setProviders] = useState<Provider[]>([]);
  const [catalog, setCatalog] = useState<ProviderDefinition[]>([]);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [list, meta] = await Promise.all([
      get<{ data: Provider[] }>(`/${PLUGIN_ID}/providers`),
      get<{ providers: ProviderDefinition[]; encryptionAvailable: boolean }>(
        `/${PLUGIN_ID}/providers/catalog`
      ),
    ]);

    setProviders(list.data.data);
    setCatalog(meta.data.providers);
    setEncryptionAvailable(meta.data.encryptionAvailable);
    setIsLoading(false);
  }, [get]);

  useEffect(() => {
    refresh().catch(() => setIsLoading(false));
  }, [refresh]);

  return {
    providers,
    catalog,
    encryptionAvailable,
    isLoading,
    refresh,

    async create(payload: ProviderPayload) {
      await post(`/${PLUGIN_ID}/providers`, payload);
      await refresh();
    },

    async update(id: number, payload: Partial<ProviderPayload>) {
      await put(`/${PLUGIN_ID}/providers/${id}`, payload);
      await refresh();
    },

    async remove(id: number) {
      await del(`/${PLUGIN_ID}/providers/${id}`);
      await refresh();
    },

    async test(id: number, modelId: string): Promise<{ ok: boolean; message: string }> {
      try {
        const { data } = await post<{ ok: boolean; message: string }>(
          `/${PLUGIN_ID}/providers/${id}/test`,
          { modelId }
        );

        return data;
      } catch (error) {
        return { ok: false, message: errorFrom(error, 'Test failed') };
      }
    },
  };
};
