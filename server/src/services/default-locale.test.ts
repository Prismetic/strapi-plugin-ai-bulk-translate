import { describe, expect, it, vi } from 'vitest';

import { defaultLocaleCode } from './default-locale';

/**
 * The stub mirrors the real i18n contract rather than a convenient one, and that is the point of
 * this test. `locales.find()` returns raw rows with **no** `isDefault` — i18n's own controller
 * decorates them afterwards with `setIsDefault`. Reading `isDefault` off `find()` therefore always
 * answers false, silently, which is exactly the bug this replaced.
 */
const i18nStub = (defaultCode: unknown) => ({
  plugin: () => ({
    service: () => ({
      find: async () => [
        { code: 'en', name: 'English (en)' },
        { code: 'ar', name: 'Arabic (ar)' },
      ],
      getDefaultLocale: async () => defaultCode,
    }),
  }),
});

describe('defaultLocaleCode', () => {
  it('reads the code from i18n rather than from the locale rows', async () => {
    await expect(defaultLocaleCode(i18nStub('en') as never)).resolves.toBe('en');
  });

  it('answers null when i18n has no default stored', async () => {
    await expect(defaultLocaleCode(i18nStub(undefined) as never)).resolves.toBeNull();
  });

  it('answers null rather than an empty code', async () => {
    await expect(defaultLocaleCode(i18nStub('') as never)).resolves.toBeNull();
  });

  it('answers null when i18n is not installed at all', async () => {
    const noI18n = {
      plugin: () => {
        throw new Error('i18n is not installed');
      },
    };

    await expect(defaultLocaleCode(noI18n as never)).resolves.toBeNull();
  });

  it('does not fall back to reading isDefault off the rows', async () => {
    const find = vi.fn();
    const strapiStub = {
      plugin: () => ({ service: () => ({ find, getDefaultLocale: async () => 'en' }) }),
    };

    await defaultLocaleCode(strapiStub as never);

    expect(find).not.toHaveBeenCalled();
  });
});
