import { useFetchClient } from '@strapi/strapi/admin';
import { useEffect, useState } from 'react';

import { PLUGIN_ID } from '../pluginId';

export interface Locale {
  code: string;
  name: string;
  isDefault: boolean;
}

/**
 * The host's configured locales, served by the plugin's own route rather than read out of the i18n
 * plugin's admin state — depending on another plugin's internals would break without notice.
 */
export const useLocales = () => {
  const { get } = useFetchClient();

  const [locales, setLocales] = useState<Locale[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    get<{ data: Locale[] }>(`/${PLUGIN_ID}/locales`)
      .then(({ data }) => {
        if (active) {
          setLocales(data.data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [get]);

  return { locales, isLoading };
};
