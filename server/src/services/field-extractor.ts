/**
 * Walks a schema and a document together and returns the fields worth translating.
 *
 * Pure and Strapi-free so it can be tested without a bootstrap. This is where the subtle bugs
 * live: getting the localized rule or the exclusions wrong does not throw, it silently corrupts
 * content — a shared field overwritten in one locale, or a detached image.
 *
 * **Tracer scope: flat top-level fields only.** Components, repeatables, dynamic zones, blocks and
 * JSON rich text arrive in the content-fidelity slice, which extends this module rather than
 * replacing it.
 */

/** The only types sent to a model in this slice. */
export const TRANSLATABLE_TYPES = ['string', 'text', 'richtext'] as const;

export type TranslatableType = (typeof TRANSLATABLE_TYPES)[number];

export interface ExtractorAttribute {
  type: string;
  pluginOptions?: { i18n?: { localized?: boolean } };
}

export interface ExtractorSchema {
  attributes: Record<string, ExtractorAttribute>;
}

export interface TranslatableField {
  /** Dot-and-index path into the document, readable by the path codec. */
  path: string;
  value: string;
  type: TranslatableType;
}

const isTranslatableType = (type: string): type is TranslatableType =>
  (TRANSLATABLE_TYPES as readonly string[]).includes(type);

/**
 * Mirrors `@strapi/i18n`'s own rule, which requires the flag to be **exactly true**:
 *
 * ```js
 * const hasLocalizedOption = (m) => prop('pluginOptions.i18n.localized', m) === true;
 * ```
 *
 * A missing flag therefore means *not* localized. That is the opposite of the intuitive reading,
 * and it matters: Strapi copies non-localized attributes across locales, so translating one would
 * write a value every locale shares.
 */
export const isLocalizedAttribute = (attribute: ExtractorAttribute): boolean =>
  attribute.pluginOptions?.i18n?.localized === true;

export const extractFields = (
  schema: ExtractorSchema,
  data: Record<string, unknown>
): TranslatableField[] => {
  const fields: TranslatableField[] = [];

  // Driven by the schema, never by the data's own keys, so a document carrying an unexpected key
  // cannot introduce a path that was never declared.
  for (const [name, attribute] of Object.entries(schema.attributes)) {
    if (!isTranslatableType(attribute.type) || !isLocalizedAttribute(attribute)) {
      continue;
    }

    const value = data[name];

    // Whitespace-only is nothing to translate, and a model would still be billed for it.
    if (typeof value !== 'string' || value.trim() === '') {
      continue;
    }

    fields.push({ path: name, value, type: attribute.type });
  }

  return fields;
};
