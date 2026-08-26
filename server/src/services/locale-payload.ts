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
 * Pure and Strapi-free.
 */

export interface BuildPayloadInput {
  schema: ExtractorSchema;
  components: ComponentSchemas;
  /** The translated clone of the source document. Never mutated. */
  document: Record<string, unknown>;
  /** Paths the translator wrote, as the extractor produced them. */
  touchedPaths: string[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const buildLocalePayload = ({
  schema,
  components,
  document,
  touchedPaths,
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
