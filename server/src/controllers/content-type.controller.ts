import type { Context } from 'koa';

/**
 * Tells the admin which content types can be translated, and whether each is a collection or a
 * single type.
 *
 * The alternative was inferring internationalization in the browser from whether the open document
 * happens to carry a locale. That works today by coincidence rather than by contract, and it cannot
 * answer the question at all for a content type nobody has opened. The schema is server-side
 * knowledge, so the server answers.
 */
const contentTypeController = {
  async find(ctx: Context) {
    const data = Object.values(strapi.contentTypes)
      .filter((schema) => schema.uid.startsWith('api::'))
      .map((schema) => {
        const options = schema.pluginOptions as { i18n?: { localized?: boolean } } | undefined;

        return {
          uid: schema.uid,
          kind: schema.kind,
          localized: options?.i18n?.localized === true,
        };
      });

    ctx.body = { data };
  },
};

export default contentTypeController;
