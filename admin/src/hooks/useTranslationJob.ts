import { useFetchClient } from '@strapi/strapi/admin';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type ItemStatus = 'pending' | 'translated' | 'skipped' | 'failed';

export interface JobItem {
  documentId: string;
  locale: string;
  status: ItemStatus;
  skippedReason?: string;
  error?: string;
}

export interface Job {
  id: number;
  contentType: string;
  sourceLocale: string;
  targetLocales: string[];
  items: JobItem[];
  status: JobStatus;
  progress: { total: number; done: number; translated: number; skipped: number; failed: number };
}

export interface JobRequest {
  contentType: string;
  sourceLocale: string;
  targetLocales: string[];
  documentIds: string[];
  overwriteDocumentIds?: string[];
  modelId?: number | null;
}

const POLL_INTERVAL_MS = 2000;

const isRunning = (status: JobStatus) => status === 'queued' || status === 'processing';

const errorFrom = (error: unknown, fallback: string): string => {
  const response = (error as { response?: { data?: { error?: { message?: string } } } })?.response;

  return response?.data?.error?.message ?? (error as Error)?.message ?? fallback;
};

/**
 * Starts a translation run and follows it to completion.
 *
 * Polls rather than waits on the request: the server returns a job reference immediately because a
 * real run outlives any safe request timeout. Polling stops as soon as the job reaches a terminal
 * status, so a finished run does not keep making requests.
 */
export const useTranslationJob = () => {
  const { get, post } = useFetchClient();

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Guards against a poll landing after the dialog closed and setting state on a gone component.
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    return () => {
      isMounted.current = false;
    };
  }, []);

  const start = useCallback(
    async (request: JobRequest) => {
      setError(null);
      setIsStarting(true);

      try {
        const { data } = await post<{ data: Job }>(`/${PLUGIN_ID}/jobs`, request);

        if (isMounted.current) {
          setJob(data.data);
        }
      } catch (caught) {
        if (isMounted.current) {
          setError(errorFrom(caught, 'Could not start the translation.'));
        }
      } finally {
        if (isMounted.current) {
          setIsStarting(false);
        }
      }
    },
    [post]
  );

  useEffect(() => {
    if (!job || !isRunning(job.status)) {
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data } = await get<{ data: Job }>(`/${PLUGIN_ID}/jobs/${job.id}`);

        if (isMounted.current) {
          setJob(data.data);
        }
      } catch (caught) {
        if (isMounted.current) {
          setError(errorFrom(caught, 'Lost track of the translation job.'));
        }
      }
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [job, get]);

  return {
    job,
    error,
    isStarting,
    isRunning: job ? isRunning(job.status) : false,
    start,
    reset: () => {
      setJob(null);
      setError(null);
    },
  };
};
