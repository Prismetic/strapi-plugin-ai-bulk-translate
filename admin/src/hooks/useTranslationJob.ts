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
  /** The page path this locale was written to, where the content type has one. */
  targetPath?: string | null;
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
  /** Which surface started the run. Recorded on the job for audit; grants nothing. */
  origin?: 'document' | 'bulk';
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

  /**
   * Re-runs only the failed items of a finished run.
   *
   * Reuses the same job rather than starting a new one, so the run keeps a single audit record and
   * the successful items are visibly untouched rather than silently repeated.
   */
  const retry = useCallback(async () => {
    if (!job) {
      return;
    }

    setError(null);
    setIsStarting(true);

    try {
      const { data } = await post<{ data: Job }>(`/${PLUGIN_ID}/jobs/${job.id}/retry`, {});

      if (isMounted.current) {
        setJob(data.data);
      }
    } catch (caught) {
      if (isMounted.current) {
        setError(errorFrom(caught, 'Could not retry the failed items.'));
      }
    } finally {
      if (isMounted.current) {
        setIsStarting(false);
      }
    }
  }, [job, post]);

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
    /** How many items failed, so a caller can offer a retry only when there is something to retry. */
    failedCount: job?.progress.failed ?? 0,
    start,
    retry,
    reset: () => {
      setJob(null);
      setError(null);
    },
  };
};
