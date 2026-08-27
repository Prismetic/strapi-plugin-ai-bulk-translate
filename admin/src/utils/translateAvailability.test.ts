import { describe, expect, it } from 'vitest';

import { canOfferTranslation, documentIdFromRoute } from './translateAvailability';

const collectionEntry = {
  canTranslate: true,
  translatable: true,
  sourceLocale: 'en',
  isSingleType: false,
  documentId: 'abc123',
};

describe('canOfferTranslation', () => {
  it('offers the action on a saved, localized entry the role may translate', () => {
    expect(canOfferTranslation(collectionEntry)).toBe(true);
  });

  it('withholds it from a role without the translate permission', () => {
    expect(canOfferTranslation({ ...collectionEntry, canTranslate: false })).toBe(false);
  });

  it('withholds it while the permission is still resolving', () => {
    expect(canOfferTranslation({ ...collectionEntry, canTranslate: null })).toBe(false);
  });

  it('withholds it from a content type without internationalization', () => {
    expect(canOfferTranslation({ ...collectionEntry, translatable: false })).toBe(false);
  });

  it('withholds it while the content-type list is still loading', () => {
    expect(canOfferTranslation({ ...collectionEntry, translatable: null })).toBe(false);
  });

  it('withholds it when no source locale is known', () => {
    expect(canOfferTranslation({ ...collectionEntry, sourceLocale: null })).toBe(false);
  });

  it('withholds it from a collection entry that has never been saved', () => {
    expect(canOfferTranslation({ ...collectionEntry, documentId: null })).toBe(false);
  });

  it('offers it on a single type with no identifier, which the server resolves', () => {
    expect(canOfferTranslation({ ...collectionEntry, isSingleType: true, documentId: null })).toBe(
      true
    );
  });
});

describe('documentIdFromRoute', () => {
  it('reads the identifier of a saved entry', () => {
    expect(documentIdFromRoute('abc123')).toBe('abc123');
  });

  /**
   * The Content Manager routes creation as `/…/:slug/create`, which matches the same
   * `:collectionType/:slug/:id` pattern as an entry. Taking the segment at face value made the
   * button appear on an entry that does not exist yet.
   */
  it('treats the create route as no entry, because "create" is a path segment not an id', () => {
    expect(documentIdFromRoute('create')).toBeNull();
  });

  it('treats an absent segment as no entry — a single type, or a clone', () => {
    expect(documentIdFromRoute(undefined)).toBeNull();
  });

  it('treats an empty segment as no entry', () => {
    expect(documentIdFromRoute('')).toBeNull();
  });
});
