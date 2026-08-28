import { describe, expect, it } from 'vitest';

import { localeIn, patchLocale, toggleLocale } from './monitorPolicy';

const ar = { code: 'ar', overwriteContent: false, overwriteManualEdits: false };

describe('toggleLocale', () => {
  it('adds a locale with the safe policy, so monitoring one is never destructive by default', () => {
    expect(toggleLocale([], 'ar')).toEqual([ar]);
  });

  it('removes a locale that was already monitored', () => {
    expect(toggleLocale([ar], 'ar')).toEqual([]);
  });

  it('forgets a removed locale’s policy rather than resurrecting it', () => {
    const configured = [{ code: 'ar', overwriteContent: true, overwriteManualEdits: true }];

    expect(toggleLocale(toggleLocale(configured, 'ar'), 'ar')).toEqual([ar]);
  });

  it('leaves other locales alone', () => {
    expect(toggleLocale([ar], 'fr').map((locale) => locale.code)).toEqual(['ar', 'fr']);
  });
});

describe('patchLocale', () => {
  it('sets overwriting content', () => {
    expect(patchLocale([ar], 'ar', { overwriteContent: true })[0]).toMatchObject({
      overwriteContent: true,
    });
  });

  it('allows manual edits to be overwritten once content is', () => {
    const locales = patchLocale([ar], 'ar', { overwriteContent: true });

    expect(patchLocale(locales, 'ar', { overwriteManualEdits: true })[0]).toMatchObject({
      overwriteContent: true,
      overwriteManualEdits: true,
    });
  });

  /**
   * The order that produces the impossible state: tick both, then untick the parent. A disabled
   * control cannot prevent this, because it is only disabled once the parent is already off.
   */
  it('clears overwriting manual edits when overwriting content is turned off', () => {
    const both = patchLocale([ar], 'ar', { overwriteContent: true, overwriteManualEdits: true });

    expect(patchLocale(both, 'ar', { overwriteContent: false })[0]).toMatchObject({
      overwriteContent: false,
      overwriteManualEdits: false,
    });
  });

  it('refuses to hold manual edits without content, even if asked directly', () => {
    expect(patchLocale([ar], 'ar', { overwriteManualEdits: true })[0]).toMatchObject({
      overwriteManualEdits: false,
    });
  });

  it('leaves other locales untouched', () => {
    const locales = [ar, { code: 'fr', overwriteContent: false, overwriteManualEdits: false }];

    expect(patchLocale(locales, 'ar', { overwriteContent: true })[1]).toEqual(locales[1]);
  });
});

describe('localeIn', () => {
  it('finds a monitored locale', () => {
    expect(localeIn([ar], 'ar')).toBe(ar);
  });

  it('answers nothing for one that is not monitored', () => {
    expect(localeIn([ar], 'fr')).toBeUndefined();
  });
});
