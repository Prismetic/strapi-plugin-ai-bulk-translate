import type { ComponentSchemas, ExtractorAttribute, ExtractorSchema } from './field-extractor';

/**
 * Finds the links between entries inside a payload, and removes the ones a target locale cannot
 * hold.
 *
 * A link is carried across untranslated, but it is not locale-free. When both ends are localized,
 * Strapi resolves a link written at `zh-CN` against the `zh-CN` version of the entry it points at,
 * and an entry with no such version does not degrade to "no link" — it rejects the write:
 *
 *     Document with id "…", locale "zh-CN" not found
 *
 * One untranslated sector therefore costs a whole page its translation. Strapi's own "fill in from
 * another locale" meets the same rule and answers it by leaving such links out
 * (`resolveRelationsForLocaleBatch` in `@strapi/i18n`), which is what this does too. The link is
 * not lost: it is still on the source locale, and can be made in the target once the entry it
 * points at has been translated.
 *
 * Collecting and pruning are separate because the question in between — does this entry exist in
 * that locale — needs a database, and this module has none.
 *
 * Pure and Strapi-free.
 */

export interface RelationLink {
  /** The content type the link points at. */
  targetUid: string;
  documentId: string;
  /** Path of the attribute holding the link, in the extractor's dot-and-index form. */
  path: string;
}

export interface LinkInput {
  schema: ExtractorSchema;
  components: ComponentSchemas;
  /** The payload about to be written. Never mutated. */
  data: Record<string, unknown>;
}

export interface PruneResult {
  data: Record<string, unknown>;
  dropped: RelationLink[];
}

type Keep = (link: RelationLink) => boolean;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Walks a payload with its schema and rebuilds it, keeping only the links `keep` accepts.
 *
 * The walk is schema-led for the same reason id-stripping is in `locale-payload`: a media object
 * and a linked entry look alike as data — both carry an `id` and a `documentId` — and only the
 * attribute's type tells them apart.
 */
const mapLinks = ({ schema, components, data }: LinkInput, keep: Keep): Record<string, unknown> => {
  const visitNode = (
    nodeSchema: ExtractorSchema | undefined,
    node: unknown,
    path: string
  ): unknown => {
    if (!nodeSchema || !isPlainObject(node)) {
      return node;
    }

    const visited: Record<string, unknown> = { ...node };

    for (const [name, attribute] of Object.entries(nodeSchema.attributes)) {
      if (!(name in visited)) {
        continue;
      }

      visited[name] = visitAttribute(attribute, visited[name], path ? `${path}.${name}` : name);
    }

    return visited;
  };

  const visitAttribute = (attribute: ExtractorAttribute, value: unknown, path: string): unknown => {
    if (attribute.type === 'relation') {
      return visitRelation(attribute, value, path);
    }

    if (attribute.type === 'component') {
      const componentSchema = attribute.component ? components[attribute.component] : undefined;

      return Array.isArray(value)
        ? value.map((item, index) => visitNode(componentSchema, item, `${path}.${index}`))
        : visitNode(componentSchema, value, path);
    }

    if (attribute.type === 'dynamiczone' && Array.isArray(value)) {
      return value.map((item, index) => {
        const uid = (item as { __component?: string })?.__component;

        return visitNode(uid ? components[uid] : undefined, item, `${path}.${index}`);
      });
    }

    return value;
  };

  const visitRelation = (attribute: ExtractorAttribute, value: unknown, path: string): unknown => {
    const keeps = (item: unknown): boolean => {
      // Without a document id there is nothing to resolve against a locale, and so no basis for
      // calling the link unavailable. It is left for Strapi to judge.
      if (!isPlainObject(item) || typeof item.documentId !== 'string') {
        return true;
      }

      // A polymorphic attribute declares no target; each item names its own in `__type`.
      const targetUid =
        attribute.target ?? (typeof item.__type === 'string' ? item.__type : undefined);

      if (!targetUid) {
        return true;
      }

      return keep({ targetUid, documentId: item.documentId, path });
    };

    if (Array.isArray(value)) {
      return value.filter(keeps);
    }

    return keeps(value) ? value : null;
  };

  return visitNode(schema, data, '') as Record<string, unknown>;
};

/** Every linked entry in the payload, as document ids grouped by the content type they belong to. */
export const collectLinks = (input: LinkInput): Map<string, Set<string>> => {
  const links = new Map<string, Set<string>>();

  mapLinks(input, ({ targetUid, documentId }) => {
    const documentIds = links.get(targetUid) ?? new Set<string>();

    documentIds.add(documentId);
    links.set(targetUid, documentIds);

    return true;
  });

  return links;
};

/** The payload without the links `isAvailable` rejects, and a record of each one removed. */
export const pruneLinks = (input: LinkInput, isAvailable: Keep): PruneResult => {
  const dropped: RelationLink[] = [];

  const data = mapLinks(input, (link) => {
    if (isAvailable(link)) {
      return true;
    }

    dropped.push(link);

    return false;
  });

  return { data, dropped };
};

/**
 * Says what was left out, in words an editor can act on.
 *
 * Counted in entries rather than links: a sector linked from three sections is one entry to
 * translate, and that is the job the sentence is handing over.
 *
 * Returns undefined when nothing was dropped, so a clean write carries no notice at all.
 */
export const describeDropped = (
  dropped: RelationLink[],
  targetLocale: string,
  nameOf: (targetUid: string) => string
): string | undefined => {
  if (dropped.length === 0) {
    return undefined;
  }

  const entries = new Map<string, Set<string>>();

  for (const { targetUid, documentId } of dropped) {
    const documentIds = entries.get(targetUid) ?? new Set<string>();

    documentIds.add(documentId);
    entries.set(targetUid, documentIds);
  }

  const total = [...entries.values()].reduce((sum, documentIds) => sum + documentIds.size, 0);
  const breakdown = [...entries]
    .map(([targetUid, documentIds]) => `${nameOf(targetUid)} (${documentIds.size})`)
    .join(', ');

  return (
    `Links to ${total} ${total === 1 ? 'entry' : 'entries'} with no ${targetLocale} version were ` +
    `left out: ${breakdown}. Translate ${total === 1 ? 'it' : 'them'} to link ` +
    `${total === 1 ? 'it' : 'them'} from ${targetLocale}.`
  );
};
