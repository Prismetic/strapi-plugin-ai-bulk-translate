import { describe, expect, it } from 'vitest';

import { uidFieldOf } from './entry-identity';

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
