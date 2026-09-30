import { z } from 'zod';

import { loadAiSdk } from './ai-sdk';
import { chunkFields, joinParts, type FieldPart } from './chunker';
import { extractFields, type ComponentSchemas, type TranslatableField } from './field-extractor';
import { buildLocalePayload } from './locale-payload';
import { decideOverwrite } from './overwrite-policy';
import { reinject } from './path-codec';
import { collectLinks, describeDropped, pruneLinks } from './relation-links';

import type { Core } from '@strapi/strapi';
import type { ResolvedModel } from './model-store';

export interface TranslateRequest {
  contentType: string;
  documentId: string;
  sourceLocale: string;
  targetLocale: string;
  /** Whether the user authorised overwriting existing content in the target locale. */
  allowOverwrite: boolean;
  /**
   * A monitored run's policy for this locale, decided here rather than by the caller because the
   * answer depends on the target document, which this is about to read anyway.
   *
   * Absent for runs a person started: those authorise per entry, through `allowOverwrite`.
   */
  overwrite?: {
    policy: { overwriteContent: boolean; overwriteManualEdits: boolean };
    /** What the plugin left this locale's timestamp at, or null if it never wrote it. */
    lastWrittenAt: string | Date | null;
  };
  resolved: ResolvedModel;
}

export interface TranslateOutcome {
  status: 'translated' | 'skipped' | 'failed';
  skippedReason?: string;
  error?: string;
  /** The page path written in the target locale, where the content type has one. */
  targetPath?: string | null;
  /**
   * The target's timestamp after this write, recorded so a later monitored run can tell its own
   * output from a human's edit.
   */
  targetUpdatedAt?: string | null;
  /**
   * Something the editor should know about a write that did happen — today, links left out
   * because the entries they point at have no version in the target locale.
   */
  notice?: string;
}

/** Whatever the Content Manager's populate builder produces; passed straight back to `findOne`. */
type PopulateSpec = Record<string, unknown> | undefined;

type PopulateBuilder = (uid: string) => {
  populateDeep: (depth: number) => { build: () => Promise<unknown> };
};

interface UidService {
  generateUIDField: (input: {
    contentTypeUID: string;
    field: string;
    data: Record<string, unknown>;
    locale: string;
  }) => Promise<string>;
}

/**
 * Model keys are synthetic (`f0`, `f1`, …) rather than the field paths themselves.
 *
 * Paths contain dots and array indices — `Sections.3.Data.0.Heading` — and making those JSON
 * property names in a strict structured-output schema invites per-provider quirks for no benefit.
 * The mapping back is exact, and the prompt still names each field so the model has the context.
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
  /** Resolved lazily so the two services can reference each other without an import cycle. */
  const status = () => strapi.plugin('ai-bulk-translate').service('locale-status');

  /**
   * The admin-editable prompt and temperature, read per chunk rather than captured per run.
   *
   * Deliberately unlike the model, which `job-runner` resolves once so a run cannot split across
   * two models mid-flight. These are cheap to read and carry no such hazard, and reading them late
   * is what makes "takes effect on the next run" true without a restart.
   */
  const settings = () => strapi.plugin('ai-bulk-translate').service('settings-store');

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

  /**
   * Which of the linked entries can actually be linked from the target locale.
   *
   * Strapi resolves a link against the locale being written whenever the linked content type is
   * localized, and against the draft whenever it has draft and publish — this write is always a
   * draft. Asking the same question first is what lets an unavailable link be left out instead of
   * rejecting the whole document.
   *
   * A content type that is not localized has one version serving every locale, so all of its
   * entries are available. So is anything this cannot look up: the write is then Strapi's to judge.
   */
  const availableLinks = async (
    links: Map<string, Set<string>>,
    targetLocale: string
  ): Promise<Map<string, Set<string>>> => {
    const localization = strapi.plugin('i18n').service('content-types');
    const available = new Map<string, Set<string>>();

    for (const [targetUid, documentIds] of links) {
      const model = strapi.getModel(targetUid as never) as
        { options?: { draftAndPublish?: boolean } } | undefined;

      if (!model || !localization.isLocalizedContentType(model)) {
        available.set(targetUid, documentIds);
        continue;
      }

      const rows = (await strapi.db.query(targetUid).findMany({
        where: {
          documentId: { $in: [...documentIds] },
          locale: targetLocale,
          ...(model.options?.draftAndPublish ? { publishedAt: null } : {}),
        },
        select: ['documentId'],
      })) as { documentId: string }[];

      available.set(targetUid, new Set(rows.map((row) => row.documentId)));
    }

    return available;
  };

  /** A content type's name as the Content Manager shows it, falling back to its uid. */
  const displayName = (uid: string): string => {
    const model = strapi.getModel(uid as never) as { info?: { displayName?: string } } | undefined;

    return model?.info?.displayName ?? uid;
  };

  /**
   * Regenerates identifier fields for the target locale from the *translated* target field.
   *
   * Copying the source locale's slug would leave every language sharing one URL in the source
   * language, which is the whole reason localized routing exists. Strapi's own uid service is used
   * so the result is slugified and made unique exactly as the Content Manager would — including
   * per-locale uniqueness, since the same slug may legitimately exist in another locale.
   */
  const regenerateUids = async (
    contentType: string,
    schema: { attributes: Record<string, { type: string; targetField?: string }> },
    translatedDocument: Record<string, unknown>,
    targetLocale: string
  ): Promise<Record<string, string>> => {
    const uidService = strapi.service('plugin::content-manager.uid') as unknown as UidService;

    if (!uidService?.generateUIDField) {
      return {};
    }

    const regenerated: Record<string, string> = {};

    for (const [name, attribute] of Object.entries(schema.attributes)) {
      // Only a uid derived from another field can be regenerated. One with no targetField is a
      // free-standing identifier the editor set, and inventing a new value would change a URL
      // nobody asked to change.
      if (attribute.type !== 'uid' || !attribute.targetField) {
        continue;
      }

      const target = translatedDocument[attribute.targetField];

      if (typeof target !== 'string' || target.trim() === '') {
        continue;
      }

      try {
        regenerated[name] = await uidService.generateUIDField({
          contentTypeUID: contentType,
          field: name,
          data: translatedDocument,
          locale: targetLocale,
        });
      } catch (error) {
        // A slug that cannot be generated is not worth losing a whole translation over; the locale
        // keeps whatever Strapi derives on write.
        strapi.log.warn(
          `[ai-bulk-translate] could not regenerate "${name}" for ${targetLocale}: ` +
            (error instanceof Error ? error.message : 'unknown error')
        );
      }
    }

    return regenerated;
  };

  return {
    /**
     * The deep-populate spec for a content type.
     *
     * Exposed so locale-status loads documents the same way this service does. A shallower read
     * there would miss text nested in components and report a locale as empty when it is not.
     */
    buildDeepPopulate(contentType: string): Promise<PopulateSpec> {
      return deepPopulate(contentType);
    },

    /**
     * Finds the one document behind a single type.
     *
     * A single type's edit view has no identifier in its route, so the plugin resolves it instead
     * of asking the browser for one. `findMany` with a limit is used rather than the `findFirst`
     * the plan assumed: the document service at 5.27 exposes no such method.
     *
     * Returns null when the single type has nothing saved in that locale yet.
     */
    async resolveSingleTypeDocumentId(contentType: string, locale: string): Promise<string | null> {
      const found = (await strapi.documents(contentType as never).findMany({
        locale,
        status: 'draft',
        limit: 1,
      } as never)) as { documentId?: string }[] | null;

      return found?.[0]?.documentId ?? null;
    },

    /**
     * Sends one chunk of parts to the model and returns `synthetic key → translated value`.
     *
     * Uses structured output against a schema of exactly the requested keys, which is what makes
     * the JSON-repair machinery comparable plugins carry unnecessary: the model cannot return a
     * different shape.
     */
    async translateChunk(
      parts: FieldPart[],
      targetLocale: string,
      resolved: ResolvedModel
    ): Promise<string[]> {
      const [{ generateObject }, model, { systemPrompt, temperature }] = await Promise.all([
        loadAiSdk(),
        strapi
          .plugin('ai-bulk-translate')
          .service('provider-registry')
          .getModel(resolved.provider, resolved.model.modelId),
        settings().read(),
      ]);

      const shape = Object.fromEntries(
        parts.map((part, index) => [
          keyFor(index),
          z
            .string()
            .describe(
              part.partCount > 1
                ? `Translation of "${part.path}", fragment ${part.partIndex + 1} of ${part.partCount}`
                : `Translation of the "${part.path}" field`
            ),
        ])
      );

      const target = await localeName(targetLocale);

      // A split field is announced as such, so the model translates the fragment in place instead
      // of trying to complete a sentence that continues in another request.
      const body = parts
        .map((part, index) => {
          const label =
            part.partCount > 1
              ? `${keyFor(index)} (${part.path}, ${part.type}, fragment ${part.partIndex + 1} of ${part.partCount} — translate this fragment only, do not add or complete text)`
              : `${keyFor(index)} (${part.path}, ${part.type})`;

          return `${label}:\n${part.value}`;
        })
        .join('\n\n');

      const { object } = await generateObject({
        model,
        schema: z.object(shape),
        system: systemPrompt,
        temperature,
        prompt: `Translate each of the following fields into ${target}.\n\n${body}`,
      });

      return parts.map((_, index) => {
        const value = (object as Record<string, unknown>)[keyFor(index)];

        return typeof value === 'string' ? value : '';
      });
    },

    /**
     * Translates a whole document's worth of fields, in as many requests as the token budget needs,
     * and reassembles any field that had to be split.
     */
    async translateFields(
      fields: TranslatableField[],
      targetLocale: string,
      resolved: ResolvedModel
    ): Promise<Record<string, string>> {
      if (fields.length === 0) {
        return {};
      }

      const chunks = chunkFields(fields, { maxTokens: config<number>('maxTokensPerRequest') });
      const collected = new Map<string, { partIndex: number; value: string }[]>();

      // Sequential: the concurrency cap belongs to the run, not to one document, and firing a
      // document's chunks in parallel would quietly multiply the real rate by the chunk count.
      for (const chunk of chunks) {
        const translated = await this.translateChunk(chunk, targetLocale, resolved);

        chunk.forEach((part, index) => {
          const value = translated[index];

          if (value === '') {
            return;
          }

          const parts = collected.get(part.path) ?? [];
          parts.push({ partIndex: part.partIndex, value });
          collected.set(part.path, parts);
        });
      }

      const translations: Record<string, string> = {};

      for (const field of fields) {
        const parts = collected.get(field.path);

        if (!parts || parts.length === 0) {
          continue;
        }

        // A field is only written back if every fragment came home. Half a paragraph is worse than
        // leaving the source text in place for a human to finish.
        const expected = chunks.flat().find((part) => part.path === field.path)?.partCount ?? 1;

        if (parts.length === expected) {
          translations[field.path] = joinParts(parts);
        }
      }

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
      const components = strapi.components as unknown as ComponentSchemas;
      const fields = extractFields(schema as never, source, components);

      // Same predicate the dialog uses — see locale-status. Asking this question in two places is
      // how a preview and a run come to disagree.
      if (!status().hasTranslatableContent(schema as never, source, components)) {
        return { status: 'skipped', skippedReason: 'No translatable text in the source locale.' };
      }

      // Re-checked here at execution time rather than trusted from the dialog, because content can
      // appear between a user opening the dialog and the job running. The check itself is the
      // dialog's own — locale-status — so a preview and a run cannot disagree about what
      // "already has content" means.
      const existing = (await documents.findOne({
        documentId,
        locale: targetLocale,
        status: 'draft',
        ...(populate ? { populate } : {}),
      } as never)) as Record<string, unknown> | null;

      const targetHasContent = status().hasTranslatableContent(
        schema as never,
        existing,
        components
      );

      /**
       * A monitored run decides by policy; a run a person started decides by what they ticked.
       *
       * The two skips are different answers and say so. "Already has content" is the
       * configuration working as asked; "edited by hand" is the plugin declining to destroy
       * somebody's work, and only one of those is fixed by changing a setting.
       */
      if (request.overwrite) {
        const decision = decideOverwrite({
          policy: request.overwrite.policy,
          targetHasContent,
          lastWrittenAt: request.overwrite.lastWrittenAt,
          targetUpdatedAt: (existing?.updatedAt as string | undefined) ?? null,
        });

        if (decision === 'skip:has-content') {
          return {
            status: 'skipped',
            skippedReason: `${targetLocale} already has content, and this locale is not set to overwrite it.`,
          };
        }

        if (decision === 'skip:manual-edit') {
          return {
            status: 'skipped',
            skippedReason: `${targetLocale} has been edited by hand since it was last translated, so it was left alone.`,
          };
        }
      } else if (!allowOverwrite && targetHasContent) {
        return {
          status: 'skipped',
          skippedReason: `${targetLocale} already has content and was not authorised for overwrite.`,
        };
      }

      const translations = await this.translateFields(fields, targetLocale, request.resolved);

      if (Object.keys(translations).length === 0) {
        return { status: 'failed', error: 'The model returned no usable translations.' };
      }

      const clone = reinject(source, translations);
      const touchedPaths = Object.keys(translations);

      // `existing` doubles as the target: a locale that does not exist yet gets every per-locale
      // field carried across, one that does gets only the gaps filled. See locale-payload.
      const payload = buildLocalePayload({
        schema: schema as never,
        components,
        document: clone,
        touchedPaths,
        target: existing,
      });

      // A component is sent whole, so the links inside it go with it — and one pointing at an
      // entry with no version in this locale would reject the write. See relation-links.
      const links = { schema: schema as never, components, data: payload };
      const available = await availableLinks(collectLinks(links), targetLocale);
      const { data, dropped } = pruneLinks(
        links,
        ({ targetUid, documentId }) => available.get(targetUid)?.has(documentId) ?? true
      );
      const notice = describeDropped(dropped, targetLocale, displayName);

      // Slugs derive from the translated title, so they are regenerated after reinjection and
      // added to the payload even though no model produced them.
      const uids = await regenerateUids(contentType, schema as never, clone, targetLocale);

      const written = (await documents.update({
        documentId,
        locale: targetLocale,
        // Draft, always. Publishing stays a human decision — the plugin never publishes.
        status: 'draft',
        data: { ...data, ...uids } as never,
      })) as Record<string, unknown> | null;

      // The regenerated slug is the target locale's own path, not the source's — which is the
      // whole reason it is regenerated rather than copied.
      const path = Object.values(uids).find((value) => typeof value === 'string' && value !== '');

      return {
        status: 'translated',
        targetPath: (path as string) ?? null,
        // Read back from what was written, so a later run compares like with like.
        targetUpdatedAt: (written?.updatedAt as string | undefined) ?? null,
        ...(notice ? { notice } : {}),
      };
    },
  };
};

export default translator;
