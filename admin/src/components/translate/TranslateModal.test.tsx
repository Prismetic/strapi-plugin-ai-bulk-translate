// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../testing/render';

/**
 * The dialog itself, with every hook that talks to the server stubbed.
 *
 * What is worth pinning here is the target list. The rule it enforces — the default locale is the
 * install's source of truth and is never written by a run — is enforced twice on purpose, in
 * `translationTargets` and again server-side in `rejectTargetLocales`. This is the assertion that
 * the dialog actually applies it, rather than that the pure function would if it were called.
 */
const hooks = {
  locales: [
    { code: 'en', name: 'English', isDefault: true },
    { code: 'ar', name: 'Arabic', isDefault: false },
    { code: 'fr', name: 'French', isDefault: false },
  ],
};

vi.mock('../../hooks/useLocales', () => ({
  useLocales: () => ({ locales: hooks.locales, isLoading: false }),
}));

vi.mock('../../hooks/useModels', () => ({
  useModels: () => ({
    models: [
      {
        id: 1,
        providerId: 1,
        modelId: 'gpt-5.4-mini',
        label: 'Fast',
        enabled: true,
        isDefault: true,
        providerLabel: 'OpenAI',
        providerType: 'openai',
        providerEnabled: true,
      },
    ],
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('../../hooks/useLocaleStatus', () => ({
  useLocaleStatus: () => ({
    rows: [],
    isLoading: false,
    error: null,
    excluded: [],
    translatable: [],
  }),
}));

vi.mock('../../hooks/useTranslationJob', () => ({
  useTranslationJob: () => ({
    job: null,
    error: null,
    isStarting: false,
    isRunning: false,
    failedCount: 0,
    start: vi.fn(),
    retry: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock('@strapi/strapi/admin', () => ({
  useQueryParams: () => [{ query: {} }, vi.fn()],
}));

const { TranslateModal } = await import('./TranslateModal');

const open = (sourceLocale: string) =>
  render(
    <TranslateModal
      contentType="api::article.article"
      documentIds={['abc123']}
      sourceLocale={sourceLocale}
      onClose={vi.fn()}
    />
  );

/**
 * Matched on the parenthesised code rather than a bare substring: locale labels read
 * "French (fr)", and a loose `/en/` matches "Fr**en**ch".
 */
const offered = (code: string) =>
  screen.queryByRole('checkbox', { name: new RegExp(`\\(${code}\\)`) });

beforeEach(() => {
  hooks.locales = [
    { code: 'en', name: 'English', isDefault: true },
    { code: 'ar', name: 'Arabic', isDefault: false },
    { code: 'fr', name: 'French', isDefault: false },
  ];
});

describe('TranslateModal target locales', () => {
  it('offers the other locales when translating from the default one', () => {
    open('en');

    expect(offered('ar')).not.toBeNull();
    expect(offered('fr')).not.toBeNull();
  });

  /** An editor working in `ar` was previously offered `en`, and could overwrite the source. */
  it('never offers the default locale, whatever the editor is viewing', () => {
    open('ar');

    expect(offered('en')).toBeNull();
    expect(offered('fr')).not.toBeNull();
  });

  it('does not offer the locale being translated from', () => {
    open('ar');

    expect(offered('ar')).toBeNull();
  });

  /** Nothing left to offer is explained, rather than shown as an empty list. */
  it('says so when the only other locale is the default', () => {
    hooks.locales = [
      { code: 'en', name: 'English', isDefault: true },
      { code: 'ar', name: 'Arabic', isDefault: false },
    ];
    open('ar');

    expect(offered('en')).toBeNull();
    expect(
      screen.getByText(/no other locale|nothing to translate into|at least one locale/i)
    ).toBeTruthy();
  });
});
