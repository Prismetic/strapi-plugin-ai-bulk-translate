import { createHash } from 'node:crypto';

import type { TranslatableField } from './field-extractor';

/**
 * A fingerprint of exactly the text a run would send to a model.
 *
 * Built from the extracted translatable fields rather than from the document, so it covers
 * precisely what a translation depends on and nothing else: media, relations, non-localized fields
 * and publication state are all excluded by construction. Republishing an entry whose only change
 * was a relation is therefore provably not worth a model call — which is the objection the original
 * PRD used to defer monitoring in the first place.
 *
 * Sorted before hashing, because field order comes from schema traversal and can shift without the
 * text changing — a component reordered inside a dynamic zone, say.
 *
 * Path and value are separated by a NUL, which cannot appear in either. Without a separator that
 * text cannot contain, two fields could be made to look like one: "xy" in a single field would
 * fingerprint the same as "x" and "y" in two.
 */
const SEPARATOR = String.fromCharCode(0);

export const fingerprintFields = (fields: TranslatableField[]): string => {
  const canonical = fields
    .map((field) => `${field.path}${SEPARATOR}${String(field.value)}`)
    .sort()
    .join(SEPARATOR);

  return createHash('sha256').update(canonical).digest('hex');
};
