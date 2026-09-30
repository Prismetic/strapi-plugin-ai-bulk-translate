import type { Core } from '@strapi/strapi';

/**
 * Which entries a request is about, when the admin could not say.
 *
 * A single type's edit view has no identifier in its route, so the admin sends none and the plugin
 * finds the one document itself. Both the run and the preview need this answer, and they must
 * give the same one: a preview that could not resolve the entry while the run could is how the
 * dialog came to show a heading with nothing under it and a live Translate button beneath.
 *
 * The answer is either the identifiers to use or the message to refuse with. Refusals are worded
 * once here so the preview and the run say the same thing.
 */
export type EntrySelection = { documentIds: string[] } | { refusal: string };

export const resolveEntrySelection = async (
  strapi: Core.Strapi,
  {
    contentType,
    sourceLocale,
    documentIds,
  }: { contentType: string; sourceLocale: string; documentIds?: string[] }
): Promise<EntrySelection> => {
  const schema = strapi.contentType(contentType as never);

  if (!schema) {
    return { refusal: `Unknown content type "${contentType}".` };
  }

  const i18nOptions = schema.pluginOptions as { i18n?: { localized?: boolean } } | undefined;

  if (i18nOptions?.i18n?.localized !== true) {
    return {
      refusal: `"${contentType}" does not have internationalization enabled, so it cannot be translated.`,
    };
  }

  if (documentIds && documentIds.length > 0) {
    return { documentIds };
  }

  if (schema.kind !== 'singleType') {
    return { refusal: 'Choose at least one entry.' };
  }

  const resolved = (await strapi
    .plugin('ai-bulk-translate')
    .service('translator')
    .resolveSingleTypeDocumentId(contentType, sourceLocale)) as string | null;

  if (!resolved) {
    return {
      refusal: `"${contentType}" has nothing saved in ${sourceLocale} yet, so there is nothing to translate.`,
    };
  }

  return { documentIds: [resolved] };
};
