import { useFetchClient } from '@strapi/strapi/admin';
import { useEffect, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export interface ContentTypeInfo {
  uid: string;
  kind: 'collectionType' | 'singleType';
  localized: boolean;
}

/**
 * Cached for the session, and shared between callers.
 *
 * A document action renders on every edit view, for every document. Without this, opening ten
 * entries would mean ten identical requests for a list of content types that cannot change without
 * a server restart.
 */
let cache: ContentTypeInfo[] | null = null;
let inFlight: Promise<ContentTypeInfo[]> | null = null;

/** Test seam, and the escape hatch if a content type is added while the admin stays open. */
export const clearContentTypeCache = () => {
  cache = null;
  inFlight = null;
};

export const useTranslatableContentTypes = () => {
  const { get } = useFetchClient();
  const [contentTypes, setContentTypes] = useState<ContentTypeInfo[] | null>(cache);

  useEffect(() => {
    if (cache) {
      return;
    }

    let active = true;

    inFlight ??= get<{ data: ContentTypeInfo[] }>(`/${PLUGIN_ID}/content-types`)
      .then(({ data }) => {
        cache = data.data;

        return cache;
      })
      .catch(() => {
        // Left uncached, so a transient failure does not permanently hide the action.
        inFlight = null;

        return [];
      });

    inFlight.then((resolved) => {
      if (active) {
        setContentTypes(resolved);
      }
    });

    return () => {
      active = false;
    };
  }, [get]);

  return {
    contentTypes,
    /** Null while unknown, so a caller can tell "not loaded yet" from "not translatable". */
    isTranslatable: (uid?: string): boolean | null => {
      if (!contentTypes) {
        return null;
      }

      return contentTypes.some((entry) => entry.uid === uid && entry.localized);
    },


    /** Localized types only, which is every type either surface can do anything with. */
    translatable: contentTypes?.filter((entry) => entry.localized) ?? null,
  };
};
