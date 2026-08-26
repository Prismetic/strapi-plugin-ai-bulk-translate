import { z } from 'zod';

import { loadAiSdk } from './ai-sdk';
import { extractFields, type TranslatableField } from './field-extractor';
import { reinject } from './path-codec';

import type { Core } from '@strapi/strapi';
import type { ResolvedModel } from './model-store';

export interface TranslateRequest {
  contentType: string;
  documentId: string;
  sourceLocale: string;
  targetLocale: string;
  /** Whether the user authorised overwriting existing content in the target locale. */
  allowOverwrite: boolean;
  resolved: ResolvedModel;
}

export interface TranslateOutcome {
  status: 'translated' | 'skipped' | 'failed';
  skippedReason?: string;
  error?: string;
}

/** Whatever the Content Manager's populate builder produces; passed straight back to `findOne`. */
type PopulateSpec = Record<string, unknown> | undefined;

type PopulateBuilder = (uid: string) => {
  populateDeep: (depth: number) => { build: () => Promise<unknown> };
};

/**
 * Model keys are synthetic (`f0`, `f1`, …) rather than the field paths themselves.
 *
 * Paths contain dots and array indices — `Sections.3.Data.0.Heading` once nesting lands — and
 * making those JSON property names in a strict structured-output schema invites per-provider
 * quirks for no benefit. The mapping back is exact, and the prompt still names each field so the
 * model has the context.
 */
const keyFor = (index: number): string => `f${index}`;

/**
 * Translates one document into one locale.
 *
 * Surface-agnostic on purpose: the edit view, the list-view bulk action and post-1.0 monitoring all
 * call this same method with one document and one locale. Anything specific to how a run was
 * triggered belongs to the caller, not here.
 */
const translator = ({ strapi }: { strapi: Core.Strapi }) => {
  const config = <T>(key: string): T => strapi.config.get(`plugin::ai-bulk-translate.${key}`) as T;

  const localeName = async (code: string): Promise<string> => {
    try {
      const locale = await strapi.plugin('i18n').service('locales').findByCode(code);

      return locale?.name ? `${locale.name} (${code})` : code;
    } catch {
      return code;
    }
  };

  /**
   * A deep populate, borrowed from the Content Manager rather than hand-rolled. Nested component
   * and dynamic-zone data is simply absent from a shallow read, and a translator that cannot see a
   * field cannot translate it — a silent omission, not an error.
   */
  const deepPopulate = async (uid: string): Promise<PopulateSpec> => {
    try {
      // The Content Manager registers this service as a callable factory, which its own service
      // typings do not express; hence the cast rather than a `never`-riddled call site.
      const builder = strapi
        .plugin('content-manager')
        .service('populate-builder') as PopulateBuilder;

      return (await builder(uid).populateDeep(Infinity).build()) as PopulateSpec;
    } catch {
      return undefined;
    }
  };

  return {
    /**
     * Sends fields to the model and returns `path → translated value`.
     *
     * Uses structured output against a schema of exactly the requested keys, which is what makes
     * the JSON-repair machinery comparable plugins carry unnecessary: the model cannot return a
     * different shape.
     */
    async translateFields(
      fields: TranslatableField[],
      targetLocale: string,
      resolved: ResolvedModel
    ): Promise<Record<string, string>> {
      if (fields.length === 0) {
        return {};
      }

      const [{ generateObject }, model] = await Promise.all([
        loadAiSdk(),
        strapi
          .plugin('ai-bulk-translate')
          .service('provider-registry')
          .getModel(resolved.provider, resolved.model.modelId),
      ]);

      const shape = Object.fromEntries(
        fields.map((field, index) => [
          keyFor(index),
          z.string().describe(`Translation of the "${field.path}" field`),
        ])
      );

      const target = await localeName(targetLocale);
      const payload = fields
        .map((field, index) => `${keyFor(index)} (${field.path}, ${field.type}):\n${field.value}`)
        .join('\n\n');

      const { object } = await generateObject({
        model,
        schema: z.object(shape),
        system: config<string>('systemPrompt'),
        temperature: config<number>('temperature'),
        prompt: `Translate each of the following fields into ${target}.\n\n${payload}`,
      });

      const translations: Record<string, string> = {};

      fields.forEach((field, index) => {
        const value = (object as Record<string, unknown>)[keyFor(index)];

        if (typeof value === 'string') {
          translations[field.path] = value;
        }
      });

      return translations;
    },

    async translateDocument(request: TranslateRequest): Promise<TranslateOutcome> {
      const { contentType, documentId, sourceLocale, targetLocale, allowOverwrite } = request;
      const documents = strapi.documents(contentType as never);
      const populate = await deepPopulate(contentType);

      const source = (await documents.findOne({
        documentId,
        locale: sourceLocale,
        status: 'draft',
        ...(populate ? { populate } : {}),
      } as never)) as Record<string, unknown> | null;

      if (!source) {
        return { status: 'skipped', skippedReason: 'Nothing to translate in the source locale.' };
      }

      const schema = strapi.contentType(contentType as never);
      const fields = extractFields(schema as never, source);

      if (fields.length === 0) {
        return { status: 'skipped', skippedReason: 'No translatable text in the source locale.' };
      }

      // Re-checked here at execution time rather than trusted from the dialog, because content can
      // appear between a user opening the dialog and the job running. The richer three-state
      // matrix, shared with the dialog, arrives in the locale-status slice; this is the guard that
      // keeps the tracer from overwriting by default in the meantime.
      const existing = (await documents.findOne({
        documentId,
        locale: targetLocale,
        status: 'draft',
      })) as Record<string, unknown> | null;

      if (existing && !allowOverwrite && extractFields(schema as never, existing).length > 0) {
        return {
          status: 'skipped',
          skippedReason: `${targetLocale} already has content and was not authorised for overwrite.`,
        };
      }

      const translations = await this.translateFields(fields, targetLocale, request.resolved);

      if (Object.keys(translations).length === 0) {
        return { status: 'failed', error: 'The model returned no usable translations.' };
      }

      // Send back only the attributes translation actually touched. Strapi fills the rest: when the
      // target locale does not exist yet, `update` creates it and copies non-localized fields
      // across, so this is a true per-locale upsert with no create/update branching here.
      const clone = reinject(source, translations);
      const roots = new Set(Object.keys(translations).map((path) => path.split('.')[0]));
      const data = Object.fromEntries([...roots].map((root) => [root, clone[root]]));

      await documents.update({
        documentId,
        locale: targetLocale,
        // Draft, always. Publishing stays a human decision — the plugin never publishes.
        status: 'draft',
        data: data as never,
      });

      return { status: 'translated' };
    },
  };
};

export default translator;
