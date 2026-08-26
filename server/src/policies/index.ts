import type { Context } from 'koa';

/**
 * Allows a request when the caller holds **any** of the listed actions.
 *
 * Strapi's own `admin::hasPermissions` requires every action in its list — its handler is
 * `permissions.every(...)`. That is the right default, but a few routes are legitimately reachable
 * from two directions: reading the model list, for instance, is needed both by an editor choosing a
 * model for a run and by an administrator looking at the settings page. Requiring both would force
 * every settings administrator to also hold `translate`, which is exactly the over-granting this
 * slice exists to prevent.
 *
 * Used sparingly, and never for a route that writes.
 */
const hasAnyPermission = (ctx: Context, config: { actions?: string[] }) => {
  const ability = ctx.state?.userAbility as { can: (action: string) => boolean } | undefined;

  if (!ability) {
    return false;
  }

  return (config.actions ?? []).some((action) => ability.can(action));
};

export default {
  'has-any-permission': hasAnyPermission,
};
