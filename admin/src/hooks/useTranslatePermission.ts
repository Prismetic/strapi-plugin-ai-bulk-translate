import { useRBAC } from '@strapi/strapi/admin';
import { useMemo } from 'react';

import { PLUGIN_ID } from '../pluginId';

/**
 * Whether the current user may translate.
 *
 * Used to hide the action rather than let an editor click something the server will refuse. This is
 * presentation only — the routes are gated independently, and hiding a button has never been a
 * security control.
 */
export const useTranslatePermission = () => {
  const permissions = useMemo(
    () => [{ action: `plugin::${PLUGIN_ID}.translate`, subject: null }],
    []
  );

  const { isLoading, allowedActions } = useRBAC(permissions);

  return {
    isLoading,
    // `useRBAC` names the flag after the action's last segment.
    canTranslate: Boolean(
      (allowedActions as Record<string, boolean> | undefined)?.canTranslate
    ),
  };
};
