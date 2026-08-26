/**
 * Reads and writes deep paths, and reinjects translated values into a clone of a document.
 *
 * Pure and Strapi-free. Paths are dot-separated, with numeric segments addressing array indices:
 * `Sections.1.Heading`. The extractor produces them and this module consumes them, so the two
 * agree on one notation.
 *
 * The guiding rule is that reinjection never invents structure. A translated value whose path has
 * disappeared is dropped, not created — the document changed while the job was running, and
 * guessing at a shape would corrupt it rather than fix it.
 */

const segmentsOf = (path: string): string[] => path.split('.');

const isIndex = (segment: string): boolean => /^\d+$/.test(segment);

const descend = (node: unknown, segment: string): unknown => {
  if (node === null || typeof node !== 'object') {
    return undefined;
  }

  if (Array.isArray(node)) {
    return isIndex(segment) ? node[Number(segment)] : undefined;
  }

  return (node as Record<string, unknown>)[segment];
};

export const readPath = (data: unknown, path: string): unknown =>
  segmentsOf(path).reduce<unknown>((node, segment) => descend(node, segment), data);

/**
 * Sets `path` on `data` in place. Silently does nothing when the parent path is missing, or when
 * the final key does not already exist on its parent.
 */
export const writePath = (data: unknown, path: string, value: unknown): void => {
  const segments = segmentsOf(path);
  const last = segments.pop();

  if (last === undefined) {
    return;
  }

  const parent = segments.reduce<unknown>((node, segment) => descend(node, segment), data);

  if (parent === null || typeof parent !== 'object') {
    return;
  }

  if (Array.isArray(parent)) {
    if (isIndex(last) && Number(last) < parent.length) {
      parent[Number(last)] = value;
    }

    return;
  }

  // Only overwrite a key that is already there. A path the extractor produced always exists in
  // the document it came from, so an absent key means the document has since changed.
  if (last in (parent as Record<string, unknown>)) {
    (parent as Record<string, unknown>)[last] = value;
  }
};

/**
 * Returns a deep clone of `source` with each `path → value` applied.
 *
 * Cloning rather than mutating is what keeps media, relations and non-localized fields intact: the
 * clone carries them through untouched, and only the extracted paths are replaced.
 */
export const reinject = <T extends Record<string, unknown>>(
  source: T,
  values: Record<string, unknown>
): T => {
  const clone = structuredClone(source);

  for (const [path, value] of Object.entries(values)) {
    writePath(clone, path, value);
  }

  return clone;
};
