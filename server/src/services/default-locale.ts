import type { Core } from '@strapi/strapi';

/**
 * The install's default locale code, or null when there is not one to be had.
 *
 * **Do not read `isDefault` off `locales.find()`.** That method returns raw rows and does not carry
 * the flag; i18n's own controller decorates them afterwards with `setIsDefault`, because the default
 * lives in the core store rather than on the locale row. Reading `isDefault` from `find()` compiles,
 * typechecks, and answers `false` for every locale — silently. It shipped once and cost the default
 * locale both its guards at the same time: the dialog offered it as a target, and the server-side
 * refusal never fired because no default could be named.
 *
 * `getDefaultLocale()` reads the core store directly, which is where the answer actually is.
 *
 * A host without i18n is not an error here. The caller decides what to do with null — for target
 * locales, the source rule still applies and the default rule simply cannot.
 */
export const defaultLocaleCode = async (strapiInstance: Core.Strapi): Promise<string | null> => {
  try {
    const code = await strapiInstance.plugin('i18n').service('locales').getDefaultLocale();

    return typeof code === 'string' && code.length > 0 ? code : null;
  } catch {
    return null;
  }
};
