import { useFetchClient } from '@strapi/strapi/admin';
import { useCallback, useEffect, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

import type { JobItem } from './useTranslationJob';
import type { JobDocument } from '../utils/jobEntries';

/** One run in full: the per-item outcomes the list deliberately leaves out. */
export interface JobDetail {
  id: number;
  contentType: string;
  sourceLocale: string;
  targetLocales: string[];
  documents: JobDocument[];
  items: JobItem[];
  progress: { total: number; done: number; translated: number; skipped: number; failed: number };
}

const errorFrom = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { data?: { error?: { message?: string } } } })?.response;

  return response?.data?.error?.message ?? (error as Error)?.message ?? fallback;
};

/**
 * The full record of one run, fetched only when someone opens it.
 *
 * The list sends summaries precisely so a page of twenty runs does not carry every item; this is
 * the other half of that bargain. Nothing is fetched until a row is expanded, and closing it
 * forgets what was fetched rather than holding a growing cache of runs nobody is looking at.
 */
export const useJobDetail = (id: number | null) => {
  const { get, post } = useFetchClient();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const load = useCallback(async () => {
    if (id === null) {
      setJob(null);

      return;
    }

    setIsLoading(true);

    try {
      const { data } = await get<{ data: JobDetail }>(`/${PLUGIN_ID}/jobs/${id}`);

      setJob(data.data);
      setError(null);
    } catch (caught) {
      setError(errorFrom(caught, 'Could not load this run.'));
    } finally {
      setIsLoading(false);
    }
  }, [get, id]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Retries the failed items only — the server decides which those are, and refuses a run that is
   * still going. Successful translations are never repeated, so a retry cannot pay twice for the
   * same output or overwrite a locale someone corrected since.
   */
  const retry = useCallback(async () => {
    if (id === null) {
      return false;
    }

    setIsRetrying(true);

    try {
      await post(`/${PLUGIN_ID}/jobs/${id}/retry`, {});
      await load();
      setError(null);

      return true;
    } catch (caught) {
      setError(errorFrom(caught, 'Could not retry this run.'));

      return false;
    } finally {
      setIsRetrying(false);
    }
  }, [id, load, post]);

  return { job, isLoading, error, isRetrying, retry, refresh: load };
};
