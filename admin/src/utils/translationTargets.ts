import type { Locale } from '../hooks/useLocales';

/**
 * The locales the dialog may offer as targets.
 *
 * Two exclusions, for different reasons. The **source** locale is what the run reads from, so
 * offering it as a target is meaningless. The **default** locale is the install's source of truth
 * and is withheld whatever locale the editor is viewing — an editor working in `fr` was previously
 * offered `en`, which is the one copy nothing else can be reconstructed from.
 *
 * Withholding it here is presentation; `rejectTargetLocales` on the server is the enforcement.
 *
 * When this leaves nothing, the dialog already has something to say: the existing
 * `no-target-locales` reason explains the disabled button, so an editor whose only other locale is
 * the default gets a sentence rather than an empty list.
 */
export const translationTargets = (locales: Locale[], sourceLocale: string): Locale[] =>
  locales.filter((locale) => locale.code !== sourceLocale && !locale.isDefault);
