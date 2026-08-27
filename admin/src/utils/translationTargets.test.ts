import { describe, expect, it } from 'vitest';

import { translationTargets } from './translationTargets';

const locales = [
  { code: 'en', name: 'English (en)', isDefault: true },
  { code: 'fr', name: 'French (fr)', isDefault: false },
  { code: 'de', name: 'German (de)', isDefault: false },
];

describe('translationTargets', () => {
  it('offers every locale but the source when the editor is in the default locale', () => {
    expect(translationTargets(locales, 'en').map((locale) => locale.code)).toEqual(['fr', 'de']);
  });

  it('withholds the default locale when the editor is working in another one', () => {
    expect(translationTargets(locales, 'fr').map((locale) => locale.code)).toEqual(['de']);
  });

  it('offers nothing when the only other locale is the default', () => {
    expect(translationTargets(locales.slice(0, 2), 'fr')).toEqual([]);
  });

  it('withholds the default even from a source that is not in the list', () => {
    expect(translationTargets(locales, 'es').map((locale) => locale.code)).toEqual(['fr', 'de']);
  });

  it('returns an empty list when no locales have loaded yet', () => {
    expect(translationTargets([], 'en')).toEqual([]);
  });
});
