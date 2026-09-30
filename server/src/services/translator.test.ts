import { describe, expect, it } from 'vitest';

import { isEmptyUid, shouldRegenerateUid } from './translator';

/**
 * The shapes Strapi's uid service hands back for a title it cannot slugify — see the note on
 * `isEmptyUid`. Confirmed against `@sindresorhus/slugify` 2.x: `slugify('建筑材料') === ''`.
 */
describe('isEmptyUid', () => {
  it('recognises the empty slug of a title in a script slugify drops', () => {
    expect(isEmptyUid('')).toBe(true);
  });

  it('recognises the collision suffix Strapi puts on an empty slug', () => {
    expect(isEmptyUid('-1')).toBe(true);
    expect(isEmptyUid('-25')).toBe(true);
  });

  it('accepts a slug that kept something of the title', () => {
    expect(isEmptyUid('mos-build-2025')).toBe(false);
    expect(isEmptyUid('2026')).toBe(false);
    expect(isEmptyUid('furniture-1')).toBe(false);
  });
});

describe('shouldRegenerateUid', () => {
  it('regenerates when the target locale has no identifier yet', () => {
    expect(shouldRegenerateUid(undefined)).toBe(true);
    expect(shouldRegenerateUid(null)).toBe(true);
  });

  it('regenerates over the empty slugs an earlier version left', () => {
    expect(shouldRegenerateUid('')).toBe(true);
    expect(shouldRegenerateUid('-25')).toBe(true);
  });

  /** A re-run changes the words, not the address somebody may have linked to. */
  it('keeps an identifier the target already has', () => {
    expect(shouldRegenerateUid('2-d-a-tour-v-kazan')).toBe(false);
    expect(shouldRegenerateUid('furniture')).toBe(false);
  });
});
