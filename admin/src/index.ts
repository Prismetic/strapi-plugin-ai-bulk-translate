import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';
import { TranslateBulkAction } from './components/translate/TranslateBulkAction';
import { TranslateEditViewButton } from './components/translate/TranslateEditViewButton';
import { PLUGIN_ID } from './pluginId';

export default {
  register(app: any) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${PLUGIN_ID}.plugin.name`,
        defaultMessage: 'AI Bulk Translate',
      },
      Component: async () => {
        const { App } = await import('./pages/App');

        return App;
      },
    });

    app.registerPlugin({
      id: PLUGIN_ID,
      initializer: Initializer,
      isReady: false,
      name: PLUGIN_ID,
    });
  },

  bootstrap(app: any) {
    const contentManager = app.getPlugin('content-manager');

    /**
     * Edit view: collection types and single types.
     *
     * Injected rather than registered as a document action. Strapi gives real buttons to only the
     * first two `position: ['panel']` actions and Publish and Save take both, so a document action
     * is always in the overflow menu. This zone renders directly below them, in the same panel.
     */
    contentManager.injectComponent('editView', 'right-links', {
      name: 'ai-bulk-translate-edit-view-button',
      Component: TranslateEditViewButton,
    });

    // List view: collection types only — single types have no list view.
    contentManager.apis.addBulkAction((actions: unknown[]) => [...actions, TranslateBulkAction]);
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map(async (locale) => {
        try {
          const { default: data } = await import(`./translations/${locale}.json`);

          return { data, locale };
        } catch {
          return { data: {}, locale };
        }
      })
    );
  },
};
