import { extractFields } from './field-extractor';

import { titleOf } from './entry-identity';

import type { Core } from '@strapi/strapi';
import type { ComponentSchemas, ExtractorSchema } from './field-extractor';

/**
 * Decides, for each selected entry and target locale, what a run would actually do.
 *
 * **This module is the single implementation, used by both the dialog and the runner.** The dialog
 * tells an editor what will happen; the runner decides what does happen. Two implementations agree
 * on the day they are written and drift afterwards, and the symptom of that drift is the worst one
 * available here: an editor ticks nothing, is shown "will be created", and a hand-edited
 * translation is overwritten anyway. So the runner calls `hasTranslatableContent` rather than
 * asking the same question in its own words.
 *
 * The three states are deliberately about *content*, not rows:
 *
 * - `no-source`  — the source locale has nothing to translate; the entry is excluded from the run
 * - `empty`      — the target locale has no translatable content; it will be written
 * - `has-content`— the target locale already has content; skipped unless explicitly authorised
 *
 * `empty` covers both "no row for this locale" and "a row exists with every translatable field
 * blank". Treating those differently would be a distinction without a difference to an editor, and
 * defining the state by row existence instead is precisely where a second implementation would
 * disagree with this one.
 */

export type LocaleState = 'no-source' | 'empty' | 'has-content';

export interface DocumentLocaleStatus {
  documentId: string;
  /** From the content type's configured main field; falls back to the identifier. */
  title: string;
  locales: Record<string, LocaleState>;
  /** True when the source locale has nothing to translate, so the entry is excluded. */
  excluded: boolean;
}

/**
 * Whether a document holds anything worth sending to a model.
 *
 * The one predicate both surfaces depend on. A document with a row but no translatable text counts
 * as empty, because an editor asking "does French have content?" means the words, not the record.
 */
export const hasTranslatableContent = (
  schema: ExtractorSchema,
  document: Record<string, unknown> | null | undefined,
  components: ComponentSchemas = {}
): boolean => {
  if (!document) {
    return false;
  }

  return extractFields(schema, document, components).length > 0;
};

/** Pure classification, given the two answers. Kept separate so it can be tested on its own. */
export const classifyLocale = (
  sourceHasContent: boolean,
  targetHasContent: boolean
): LocaleState => {
  if (!sourceHasContent) {
    return 'no-source';
  }

  return targetHasContent ? 'has-content' : 'empty';
};

const localeStatus = ({ strapi }: { strapi: Core.Strapi }) => {
  return {
    hasTranslatableContent,
    classifyLocale,

    /**
     * Builds the matrix the dialog renders, loading each document once per locale involved.
     *
     * Deliberately not cached: the whole point of showing this is that it reflects the database at
     * the moment the editor is looking, and a stale preview is worse than a slow one. The runner
     * re-checks at execution time anyway, because content can appear in between.
     */
    async build({
      contentType,
      sourceLocale,
      targetLocales,
      documentIds,
    }: {
      contentType: string;
      sourceLocale: string;
      targetLocales: string[];
      documentIds: string[];
    }): Promise<DocumentLocaleStatus[]> {
      const documents = strapi.documents(contentType as never);
      const schema = strapi.contentType(contentType as never) as unknown as ExtractorSchema;
      const components = strapi.components as unknown as ComponentSchemas;

      const populate = await strapi
        .plugin('ai-bulk-translate')
        .service('translator')
        .buildDeepPopulate(contentType);

      const load = async (documentId: string, locale: string) =>
        (await documents.findOne({
          documentId,
          locale,
          status: 'draft',
          ...(populate ? { populate } : {}),
        } as never)) as Record<string, unknown> | null;

      const rows: DocumentLocaleStatus[] = [];

      for (const documentId of documentIds) {
        const source = await load(documentId, sourceLocale);
        const sourceHasContent = hasTranslatableContent(schema, source, components);

        const locales: Record<string, LocaleState> = {};

        for (const target of targetLocales) {
          // Nothing to translate means the target's state cannot change; skip the read entirely.
          const targetHasContent = sourceHasContent
            ? hasTranslatableContent(schema, await load(documentId, target), components)
            : false;

          locales[target] = classifyLocale(sourceHasContent, targetHasContent);
        }

        rows.push({
          documentId,
          title: source ? await titleOf(strapi, contentType, source) : documentId,
          locales,
          excluded: !sourceHasContent,
        });
      }

      return rows;
    },
  };
};

export default localeStatus;
