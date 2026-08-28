// @vitest-environment jsdom
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../testing/render';

/**
 * The plugin's own hooks are stubbed; the **router is real**.
 *
 * That split is the point of this file. Both defects that reached a browser during #18 and #19 were
 * invisible to the test suite because the only tests were over pure functions, and the inputs came
 * from Strapi. The route is one of those inputs — the Content Manager routes creation as
 * `/…/:slug/create`, which matches the same `:collectionType/:slug/:id` pattern as a saved entry, so
 * `useParams().id` is the literal string `create`. Mocking `useParams` would have reproduced the
 * assumption rather than the behaviour, and would have passed while the button was visibly wrong.
 */
const hooks = {
  canTranslate: true as boolean,
  translatable: true as boolean | null,
  locales: [
    { code: 'en', name: 'English (en)', isDefault: true },
    { code: 'ar', name: 'Arabic (ar)', isDefault: false },
  ],
  query: {} as Record<string, unknown>,
};

vi.mock('../../hooks/useTranslatePermission', () => ({
  useTranslatePermission: () => ({ canTranslate: hooks.canTranslate }),
}));

vi.mock('../../hooks/useTranslatableContentTypes', () => ({
  useTranslatableContentTypes: () => ({ isTranslatable: () => hooks.translatable }),
}));

vi.mock('../../hooks/useLocales', () => ({
  useLocales: () => ({ locales: hooks.locales, isLoading: false }),
}));

vi.mock('@strapi/strapi/admin', () => ({
  useQueryParams: () => [{ query: hooks.query }, vi.fn()],
}));

// The dialog fetches, polls and starts jobs. This file is about whether the control is offered and
// whether it opens — not about what the dialog then does.
vi.mock('./TranslateModal', () => ({
  TranslateModal: ({ sourceLocale }: { sourceLocale: string }) => (
    <div data-testid="translate-modal">source: {sourceLocale}</div>
  ),
}));

const { TranslateEditViewButton } = await import('./TranslateEditViewButton');

const UID = 'api::article.article';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/content-manager/:collectionType/:slug/:id"
          element={<TranslateEditViewButton slug={UID} />}
        />
        <Route
          path="/content-manager/:collectionType/:slug"
          element={<TranslateEditViewButton slug={UID} />}
        />
      </Routes>
    </MemoryRouter>
  );

const savedEntry = `/content-manager/collection-types/${UID}/abc123`;
const createRoute = `/content-manager/collection-types/${UID}/create`;
const singleType = `/content-manager/single-types/${UID}`;

const button = () => screen.queryByRole('button', { name: 'AI Translate' });

beforeEach(() => {
  hooks.canTranslate = true;
  hooks.translatable = true;
  hooks.query = {};
});

describe('TranslateEditViewButton', () => {
  it('offers the action on a saved entry', () => {
    renderAt(savedEntry);

    expect(button()).not.toBeNull();
  });

  /** The defect this file exists for. `create` is a path segment, not a document identifier. */
  it('withholds it on the create route, where no entry exists yet', () => {
    renderAt(createRoute);

    expect(button()).toBeNull();
  });

  it('offers it on a single type, whose identifier the server resolves', () => {
    renderAt(singleType);

    expect(button()).not.toBeNull();
  });

  it('withholds it from a role without the translate permission', () => {
    hooks.canTranslate = false;
    renderAt(savedEntry);

    expect(button()).toBeNull();
  });

  it('withholds it from a content type without internationalization', () => {
    hooks.translatable = false;
    renderAt(savedEntry);

    expect(button()).toBeNull();
  });

  it('withholds it while the content-type list is still resolving', () => {
    hooks.translatable = null;
    renderAt(savedEntry);

    expect(button()).toBeNull();
  });

  it('opens the dialog when pressed', async () => {
    renderAt(savedEntry);
    button()?.click();

    expect(await screen.findByTestId('translate-modal')).not.toBeNull();
  });

  it('translates from the locale in the query string', async () => {
    hooks.query = { plugins: { i18n: { locale: 'ar' } } };
    renderAt(savedEntry);
    button()?.click();

    expect((await screen.findByTestId('translate-modal')).textContent).toBe('source: ar');
  });

  /** No locale in the URL means the editor is looking at the default one. */
  it('falls back to the default locale when the query string carries none', async () => {
    renderAt(savedEntry);
    button()?.click();

    expect((await screen.findByTestId('translate-modal')).textContent).toBe('source: en');
  });
});
