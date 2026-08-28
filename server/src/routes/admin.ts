import { ACTIONS } from '../permissions/actions';

/**
 * Every route is gated. None is reachable by merely being an authenticated administrator, which is
 * what `policies: []` meant while the permissions were still being built.
 *
 * Three levels, matching the three actions:
 *
 * - **translate** — anything that spends API credit or writes a translation, plus the reads a
 *   translation dialog needs to render.
 * - **settings.read** — seeing what is configured.
 * - **settings.update** — changing it, including credentials. Test Connection lives here rather
 *   than under read: it uses a stored key and costs a request.
 *
 * `translate` alone is never enough to write a given content type. Job creation additionally checks
 * the caller's Content Manager permissions for that specific type — see job.controller.
 */
const requires = (...actions: string[]) => ({
  policies: [{ name: 'admin::hasPermissions', config: { actions } }],
});

/** For routes legitimately reachable from two directions. See policies/index.ts. */
const requiresAny = (...actions: string[]) => ({
  policies: [{ name: 'plugin::ai-bulk-translate.has-any-permission', config: { actions } }],
});

export default [
  // Diagnostic. Useful to anyone troubleshooting the plugin from either side.
  {
    method: 'GET',
    path: '/health',
    handler: 'health.check',
    config: requiresAny(ACTIONS.settingsRead, ACTIONS.translate),
  },

  // --- provider connections -------------------------------------------------------------------
  {
    method: 'GET',
    path: '/providers/catalog',
    handler: 'provider.catalog',
    config: requires(ACTIONS.settingsRead),
  },
  { method: 'GET', path: '/providers', handler: 'provider.find', config: requires(ACTIONS.settingsRead) },
  {
    method: 'POST',
    path: '/providers',
    handler: 'provider.create',
    config: requires(ACTIONS.settingsUpdate),
  },
  {
    method: 'PUT',
    path: '/providers/:id',
    handler: 'provider.update',
    config: requires(ACTIONS.settingsUpdate),
  },
  {
    method: 'DELETE',
    path: '/providers/:id',
    handler: 'provider.delete',
    config: requires(ACTIONS.settingsUpdate),
  },
  {
    method: 'POST',
    path: '/providers/:id/test',
    handler: 'provider.test',
    config: requires(ACTIONS.settingsUpdate),
  },

  // --- models ---------------------------------------------------------------------------------
  // Readable by either side: an editor picks a model for a run, an administrator reviews the list.
  {
    method: 'GET',
    path: '/models',
    handler: 'model.find',
    config: requiresAny(ACTIONS.translate, ACTIONS.settingsRead),
  },
  { method: 'POST', path: '/models', handler: 'model.create', config: requires(ACTIONS.settingsUpdate) },
  {
    method: 'PUT',
    path: '/models/:id',
    handler: 'model.update',
    config: requires(ACTIONS.settingsUpdate),
  },
  {
    method: 'DELETE',
    path: '/models/:id',
    handler: 'model.delete',
    config: requires(ACTIONS.settingsUpdate),
  },
  {
    method: 'POST',
    path: '/models/:id/default',
    handler: 'model.setDefault',
    config: requires(ACTIONS.settingsUpdate),
  },

  // --- translation settings -------------------------------------------------------------------
  // Reading is `settings.read` rather than also `translate`: the prompt and temperature are an
  // administrator's concern, and an editor choosing a model for a run never sees them.
  { method: 'GET', path: '/settings', handler: 'settings.find', config: requires(ACTIONS.settingsRead) },
  {
    method: 'PUT',
    path: '/settings',
    handler: 'settings.update',
    config: requires(ACTIONS.settingsUpdate),
  },
  {
    method: 'POST',
    path: '/settings/restore',
    handler: 'settings.restore',
    config: requires(ACTIONS.settingsUpdate),
  },

  // --- what the translate dialog needs to render ----------------------------------------------
  { method: 'GET', path: '/locales', handler: 'locale.find', config: requires(ACTIONS.translate) },
  {
    method: 'GET',
    path: '/content-types',
    handler: 'content-type.find',
    config: requires(ACTIONS.translate),
  },
  {
    method: 'POST',
    path: '/locale-status',
    handler: 'locale-status.find',
    config: requires(ACTIONS.translate),
  },

  // --- runs -----------------------------------------------------------------------------------
  { method: 'POST', path: '/jobs', handler: 'job.create', config: requires(ACTIONS.translate) },
  { method: 'GET', path: '/jobs', handler: 'job.find', config: requires(ACTIONS.translate) },
  { method: 'GET', path: '/jobs/:id', handler: 'job.findOne', config: requires(ACTIONS.translate) },
  {
    method: 'POST',
    path: '/jobs/:id/retry',
    handler: 'job.retry',
    config: requires(ACTIONS.translate),
  },
];
