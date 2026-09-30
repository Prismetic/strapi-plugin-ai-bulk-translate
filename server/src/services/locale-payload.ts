import type { ComponentSchemas, ExtractorAttribute, ExtractorSchema } from './field-extractor';

/**
 * Builds the `data` handed to `documents.update` for a target locale.
 *
 * Two jobs, both of which look like details and are not:
 *
 * **Send only what changed.** The document loaded for translation is fully populated — components,
 * media, relations, `createdBy` complete with a password hash. Sending it back wholesale invites
 * Strapi to reinterpret every one of those. Only the attributes that actually contain a translated
 * value are sent; Strapi fills the rest itself, including copying non-localized fields when it
 * creates the locale.
 *
 * **Strip component ids, but never media ids.** Component rows belong to a locale, and this
 * document is a clone of the *source* locale, so its component ids point at the source's rows.
 * Sending them at a target locale re-links the source's components. i18n does exactly this stripping
 * for the same reason when it copies fields across (`removeIdsMut`). A media or relation id is the
 * opposite: it *is* the link, and dropping it would detach the image — the failure the whole
 * exclusion policy exists to prevent. So the stripping is schema-aware rather than a blind sweep
 * for keys named `id`.
 *
 * **Carry what the target locale has no value for.** "Strapi fills the rest" is only true of
 * fields that are *not* localized — those are shared, and i18n copies them when it creates a
 * locale. A localized image, number or date is per locale, and nothing fills it: a translation
 * that sent only its text left the new locale with no header image, no priority order, no
 * publication date. So when a `target` is given, every root the target has no value for is
 * carried across from the source too, which is what Strapi's own "fill in from another locale"
 * does. A target with a value keeps it — carrying fills gaps, it never overwrites. Fields that
 * are shared across locales are still left to Strapi, and identifiers are regenerated elsewhere.
 *
 * Pure and Strapi-free.
 */

export interface BuildPayloadInput {
  schema: ExtractorSchema;
  components: ComponentSchemas;
  /** The translated clone of the source document. Never mutated. */
  document: Record<string, unknown>;
  /** Paths the translator wrote, as the extractor produced them. */
  touchedPaths: string[];
  /**
   * The target locale's own document, or null when the locale does not exist yet.
   *
   * When given, roots the target holds no value for are carried across from the source. When
   * omitted, only the touched roots are sent.
   */
  target?: Record<string, unknown> | null;
}

/**
 * Attributes Strapi manages itself. They are on every content type's schema but are never sent
 * back: some are read-only, some name the *source* locale's row, and `localizations` is the link
 * between locales that i18n maintains on its own.
 */
const MANAGED_ATTRIBUTES = new Set([
  'id',
  'documentId',
  'locale',
  'localizations',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'createdBy',
  'updatedBy',
]);

/**
 * Whether Strapi keeps one value of this attribute for every locale.
 *
 * Mirrors i18n's own rule (`isLocalizedAttribute`): localized when flagged, and relations and
 * identifiers are always per locale whatever the flag says. Everything else is shared, and i18n
 * copies it across itself when a locale is created.
 */
const isSharedAcrossLocales = (attribute: ExtractorAttribute): boolean =>
  attribute.pluginOptions?.i18n?.localized !== true &&
  attribute.type !== 'relation' &&
  attribute.type !== 'uid';

/**
 * Whether a root is the plugin's to carry: a real, writable, per-locale field that is not an
 * identifier (those are regenerated from the translated title, not copied) or a secret.
 */
const isCarryable = (name: string, attribute: ExtractorAttribute): boolean =>
  !MANAGED_ATTRIBUTES.has(name) &&
  attribute.type !== 'uid' &&
  attribute.type !== 'password' &&
  attribute.writable !== false &&
  attribute.private !== true &&
  !isSharedAcrossLocales(attribute);

/**
 * A value the target locale would show as empty, and so has nothing to lose by being filled.
 *
 * The schema default counts as empty. A row written without a value for a field gets the default,
 * not null — so a translation that never sent `PublishedDate` left every target locale dated
 * `2025-01-01`, and by the value alone that is indistinguishable from a date an editor chose.
 * Filling it is right far more often than not: the source's real value is what a locale created
 * from it should carry, and an editor who wants the default in one locale only can set it after.
 */
const hasNoValue = (value: unknown, attribute: ExtractorAttribute): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  (attribute.default !== undefined && value === attribute.default);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const buildLocalePayload = ({
  schema,
  components,
  document,
  touchedPaths,
  target,
}: BuildPayloadInput): Record<string, unknown> => {
  /** Returns a copy of a component instance with its own id removed, recursing into nested ones. */
  const cleanComponent = (componentUid: string | undefined, value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => cleanComponent(componentUid, item));
    }

    if (!isPlainObject(value)) {
      return value;
    }

    const componentSchema = componentUid ? components[componentUid] : undefined;

    // Without a schema there is no way to tell a nested component from a media object, so the
    // value is passed through untouched rather than guessed at.
    if (!componentSchema) {
      return value;
    }

    const { id: _discarded, ...rest } = value;
    const cleaned: Record<string, unknown> = { ...rest };

    for (const [name, attribute] of Object.entries(componentSchema.attributes)) {
      if (!(name in cleaned)) {
        continue;
      }

      cleaned[name] = cleanAttribute(attribute, cleaned[name]);
    }

    return cleaned;
  };

  const cleanAttribute = (attribute: ExtractorAttribute, value: unknown): unknown => {
    if (attribute.type === 'component') {
      return cleanComponent(attribute.component, value);
    }

    if (attribute.type === 'dynamiczone' && Array.isArray(value)) {
      return value.map((item) => {
        const uid = (item as { __component?: string })?.__component;
        const cleaned = cleanComponent(uid, item);

        // `__component` is not an id — it is how Strapi knows which component this is.
        return isPlainObject(cleaned) && uid ? { ...cleaned, __component: uid } : cleaned;
      });
    }

    // Media, relations and scalars are handed back exactly as they were read.
    return value;
  };

  const roots = new Set(touchedPaths.map((path) => path.split('.')[0]));

  if (target !== undefined) {
    for (const [name, attribute] of Object.entries(schema.attributes)) {
      if (isCarryable(name, attribute) && hasNoValue(target?.[name], attribute)) {
        roots.add(name);
      }
    }
  }

  const payload: Record<string, unknown> = {};

  for (const root of roots) {
    const attribute = schema.attributes[root];

    // A path whose root is not declared cannot have come from the extractor, so it is dropped
    // rather than forwarded to Strapi.
    if (!attribute || !(root in document)) {
      continue;
    }

    payload[root] = cleanAttribute(attribute, document[root]);
  }

  return payload;
};
