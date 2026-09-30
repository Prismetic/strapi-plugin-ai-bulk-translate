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

export interface LocaleStatusOptions {
  /**
   * Whether the server can find the entry when the admin sends no identifier — true for a single
   * type, whose edit view has none in its route. Without this, an empty selection is treated as
   * nothing to ask about.
   */
  resolvesEntryServerSide?: boolean;
}

/**
 * Fetches what a run would actually do, for the current selection and chosen locales.
 *
 * Refetched whenever the chosen locales change, and never cached: the point of showing this is that
 * it reflects the database as the editor looks at it. The server re-checks at execution time
 * regardless, because content can appear in between.
 *
 * `loaded` says whether `rows` is an answer. It is distinct from `rows.length`: an answer can be
 * empty, and "nothing came back yet" must not read as "nothing will happen" — nor the reverse,
 * which is how a preview that was never requested left the confirm button live.
 */
export const useLocaleStatus = (
  contentType: string,
  documentIds: string[],
  sourceLocale: string,
  targetLocales: string[],
  { resolvesEntryServerSide = false }: LocaleStatusOptions = {}
) => {
  const { post } = useFetchClient();

  const [rows, setRows] = useState<DocumentLocaleStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Joined rather than passed as arrays: a new array literal every render would restart the effect
  // forever.
  const localeKey = targetLocales.join(',');
  const documentKey = documentIds.join(',');

  const load = useCallback(async () => {
    setLoaded(false);

    if (targetLocales.length === 0 || (documentIds.length === 0 && !resolvesEntryServerSide)) {
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
        // Left out rather than sent empty, so the server resolves the entry itself.
        ...(documentIds.length > 0 ? { documentIds } : {}),
      });

      setRows(data.data);
      setLoaded(true);
    } catch (caught) {
      const response = (caught as { response?: { data?: { error?: { message?: string } } } })
        ?.response;

      setError(response?.data?.error?.message ?? 'Could not check the target locales.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentType, sourceLocale, localeKey, documentKey, resolvesEntryServerSide, post]);

  useEffect(() => {
    void load();
  }, [load]);

  // No counts here on purpose. They used to live alongside these rows, and `resolveOutcome` now
  // derives them from the same matrix together with the editor's opt-ins. Two places computing the
  // same arithmetic is how a footer ends up promising work that the confirm button refuses to do.
  return {
    rows,
    isLoading,
    /** True once `rows` is the server's answer for the current inputs; false while pending or failed. */
    loaded,
    error,
    /** Entries excluded because the source locale has nothing to translate. */
    excluded: rows.filter((row) => row.excluded),
    /** Entries that would be written to at least one locale. */
    translatable: rows.filter((row) => !row.excluded),
  };
};
