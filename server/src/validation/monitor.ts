import { z } from 'zod';

/**
 * What a monitored content type does when its default locale is published.
 *
 * The overwrite rule is a two-level opt-in, and the nesting is the whole point. Two independent
 * booleans would permit "overwrite nothing, but overwrite hand-edited things", which means nothing;
 * the second is refused unless the first is set. The interface disables the control, but a disabled
 * control is presentation — this is the enforcement, and it is what a direct call meets.
 *
 * Both default to off, so the safe behaviour is the one that needs no decision: fill empty locales
 * and leave everything else alone.
 */
const monitorLocaleSchema = z
  .object({
    code: z.string().trim().min(1).max(20),
    /** Replace a translation that already exists. */
    overwriteContent: z.boolean().default(false),
    /** Replace it even when a human has edited it since the plugin wrote it. */
    overwriteManualEdits: z.boolean().default(false),
  })
  .refine((locale) => locale.overwriteContent || !locale.overwriteManualEdits, {
    message: 'Manual edits can only be overwritten when existing content is also overwritten.',
    path: ['overwriteManualEdits'],
  });

export const monitorConfigSchema = z
  .object({
    contentType: z.string().trim().min(1),
    enabled: z.boolean().default(false),
    /**
     * The locales a publish writes into. The default locale is never one of them — it is the source
     * of truth — but that is checked against the install rather than here, since a schema cannot
     * know which locale is default.
     */
    locales: z.array(monitorLocaleSchema).default([]),
  })
  .refine(
    (config) => new Set(config.locales.map((locale) => locale.code)).size === config.locales.length,
    { message: 'Each locale may appear only once.', path: ['locales'] }
  );

export type MonitorConfig = z.infer<typeof monitorConfigSchema>;
export type MonitorLocale = MonitorConfig['locales'][number];
