import { Initializer } from './components/Initializer';
import { PluginIcon } from './components/PluginIcon';
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
    // The list-view bulk action is registered here by a later slice; the edit-view action is the
    // only surface for now.
    app
      .getPlugin('content-manager')
      .apis.addDocumentAction((actions: unknown[]) => [...actions, TranslateDocumentAction]);
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
