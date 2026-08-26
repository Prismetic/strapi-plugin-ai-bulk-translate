/**
 * The permissions this plugin adds to the admin role editor.
 *
 * Three, deliberately, because they answer different questions:
 *
 * - `translate` — may spend API credit and write translations. The editor-facing permission.
 * - `settings.read` — may see which providers and models exist.
 * - `settings.update` — may add, change or remove them, **including API keys**.
 *
 * Splitting read from update is the point of the second and third: a person who needs to pick a
 * model for a run does not need the ability to replace the organisation's credentials.
 *
 * `translate` does *not* imply the right to write any particular content type. That is checked
 * separately against the Content Manager's own permissions when a job is created — see
 * job.controller. A plugin permission that silently granted write access to every content type
 * would be a way around content permissions rather than an addition to them.
 */
export const PLUGIN_NAME = 'ai-bulk-translate';

export const ACTIONS = {
  translate: `plugin::${PLUGIN_NAME}.translate`,
  settingsRead: `plugin::${PLUGIN_NAME}.settings.read`,
  settingsUpdate: `plugin::${PLUGIN_NAME}.settings.update`,
} as const;

export const RBAC_ACTIONS = [
  {
    section: 'plugins',
    pluginName: PLUGIN_NAME,
    displayName: 'Translate content',
    uid: 'translate',
  },
  {
    section: 'settings',
    category: 'AI Bulk Translate',
    subCategory: 'Configuration',
    pluginName: PLUGIN_NAME,
    displayName: 'Read settings',
    uid: 'settings.read',
  },
  {
    section: 'settings',
    category: 'AI Bulk Translate',
    subCategory: 'Configuration',
    pluginName: PLUGIN_NAME,
    displayName: 'Manage providers and keys',
    uid: 'settings.update',
  },
];
