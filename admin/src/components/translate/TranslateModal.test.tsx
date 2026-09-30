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
    { code: 'en', name: 'English (en)', isDefault: true },
    { code: 'ar', name: 'Arabic (ar)', isDefault: false },
    { code: 'fr', name: 'French (fr)', isDefault: false },
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

const localeStatusCalls: unknown[][] = [];

vi.mock('../../hooks/useLocaleStatus', () => ({
  useLocaleStatus: (...args: unknown[]) => {
    localeStatusCalls.push(args);

    return {
      rows: [],
      isLoading: false,
      loaded: false,
      error: null,
      excluded: [],
      translatable: [],
    };
  },
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

const open = (
  sourceLocale: string,
  props: { documentIds?: string[]; isSingleType?: boolean } = {}
) =>
  render(
    <TranslateModal
      contentType="api::article.article"
      documentIds={props.documentIds ?? ['abc123']}
      sourceLocale={sourceLocale}
      isSingleType={props.isSingleType}
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
  localeStatusCalls.length = 0;
  hooks.locales = [
    { code: 'en', name: 'English (en)', isDefault: true },
    { code: 'ar', name: 'Arabic (ar)', isDefault: false },
    { code: 'fr', name: 'French (fr)', isDefault: false },
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

  /** The same defect reached the dialog, and had shipped in it. */
  it('names a locale once, not twice', () => {
    open('en');

    expect(screen.queryByText(/\(ar\)\s*\(ar\)/)).toBeNull();
    expect(screen.queryByText(/\(fr\)\s*\(fr\)/)).toBeNull();
  });

  it('does not offer the locale being translated from', () => {
    open('ar');

    expect(offered('ar')).toBeNull();
  });

  /** Nothing left to offer is explained, rather than shown as an empty list. */
  it('says so when the only other locale is the default', () => {
    hooks.locales = [
      { code: 'en', name: 'English (en)', isDefault: true },
      { code: 'ar', name: 'Arabic (ar)', isDefault: false },
    ];
    open('ar');

    expect(offered('en')).toBeNull();
    expect(
      screen.getByText(/no other locale|nothing to translate into|at least one locale/i)
    ).toBeTruthy();
  });
});

describe('TranslateModal preview', () => {
  /** A single type sends no identifier, and the preview must still be asked for. */
  it('tells the preview the server resolves the entry, for a single type', () => {
    open('en', { documentIds: [], isSingleType: true });

    expect(localeStatusCalls.at(-1)?.[4]).toEqual({ resolvesEntryServerSide: true });
  });

  it('does not claim that for a collection type', () => {
    open('en');

    expect(localeStatusCalls.at(-1)?.[4]).toEqual({ resolvesEntryServerSide: false });
  });

  /** Nothing has been shown about what the run would do, so it must not be offered. */
  it('keeps Translate disabled while the preview has not answered', () => {
    open('en');

    expect((screen.getByRole('button', { name: 'Translate' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
