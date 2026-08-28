import type { MonitorLocale } from '../hooks/useMonitorConfig';

/**
 * Edits to a monitored type's locale list, with the nesting rule enforced in one place.
 *
 * **Overwrite manual edits cannot be set without Overwrite content.** The interface disables the
 * control, and the server refuses the combination, but neither is where the invariant should live
 * for the browser: a disabled checkbox does not stop the parent being unticked *after* the child
 * was ticked, which is exactly how an impossible state gets saved.
 *
 * Applying it here means the state can never hold the combination, whatever order the controls are
 * pressed in.
 */
const normalise = (locale: MonitorLocale): MonitorLocale =>
  locale.overwriteContent ? locale : { ...locale, overwriteManualEdits: false };

/** Adds a locale to the monitored set, or removes it. Its policy resets when it is removed. */
export const toggleLocale = (locales: MonitorLocale[], code: string): MonitorLocale[] =>
  locales.some((locale) => locale.code === code)
    ? locales.filter((locale) => locale.code !== code)
    : [...locales, { code, overwriteContent: false, overwriteManualEdits: false }];

export const patchLocale = (
  locales: MonitorLocale[],
  code: string,
  patch: Partial<Omit<MonitorLocale, 'code'>>
): MonitorLocale[] =>
  locales.map((locale) => (locale.code === code ? normalise({ ...locale, ...patch }) : locale));

export const localeIn = (locales: MonitorLocale[], code: string): MonitorLocale | undefined =>
  locales.find((locale) => locale.code === code);
