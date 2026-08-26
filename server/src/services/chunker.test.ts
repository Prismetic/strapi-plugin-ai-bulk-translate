import { describe, expect, it } from 'vitest';

import { chunkFields, estimateTokens, joinParts, splitValue } from './chunker';

import type { TranslatableField } from './field-extractor';

const field = (path: string, value: string): TranslatableField => ({
  path,
  value,
  type: 'text',
});

/** Roughly four characters to a token, so this is about 25 tokens of prose. */
const words = (count: number) => Array.from({ length: count }, () => 'lorem').join(' ');

describe('estimateTokens', () => {
  it('grows with the length of the text', () => {
    expect(estimateTokens('a'.repeat(400))).toBeGreaterThan(estimateTokens('a'.repeat(40)));
  });

  it('charges something for even an empty string, since the key still costs tokens', () => {
    expect(estimateTokens('')).toBeGreaterThan(0);
  });
});

describe('chunkFields', () => {
  it('puts everything in one chunk when it fits', () => {
    const fields = [field('a', 'one'), field('b', 'two'), field('c', 'three')];
    const chunks = chunkFields(fields, { maxTokens: 1000 });

    expect(chunks).toHaveLength(1);
    expect(chunks[0].map((part) => part.path)).toEqual(['a', 'b', 'c']);
  });

  it('returns nothing for no fields, so no empty request is ever made', () => {
    expect(chunkFields([], { maxTokens: 1000 })).toEqual([]);
  });

  it('packs by estimated size rather than by a fixed field count', () => {
    // Ten small fields and a budget that comfortably fits them: one request, not two.
    const many = Array.from({ length: 10 }, (_, index) => field(`f${index}`, 'short'));

    expect(chunkFields(many, { maxTokens: 500 })).toHaveLength(1);
  });

  it('splits into several chunks when the total exceeds the budget', () => {
    const fields = Array.from({ length: 6 }, (_, index) => field(`f${index}`, words(40)));
    const chunks = chunkFields(fields, { maxTokens: 120 });

    expect(chunks.length).toBeGreaterThan(1);

    // Every field survives exactly once, in order.
    expect(chunks.flat().map((part) => part.path)).toEqual(fields.map((f) => f.path));
  });

  it('keeps every chunk within the budget', () => {
    const fields = Array.from({ length: 12 }, (_, index) => field(`f${index}`, words(30)));
    const chunks = chunkFields(fields, { maxTokens: 200 });

    for (const chunk of chunks) {
      const total = chunk.reduce((sum, part) => sum + estimateTokens(part.value), 0);

      expect(total).toBeLessThanOrEqual(200);
    }
  });

  /**
   * The case a fixed batch size cannot handle: one field bigger than a whole request. It has to be
   * broken up, or the request goes out oversized and the provider rejects it.
   */
  it('splits a single oversized field across chunks', () => {
    const huge = field('Body', `${words(200)}\n\n${words(200)}\n\n${words(200)}`);
    const chunks = chunkFields([huge], { maxTokens: 150 });

    expect(chunks.length).toBeGreaterThan(1);

    const parts = chunks.flat();
    expect(parts.every((part) => part.path === 'Body')).toBe(true);
    expect(parts.every((part) => estimateTokens(part.value) <= 150)).toBe(true);
  });

  it('numbers the parts of a split field so they can be put back in order', () => {
    const huge = field('Body', `${words(200)}\n\n${words(200)}\n\n${words(200)}`);
    const parts = chunkFields([huge], { maxTokens: 150 }).flat();

    expect(parts.map((part) => part.partIndex)).toEqual(parts.map((_, index) => index));
    expect(new Set(parts.map((part) => part.partCount))).toEqual(new Set([parts.length]));
  });

  it('marks an unsplit field as a single part', () => {
    const parts = chunkFields([field('a', 'short')], { maxTokens: 1000 }).flat();

    expect(parts[0]).toMatchObject({ path: 'a', partIndex: 0, partCount: 1 });
  });

  it('splits a field with no paragraph breaks at all', () => {
    const parts = chunkFields([field('Body', 'x'.repeat(4000))], { maxTokens: 100 }).flat();

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => estimateTokens(part.value) <= 100)).toBe(true);
  });
});

describe('splitValue', () => {
  it('is lossless — the parts concatenate back to the original', () => {
    const original = `First paragraph.\n\nSecond paragraph.\n\nThird one is here.`;
    const parts = splitValue(original, 18);

    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join('')).toBe(original);
  });

  it('is lossless for text with no break to split on', () => {
    const original = 'y'.repeat(500);

    expect(splitValue(original, 20).join('')).toBe(original);
  });

  /**
   * A budget smaller than the per-part overhead leaves no room for text at all. It still has to
   * terminate and still has to be lossless, rather than looping or dropping the tail.
   */
  it('is lossless even when the budget is below the per-part overhead', () => {
    const original = 'One.\n\nTwo.\n\nThree.';

    expect(splitValue(original, 1).join('')).toBe(original);
  });

  it('prefers to break at a paragraph boundary', () => {
    const parts = splitValue('One.\n\nTwo.\n\nThree.', 14);

    // A break inside "One." would prove it split blindly by character count.
    expect(parts[0]).toBe('One.\n\n');
  });

  it('returns a single part when the value already fits', () => {
    expect(splitValue('short enough', 1000)).toEqual(['short enough']);
  });
});

describe('joinParts', () => {
  it('reassembles translated parts in order', () => {
    expect(
      joinParts([
        { partIndex: 1, value: ' world' },
        { partIndex: 0, value: 'hello' },
      ])
    ).toBe('hello world');
  });

  it('returns a single part unchanged', () => {
    expect(joinParts([{ partIndex: 0, value: 'just this' }])).toBe('just this');
  });
});
