import { describe, expect, it } from 'vitest';

import { canOfferTranslation } from './translateAvailability';

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
