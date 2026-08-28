/**
 * How a locale is named in the interface.
 *
 * The name as i18n holds it, and nothing else. That name is the administrator's own label and is
 * what every other part of the admin shows, so adding to it makes this plugin the odd one out.
 *
 * It usually already carries a parenthetical — "Arabic (ar)" — and appending the code to that
 * produced "Arabic (ar) (ar)" in both the translation dialog and the monitoring section. Stripping
 * the parenthetical instead would be no better: `zh-CN` is named "Chinese (cn)", so what looks like
 * a code often is not one.
 */
export const localeLabel = (locale: { code: string; name?: string }): string =>
  locale.name?.trim() || locale.code;
