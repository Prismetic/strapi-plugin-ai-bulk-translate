import { useFetchClient } from '@strapi/strapi/admin';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type JobOrigin = 'document' | 'bulk' | 'monitor';

/** A run as the list shows it. Per-item detail is fetched separately when a run is opened. */
export interface JobSummary {
  id: number;
  origin: JobOrigin;
  contentType: string;
  sourceLocale: string;
  targetLocales: string[];
  status: JobStatus;
  documentCount: number;
  modelId: number | null;
  createdById: number | null;
  /** Null when the account that started the run no longer exists, or when nothing started it. */
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  progress: {
    total: number;
    done: number;
    translated: number;
    skipped: number;
    failed: number;
  };
}

export interface JobsMeta {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

/** Runs in one of these are still moving, so the list has a reason to keep asking. */
const ACTIVE: JobStatus[] = ['queued', 'processing'];

/** What the tab opens on: everything a person might act on. Mirrors the server default. */
export const NEEDS_ATTENTION: JobStatus[] = ['queued', 'processing', 'failed'];

const POLL_INTERVAL_MS = 3000;

export const isActive = (jobs: Pick<JobSummary, 'status'>[]): boolean =>
  jobs.some((job) => ACTIVE.includes(job.status));

/**
 * A page of runs, refreshed while any of them is still moving.
 *
 * Polling is conditional rather than constant: a tab left open on a quiet list should not ask the
 * server anything, and one watching a bulk run should not need a manual refresh. The dialog's own
 * progress view already works this way, and this follows it rather than inventing a second rhythm.
 */
export const useJobs = ({ statuses, page }: { statuses: JobStatus[]; page: number }) => {
  const { get } = useFetchClient();

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [meta, setMeta] = useState<JobsMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kept in a ref so the polling effect does not restart on every response.
  const active = useRef(false);

  const key = statuses.join(',');

  const refresh = useCallback(async () => {
    try {
      const { data } = await get<{ data: JobSummary[]; meta: JobsMeta }>(
        `/${PLUGIN_ID}/jobs?status=${encodeURIComponent(key)}&page=${page}`
      );

      setJobs(data.data);
      setMeta(data.meta);
      active.current = isActive(data.data);
      setError(null);
    } catch (caught) {
      const response = (caught as { response?: { data?: { error?: { message?: string } } } })
        ?.response;

      setError(response?.data?.error?.message ?? 'Could not load translation runs.');
      // A failed poll must not leave the list polling forever against a broken endpoint.
      active.current = false;
    } finally {
      setIsLoading(false);
    }
  }, [get, key, page]);

  useEffect(() => {
    setIsLoading(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (active.current) {
        refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [refresh]);

  return { jobs, meta, isLoading, error, refresh };
};
