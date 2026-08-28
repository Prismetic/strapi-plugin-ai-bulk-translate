import type { MonitorConfig } from '../validation/monitor';

/** The parts of a document-service middleware context this decision needs. */
export interface TriggerContext {
  action: string;
  uid: string;
  params?: { documentId?: string; locale?: string | null };
}

export interface MonitoredRun {
  contentType: string;
  documentId: string;
  sourceLocale: string;
  targetLocales: string[];
}

/**
 * Whether a document-service call should start a monitored translation, and of what.
 *
 * Pure, and separate from the middleware on purpose. The middleware runs on **every** document
 * action in the host — every find, every update, monitored or not — so the part that decides has to
 * be cheap to reason about and cheap to test. Every rule below is a case in the test file rather
 * than a condition someone has to trace through a request.
 *
 * Four things make it say no, and they are not the same kind of no:
 *
 * - **Not a publish.** Saving a draft is a different action; publishing is the "I am done" signal.
 * - **Not monitored.** The common case, and the one that must cost almost nothing.
 * - **Not the default locale.** This is the structural guarantee that monitoring cannot feed
 *   itself: only the source of truth drives it, so promoting a translation does nothing. Combined
 *   with the plugin only ever writing drafts, a monitored run cannot cause another.
 * - **Nothing to do.** No document, no default locale to reason about, or no targets configured.
 *
 * A publish of `locale: '*'` is one publish of the source of truth, not many: it yields a single
 * run for the default locale rather than one per locale.
 */
export const triggeredRun = (
  ctx: TriggerContext,
  monitored: Record<string, MonitorConfig>,
  defaultLocale: string | null
): MonitoredRun | null => {
  if (ctx.action !== 'publish') {
    return null;
  }

  const config = monitored[ctx.uid];

  if (!config?.enabled || defaultLocale === null) {
    return null;
  }

  const documentId = ctx.params?.documentId;

  if (!documentId) {
    return null;
  }

  // Absent or '*' both mean "the whole document", which includes the locale that drives monitoring.
  const locale = ctx.params?.locale ?? '*';

  if (locale !== '*' && locale !== defaultLocale) {
    return null;
  }

  // Filtered again rather than trusted: saving the configuration refuses the default locale as a
  // target, but this is the guard that runs with nobody watching.
  const targetLocales = config.locales
    .map((target) => target.code)
    .filter((code) => code !== defaultLocale);

  if (targetLocales.length === 0) {
    return null;
  }

  return { contentType: ctx.uid, documentId, sourceLocale: defaultLocale, targetLocales };
};
