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

export default {
  default: () => ({
    /** Steers tone and formatting rules. Editable from the settings page in a later slice. */
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    /** Low by default: translation should be faithful, not creative. */
    temperature: 0.2,
    /** Ceiling on documents per run, so a mis-click cannot trigger an enormous bill. */
    maxDocumentsPerRun: 100,
    /** Concurrent model requests per run. Raised to its real purpose by the bulk slice. */
    maxConcurrency: 3,
  }),

  validator(config: Record<string, unknown>) {
    const { temperature, maxDocumentsPerRun, maxConcurrency } = config;

    if (typeof temperature === 'number' && (temperature < 0 || temperature > 2)) {
      throw new Error('ai-bulk-translate: temperature must be between 0 and 2.');
    }

    for (const [key, value] of Object.entries({ maxDocumentsPerRun, maxConcurrency })) {
      if (value !== undefined && (typeof value !== 'number' || value < 1)) {
        throw new Error(`ai-bulk-translate: ${key} must be a positive number.`);
      }
    }
  },
};
