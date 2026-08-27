import { describe, expect, it } from 'vitest';

import { rejectTargetLocales } from './target-locales';

describe('rejectTargetLocales', () => {
  it('accepts targets that are neither the source nor the default', () => {
    expect(
      rejectTargetLocales({ targetLocales: ['fr', 'de'], sourceLocale: 'en', defaultLocale: 'en' })
    ).toBeNull();
  });

  it('refuses a target that is also the source', () => {
    expect(
      rejectTargetLocales({ targetLocales: ['fr', 'en'], sourceLocale: 'en', defaultLocale: 'en' })
    ).toBe('The source locale cannot also be a target locale.');
  });

  it('refuses the default locale as a target, even from another source', () => {
    expect(
      rejectTargetLocales({ targetLocales: ['de', 'en'], sourceLocale: 'fr', defaultLocale: 'en' })
    ).toBe(
      '"en" is the default locale, which is the source of truth for this install and is never ' +
        'written by a translation run.'
    );
  });

  it('reports the source clash first when a target is both', () => {
    expect(
      rejectTargetLocales({ targetLocales: ['en'], sourceLocale: 'en', defaultLocale: 'en' })
    ).toBe('The source locale cannot also be a target locale.');
  });

  it('allows every other locale when the editor is working in the default locale', () => {
    expect(
      rejectTargetLocales({ targetLocales: ['fr', 'de'], sourceLocale: 'en', defaultLocale: 'en' })
    ).toBeNull();
  });

  it('applies only the source rule when the default locale cannot be resolved', () => {
    expect(
      rejectTargetLocales({ targetLocales: ['en', 'de'], sourceLocale: 'fr', defaultLocale: null })
    ).toBeNull();
  });
});
