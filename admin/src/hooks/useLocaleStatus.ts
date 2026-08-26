import { useFetchClient } from '@strapi/strapi/admin';
import { useCallback, useEffect, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export type LocaleState = 'no-source' | 'empty' | 'has-content';

export interface DocumentLocaleStatus {
  documentId: string;
  title: string;
  locales: Record<string, LocaleState>;
  excluded: boolean;
}

/**
 * Fetches what a run would actually do, for the current selection and chosen locales.
 *
 * Refetched whenever the chosen locales change, and never cached: the point of showing this is that
 * it reflects the database as the editor looks at it. The server re-checks at execution time
 * regardless, because content can appear in between.
 */
export const useLocaleStatus = (
  contentType: string,
  documentIds: string[],
  sourceLocale: string,
  targetLocales: string[]
) => {
  const { post } = useFetchClient();

  const [rows, setRows] = useState<DocumentLocaleStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Joined rather than passed as arrays: a new array literal every render would restart the effect
  // forever.
  const localeKey = targetLocales.join(',');
  const documentKey = documentIds.join(',');

  const load = useCallback(async () => {
    if (targetLocales.length === 0 || documentIds.length === 0) {
      setRows([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data } = await post<{ data: DocumentLocaleStatus[] }>(`/${PLUGIN_ID}/locale-status`, {
        contentType,
        sourceLocale,
        targetLocales,
        documentIds,
      });

      setRows(data.data);
    } catch (caught) {
      const response = (caught as { response?: { data?: { error?: { message?: string } } } })
        ?.response;

      setError(response?.data?.error?.message ?? 'Could not check the target locales.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, sourceLocale, localeKey, documentKey, post]);

  useEffect(() => {
    void load();
  }, [load]);

  // No counts here on purpose. They used to live alongside these rows, and `resolveOutcome` now
  // derives them from the same matrix together with the editor's opt-ins. Two places computing the
  // same arithmetic is how a footer ends up promising work that the confirm button refuses to do.
  return {
    rows,
    isLoading,
    error,
    /** Entries excluded because the source locale has nothing to translate. */
    excluded: rows.filter((row) => row.excluded),
    /** Entries that would be written to at least one locale. */
    translatable: rows.filter((row) => !row.excluded),
  };
};
