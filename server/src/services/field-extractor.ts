/**
 * Walks a schema and a document together and returns the fields worth translating.
 *
 * Pure and Strapi-free so it can be tested without a bootstrap. This is where the subtle bugs
 * live: getting the localized rule or the exclusions wrong does not throw, it silently corrupts
 * content — a shared field overwritten in one locale, or a detached image.
 *
 * Three exclusions are absolute, at every depth. **Media** and **relations** are carried across
 * untouched, so translating can never detach an image or break a link between entries. **Identifier
 * fields** are regenerated from the translated title instead of being translated as prose. None of
 * the three is ever sent to a model — which also means a populated document's `createdBy`, password
 * hash and all, cannot leak into a request.
 */

/** Attribute types whose value is prose to be translated directly. */
export const TEXT_TYPES = ['string', 'text', 'richtext'] as const;

/** Attribute types holding a structure with prose inside it. */
export const STRUCTURED_TYPES = ['blocks', 'json'] as const;

export type TranslatableType = (typeof TEXT_TYPES)[number] | (typeof STRUCTURED_TYPES)[number];

export interface ExtractorAttribute {
  type: string;
  pluginOptions?: { i18n?: { localized?: boolean } };
  /** Set on `component` attributes. */
  component?: string;
  repeatable?: boolean;
  /** Set on `dynamiczone` attributes. */
  components?: string[];
}

export interface ExtractorSchema {
  attributes: Record<string, ExtractorAttribute>;
}

/** Component schemas by uid, as `strapi.components` provides them. */
export type ComponentSchemas = Record<string, ExtractorSchema | undefined>;

export interface TranslatableField {
  /** Dot-and-index path into the document, readable by the path codec. */
  path: string;
  value: string;
  type: TranslatableType;
}

const isTextType = (type: string): type is (typeof TEXT_TYPES)[number] =>
  (TEXT_TYPES as readonly string[]).includes(type);

/**
 * Keys inside a `blocks` node that hold prose. Everything else in a node — `type`, `level`, `url`,
 * `format`, image metadata — is structure, and replacing it would break the field.
 */
const BLOCK_TEXT_KEY = 'text';

/** A value that is a link or an address is never prose, and translating it would break it. */
const isAddressLike = (value: string): boolean =>
  /^(https?:\/\/|mailto:|tel:|\/\/|www\.)/i.test(value.trim()) ||
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isWorthTranslating = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Mirrors `@strapi/i18n`'s own rule for content-type attributes, which requires the flag to be
 * **exactly true**:
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

/**
 * The rule *inside* a component, which is deliberately not the same.
 *
 * i18n never consults these flags: `getNonLocalizedAttributes` reads `getVisibleAttributes(model)`
 * on the content type and does not recurse. Whether a component's contents are per-locale is
 * decided entirely by the content-type attribute holding it. On a real host the overwhelming
 * majority of component attributes carry no flag at all — 121 of 129 on the verification host — so
 * requiring `true` here would silently skip nearly every nested field.
 *
 * An explicit `false` is still honoured. Strapi does not enforce it, but a person wrote it down,
 * and there is no reason to translate a field someone marked as not for translation.
 */
const isTranslatableInComponent = (attribute: ExtractorAttribute): boolean =>
  attribute.pluginOptions?.i18n?.localized !== false;

export interface ExtractOptions {
  /** Component schemas, needed to recurse into components and dynamic zones. */
  components?: ComponentSchemas;
}

export const extractFields = (
  schema: ExtractorSchema,
  data: Record<string, unknown>,
  components: ComponentSchemas = {}
): TranslatableField[] => {
  const fields: TranslatableField[] = [];

  /** Collects the prose leaves of a `blocks` tree, keeping every structural key untouched. */
  const walkBlocks = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walkBlocks(item, `${path}.${index}`));

      return;
    }

    if (node === null || typeof node !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === BLOCK_TEXT_KEY) {
        if (isWorthTranslating(value)) {
          fields.push({ path: `${path}.${key}`, value, type: 'blocks' });
        }

        continue;
      }

      // Only `children` continues the tree. Anything else — `url`, `image`, `format` — is
      // structure, and an image node's `name` is a filename, not a caption.
      if (key === 'children') {
        walkBlocks(value, `${path}.${key}`);
      }
    }
  };

  /**
   * Collects string values from a JSON field.
   *
   * A `json` attribute is opaque: the plugin cannot know whether it holds prose or configuration.
   * Every string is therefore a candidate, except links and addresses, which are never prose and
   * which translation would break — the same reasoning that excludes media and relations. Keys are
   * never translated; a renamed key would change the shape the front end reads.
   */
  const walkJson = (node: unknown, path: string) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walkJson(item, `${path}.${index}`));

      return;
    }

    if (node === null || typeof node !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;

      if (typeof value === 'string') {
        if (isWorthTranslating(value) && !isAddressLike(value)) {
          fields.push({ path: childPath, value, type: 'json' });
        }

        continue;
      }

      walkJson(value, childPath);
    }
  };

  const walkComponent = (componentUid: string | undefined, value: unknown, path: string) => {
    const componentSchema = componentUid ? components[componentUid] : undefined;

    // An unregistered component is skipped rather than guessed at. Inventing a shape here would
    // produce paths that cannot be written back.
    if (!componentSchema || value === null || typeof value !== 'object') {
      return;
    }

    walk(componentSchema, value as Record<string, unknown>, path, isTranslatableInComponent);
  };

  const walk = (
    currentSchema: ExtractorSchema,
    currentData: Record<string, unknown>,
    prefix: string,
    isTranslatable: (attribute: ExtractorAttribute) => boolean
  ) => {
    // Driven by the schema, never by the data's own keys, so a document carrying an unexpected key
    // cannot introduce a path that was never declared.
    for (const [name, attribute] of Object.entries(currentSchema.attributes)) {
      if (!isTranslatable(attribute)) {
        continue;
      }

      const value = currentData[name];
      const path = prefix ? `${prefix}.${name}` : name;

      if (isTextType(attribute.type)) {
        if (isWorthTranslating(value)) {
          fields.push({ path, value, type: attribute.type });
        }

        continue;
      }

      if (attribute.type === 'blocks') {
        walkBlocks(value, path);
        continue;
      }

      if (attribute.type === 'json') {
        walkJson(value, path);
        continue;
      }

      if (attribute.type === 'component') {
        if (attribute.repeatable && Array.isArray(value)) {
          value.forEach((item, index) =>
            walkComponent(attribute.component, item, `${path}.${index}`)
          );
        } else {
          walkComponent(attribute.component, value, path);
        }

        continue;
      }

      if (attribute.type === 'dynamiczone' && Array.isArray(value)) {
        value.forEach((item, index) => {
          const uid = (item as { __component?: string })?.__component;

          walkComponent(uid, item, `${path}.${index}`);
        });
      }

      // Everything else — media, relation, uid, and every scalar that is not prose — falls through
      // untouched, which is the point.
    }
  };

  walk(schema, data, '', isLocalizedAttribute);

  return fields;
};
