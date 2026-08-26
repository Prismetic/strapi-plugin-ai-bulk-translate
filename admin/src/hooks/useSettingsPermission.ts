import { useRBAC } from '@strapi/strapi/admin';
import { useMemo } from 'react';

import { PLUGIN_ID } from '../pluginId';

/**
 * Whether the current user may change provider and model configuration.
 *
 * Deliberately keyed to `settings.update` rather than `settings.read`: read is what grants sight of
 * the page at all, and someone who needs to see which models exist has no business replacing the
 * organisation's credentials.
 *
 * Used to hide the write controls rather than let a read-only administrator open a dialog, fill it
 * in and meet Strapi's bare "Policy Failed" on save. This is presentation only — the routes are
 * gated independently in `routes/admin.ts`, and hiding a button has never been a security control.
 */
export const useSettingsPermission = () => {
  const permissions = useMemo(
    () => [{ action: `plugin::${PLUGIN_ID}.settings.update`, subject: null }],
    []
  );

  const { isLoading, allowedActions } = useRBAC(permissions);

  return {
    isLoading,
    // `useRBAC` names the flag after the action's *last* dot-segment, so `settings.update` becomes
    // `canUpdate`, not `canSettingsUpdate`. Guessing wrong fails closed and silently — it would hide
    // the controls from everyone, including those who hold the permission.
    canManage: Boolean((allowedActions as Record<string, boolean> | undefined)?.canUpdate),
  };
};
