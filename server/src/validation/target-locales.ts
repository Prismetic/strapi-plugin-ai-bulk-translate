/**
 * The two locales a run may never write to, and why they are different rules.
 *
 * The **source** locale is what the run reads from, so translating it into itself is meaningless.
 * That has always been refused here.
 *
 * The **default** locale is the install's source of truth. It is never a target, whatever locale
 * the editor happens to be viewing — otherwise an editor working in `fr` can have a machine
 * overwrite `en`, which is the one copy nothing else can be reconstructed from. The dialog does not
 * offer it either, but this is the guard that survives a direct call, and job creation is where the
 * spend starts.
 *
 * Accepted consequence, confirmed with the reporter: there is deliberately no way to AI-translate
 * *into* the default locale, including to repair a bad default-locale entry from a good
 * translation. An escape hatch here would defeat the point of the rule.
 *
 * Returns the refusal message, or null when the targets are allowed. Pure, so the interesting
 * combinations are testable without a request.
 */
export const rejectTargetLocales = ({
  targetLocales,
  sourceLocale,
  defaultLocale,
}: {
  targetLocales: string[];
  sourceLocale: string;
  /** Null when i18n cannot name a default — the source rule still applies. */
  defaultLocale: string | null;
}): string | null => {
  if (targetLocales.includes(sourceLocale)) {
    return 'The source locale cannot also be a target locale.';
  }

  if (defaultLocale !== null && targetLocales.includes(defaultLocale)) {
    return (
      `"${defaultLocale}" is the default locale, which is the source of truth for this install ` +
      `and is never written by a translation run.`
    );
  }

  return null;
};
