import { describe, expect, it } from 'vitest';

import { fallbackTitle, uidFieldOf } from './entry-identity';

const schema = (attributes: Record<string, { type: string; targetField?: string }>) =>
  ({ attributes }) as never;

describe('uidFieldOf', () => {
  it('finds the field a page path is stored in', () => {
    expect(uidFieldOf(schema({ title: { type: 'string' }, slug: { type: 'uid' } }))).toBe('slug');
  });

  it('answers nothing for a content type that has no such field', () => {
    expect(uidFieldOf(schema({ title: { type: 'string' } }))).toBeNull();
  });

  /** Rare, but a schema can hold more than one; the first is the one the routes use. */
  it('takes the first when a type has several', () => {
    expect(uidFieldOf(schema({ slug: { type: 'uid' }, alternate: { type: 'uid' } }))).toBe('slug');
  });

  it('survives a schema with no attributes at all', () => {
    expect(uidFieldOf(schema({}))).toBeNull();
    expect(uidFieldOf(undefined as never)).toBeNull();
  });
});

describe('fallbackTitle', () => {
  /** The preview showed `e5e8ckg9xx3wvglzkln1uy1h` for a homepage. Nobody calls it that. */
  it('names a single type by its content type', () => {
    expect(
      fallbackTitle(
        { kind: 'singleType', info: { displayName: 'Homepage' } } as never,
        'e5e8ckg9xx3wvglzkln1uy1h'
      )
    ).toBe('Homepage');
  });

  it('names a collection-type entry by its identifier', () => {
    expect(
      fallbackTitle({ kind: 'collectionType', info: { displayName: 'Article' } } as never, 'abc')
    ).toBe('abc');
  });

  it('has something to say even with no schema and no identifier', () => {
    expect(fallbackTitle(undefined, undefined)).toBe('Untitled');
  });
});
