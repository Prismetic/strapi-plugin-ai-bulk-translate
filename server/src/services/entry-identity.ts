import type { Core } from '@strapi/strapi';

/**
 * How a run names the entries it touched.
 *
 * Captured when the run is created and stored on it, rather than resolved when history is read.
 * That is deliberate: history most needs to name an entry precisely when the entry has been
 * renamed or deleted since, and a lookup answers nothing exactly then. A title frozen at run time
 * is not stale — it is what the run was actually about.
 */
export interface JobDocument {
  documentId: string;
  title: string;
  /** The entry's page path in the source locale, where the content type has one. */
  sourcePath: string | null;
}

interface SchemaLike {
  attributes?: Record<string, { type?: string }>;
}

/** The attribute a page path lives in, if the content type has one. Pure, so it is testable. */
export const uidFieldOf = (schema: SchemaLike | undefined): string | null =>
  Object.entries(schema?.attributes ?? {}).find(
    ([, attribute]) => attribute?.type === 'uid'
  )?.[0] ?? null;

/**
 * The title an entry is known by, from the Content Manager's own configuration.
 *
 * The same source the translation dialog uses, so an entry is called the same thing wherever the
 * plugin mentions it. A missing configuration is not a reason to fail whatever asked.
 */
export const titleOf = async (
  strapiInstance: Core.Strapi,
  contentType: string,
  document: Record<string, unknown>
): Promise<string> => {
  try {
    const schema = strapiInstance.contentType(contentType as never);
    const configuration = await strapiInstance
      .plugin('content-manager')
      .service('content-types')
      .findConfiguration(schema as never);

    const mainField = configuration?.settings?.mainField as string | undefined;
    const value = mainField ? document[mainField] : undefined;

    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  } catch {
    // A content type with no configuration still has entries worth naming by identifier.
  }

  return String(document.documentId ?? 'Untitled');
};

/**
 * Titles and paths for the entries a run is about, read once when the run is created.
 *
 * An entry that cannot be read is still recorded, by identifier: a run that touched it should
 * appear in history whether or not the entry survived long enough to be described.
 */
export const identifyDocuments = async (
  strapiInstance: Core.Strapi,
  contentType: string,
  documentIds: string[],
  locale: string
): Promise<JobDocument[]> => {
  const pathField = uidFieldOf(strapiInstance.contentType(contentType as never) as SchemaLike);

  return Promise.all(
    documentIds.map(async (documentId) => {
      try {
        const document = (await strapiInstance
          .documents(contentType as never)
          .findOne({ documentId, locale, status: 'draft' as never })) as Record<
          string,
          unknown
        > | null;

        if (!document) {
          return { documentId, title: documentId, sourcePath: null };
        }

        const path = pathField ? document[pathField] : null;

        return {
          documentId,
          title: await titleOf(strapiInstance, contentType, { ...document, documentId }),
          sourcePath: typeof path === 'string' && path !== '' ? path : null,
        };
      } catch {
        return { documentId, title: documentId, sourcePath: null };
      }
    })
  );
};
