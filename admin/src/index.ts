import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';
import { TranslateBulkAction } from './components/translate/TranslateBulkAction';
import { TranslateDocumentAction } from './components/translate/TranslateDocumentAction';
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
    const contentManager = app.getPlugin('content-manager').apis;

    // Edit view: collection types and single types.
    contentManager.addDocumentAction((actions: unknown[]) => [...actions, TranslateDocumentAction]);

    // List view: collection types only — single types have no list view.
    contentManager.addBulkAction((actions: unknown[]) => [...actions, TranslateBulkAction]);
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
