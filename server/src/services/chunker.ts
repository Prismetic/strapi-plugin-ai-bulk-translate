import type { TranslatableField, TranslatableType } from './field-extractor';

/**
 * Packs extracted fields into request-sized batches by estimated token count.
 *
 * Packing by **field count** is the obvious approach and the wrong one: ten short headings and one
 * forty-paragraph article are both "ten fields", and the second produces a request no provider will
 * accept. Worse, a single field can exceed a whole request on its own, which no batch size can fix.
 * So the unit of work here is a *part* — usually a whole field, but a large field split into
 * several — and every part is guaranteed to fit.
 *
 * Pure and Strapi-free.
 */

/** Overhead per part for its key, label and separators in the prompt. */
const PER_PART_OVERHEAD_TOKENS = 12;

/** The usual rough conversion for English prose. Deliberately an estimate, not a tokenizer. */
const CHARS_PER_TOKEN = 4;

/**
 * A field, or one piece of a field too large to send whole.
 *
 * `partCount` travels with every part so the translator knows how many pieces to expect before it
 * reassembles, without having to scan the whole run.
 */
export interface FieldPart {
  path: string;
  value: string;
  type: TranslatableType;
  partIndex: number;
  partCount: number;
}

export interface ChunkOptions {
  /** Ceiling for one request, counted in estimated tokens. */
  maxTokens: number;
}

export const estimateTokens = (value: string): number =>
  Math.ceil(value.length / CHARS_PER_TOKEN) + PER_PART_OVERHEAD_TOKENS;

/** How much room a part's text may occupy, in characters, to stay inside a budget. */
const charBudget = (maxTokens: number): number =>
  Math.max(1, (maxTokens - PER_PART_OVERHEAD_TOKENS) * CHARS_PER_TOKEN);

/**
 * Breaks a value into pieces that each fit `maxTokens`.
 *
 * **Lossless by construction**: each piece keeps its own trailing separator, so the pieces
 * concatenate back to the original exactly and reassembly is a plain join with no separator to
 * guess at. Paragraph breaks are preferred, then line breaks, then sentence ends, and only then a
 * blind character split — a break mid-sentence costs translation quality, so it is the last resort.
 */
export const splitValue = (value: string, maxTokens: number): string[] => {
  if (estimateTokens(value) <= maxTokens) {
    return [value];
  }

  const limit = charBudget(maxTokens);
  const parts: string[] = [];
  let rest = value;

  while (rest.length > limit) {
    const window = rest.slice(0, limit);

    // Each candidate includes the separator itself, so nothing is dropped at the seam.
    const candidates = [
      window.lastIndexOf('\n\n') + 2,
      window.lastIndexOf('\n') + 1,
      window.lastIndexOf('. ') + 2,
      window.lastIndexOf('。') + 1,
    ];

    // A break in the first fifth would leave a uselessly small piece and many more requests.
    const cut = Math.max(...candidates.filter((index) => index > limit / 5));

    const at = Number.isFinite(cut) && cut > 0 ? cut : limit;

    parts.push(rest.slice(0, at));
    rest = rest.slice(at);
  }

  if (rest.length > 0) {
    parts.push(rest);
  }

  return parts;
};

export const chunkFields = (
  fields: TranslatableField[],
  { maxTokens }: ChunkOptions
): FieldPart[][] => {
  const parts: FieldPart[] = [];

  for (const field of fields) {
    const pieces = splitValue(field.value, maxTokens);

    pieces.forEach((value, index) => {
      parts.push({
        path: field.path,
        value,
        type: field.type,
        partIndex: index,
        partCount: pieces.length,
      });
    });
  }

  const chunks: FieldPart[][] = [];
  let current: FieldPart[] = [];
  let currentTokens = 0;

  for (const part of parts) {
    const cost = estimateTokens(part.value);

    if (current.length > 0 && currentTokens + cost > maxTokens) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }

    current.push(part);
    currentTokens += cost;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
};

/** Puts a split field back together. Order comes from `partIndex`, never from arrival order. */
export const joinParts = (parts: { partIndex: number; value: string }[]): string =>
  [...parts]
    .sort((a, b) => a.partIndex - b.partIndex)
    .map((part) => part.value)
    .join('');
