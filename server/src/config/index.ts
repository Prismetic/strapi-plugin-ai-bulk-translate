/**
 * Plugin configuration and its defaults.
 *
 * Read through `strapi.config.get('plugin::ai-bulk-translate.<key>')` at call time, never captured
 * in a module-level constant, so a host's `config/plugins.ts` is honoured and tests can vary it.
 */
export const DEFAULT_SYSTEM_PROMPT = [
  'You are a professional translator working on website content in a CMS.',
  'Translate each value into the requested target language.',
  'Return every key you were given, unchanged, with only its value translated.',
  'Preserve all formatting exactly: Markdown syntax, HTML tags, line breaks, and placeholders',
  'such as {{name}} or %s must survive untouched.',
  'Do not translate proper nouns, brand names, code, or URLs.',
  'Do not add commentary, explanation, or quotation marks that were not in the source.',
].join(' ');

/** Low: translation should be faithful, not creative. */
export const DEFAULT_TEMPERATURE = 0.2;

/**
 * Bounds on the admin-editable settings, enforced server-side in `validation/settings.ts`.
 *
 * `temperature` matches the range this plugin's `validator` already imposes on `config/plugins.ts`,
 * so the two routes to the same value cannot disagree about what is acceptable.
 */
export const TEMPERATURE_RANGE = { min: 0, max: 2 } as const;
export const SYSTEM_PROMPT_MAX_LENGTH = 4000;

export default {
  default: () => ({
    /** Steers tone and formatting rules. Editable from the settings page. */
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    temperature: DEFAULT_TEMPERATURE,
    /**
     * Ceiling for one model request, in estimated tokens. Sized well below any provider's context
     * window: the point is predictable request sizes and useful chunk boundaries, not squeezing a
     * document into as few calls as possible.
     */
    maxTokensPerRequest: 3000,
    /** Ceiling on documents per run, so a mis-click cannot trigger an enormous bill. */
    maxDocumentsPerRun: 100,
    /** Concurrent model requests per run. Raised to its real purpose by the bulk slice. */
    maxConcurrency: 3,
    /**
     * How long finished runs are kept, in days.
     *
     * History is worth having and is not worth keeping forever: the Jobs tab answers "what
     * happened", which is a question about recent work. Raise it where an audit trail matters.
     * Runs still queued or processing are never pruned, whatever this says.
     */
    jobRetentionDays: 30,
  }),

  validator(config: Record<string, unknown>) {
    const { temperature, maxDocumentsPerRun, maxConcurrency, jobRetentionDays } = config;

    if (
      jobRetentionDays !== undefined &&
      (typeof jobRetentionDays !== 'number' ||
        !Number.isInteger(jobRetentionDays) ||
        jobRetentionDays < 1)
    ) {
      throw new Error(
        'ai-bulk-translate: jobRetentionDays must be a whole number of days, at least 1.'
      );
    }

    if (typeof temperature === 'number' && (temperature < 0 || temperature > 2)) {
      throw new Error('ai-bulk-translate: temperature must be between 0 and 2.');
    }

    const { maxTokensPerRequest } = config;

    if (
      maxTokensPerRequest !== undefined &&
      (typeof maxTokensPerRequest !== 'number' || maxTokensPerRequest < 100)
    ) {
      throw new Error('ai-bulk-translate: maxTokensPerRequest must be a number of at least 100.');
    }

    for (const [key, value] of Object.entries({ maxDocumentsPerRun, maxConcurrency })) {
      if (value !== undefined && (typeof value !== 'number' || value < 1)) {
        throw new Error(`ai-bulk-translate: ${key} must be a positive number.`);
      }
    }
  },
};
