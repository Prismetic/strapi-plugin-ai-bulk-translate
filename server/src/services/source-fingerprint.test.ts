import { describe, expect, it } from 'vitest';

import { fingerprintFields } from './source-fingerprint';

const field = (path: string, value: string) => ({ path, value }) as never;

describe('fingerprintFields', () => {
  it('is the same for the same text', () => {
    const fields = [field('title', 'Rome'), field('body', 'A city')];

    expect(fingerprintFields(fields)).toBe(fingerprintFields([...fields]));
  });

  /**
   * Field order comes from schema traversal and can shift without the text changing — a component
   * reordered inside a dynamic zone, say. Only the words should matter.
   */
  it('does not change when the same fields arrive in another order', () => {
    expect(fingerprintFields([field('title', 'Rome'), field('body', 'A city')])).toBe(
      fingerprintFields([field('body', 'A city'), field('title', 'Rome')])
    );
  });

  it('changes when any text changes', () => {
    expect(fingerprintFields([field('title', 'Rome')])).not.toBe(
      fingerprintFields([field('title', 'Roma')])
    );
  });

  /** Moving text between fields is a real change, even though the words are identical. */
  it('changes when the same text moves to another field', () => {
    expect(fingerprintFields([field('title', 'Rome')])).not.toBe(
      fingerprintFields([field('subtitle', 'Rome')])
    );
  });

  it('changes when a field is added or removed', () => {
    expect(fingerprintFields([field('title', 'Rome')])).not.toBe(
      fingerprintFields([field('title', 'Rome'), field('body', 'A city')])
    );
  });

  /** Two fields must not be confusable with one whose text runs them together. */
  it('cannot be confused by text that spans a field boundary', () => {
    expect(fingerprintFields([field('a', 'x'), field('b', 'y')])).not.toBe(
      fingerprintFields([field('a', 'xy'), field('b', '')])
    );
  });

  it('has a stable answer for an entry with nothing to translate', () => {
    expect(fingerprintFields([])).toBe(fingerprintFields([]));
    expect(fingerprintFields([])).not.toBe(fingerprintFields([field('title', '')]));
  });
});
