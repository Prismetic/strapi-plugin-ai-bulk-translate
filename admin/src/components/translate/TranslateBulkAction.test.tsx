// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '../../testing/render';

/**
 * A bulk action is not a rendered component: it returns a *description* that the Content Manager
 * renders, or `null` to remove itself from the menu. So it is exercised through a harness that
 * calls it as a hook and hands back what it returned — the hooks inside it need a React render to
 * run at all.
 */
const hooks = { canTranslate: true as boolean, translatable: true as boolean | null };

vi.mock('../../hooks/useTranslatePermission', () => ({
  useTranslatePermission: () => ({ canTranslate: hooks.canTranslate }),
}));

vi.mock('../../hooks/useTranslatableContentTypes', () => ({
  useTranslatableContentTypes: () => ({ isTranslatable: () => hooks.translatable }),
}));

vi.mock('./TranslateModal', () => ({ TranslateModal: () => null }));

const { TranslateBulkAction } = await import('./TranslateBulkAction');

type Description = { label: string } | null;

const describeAction = (props: Parameters<typeof TranslateBulkAction>[0]): Description => {
  let result: Description = null;

  const Harness = () => {
    result = TranslateBulkAction(props) as Description;

    return null;
  };

  render(<Harness />);

  return result;
};

const rows = [
  { documentId: 'a', locale: 'en' },
  { documentId: 'b', locale: 'en' },
];

/** A selection of two localized rows in a collection type's list view — the ordinary case. */
const action = (over: Parameters<typeof TranslateBulkAction>[0] = {}): Description =>
  describeAction({
    documents: rows,
    model: 'api::a.a',
    collectionType: 'collection-types',
    ...over,
  });

beforeEach(() => {
  hooks.canTranslate = true;
  hooks.translatable = true;
});

describe('TranslateBulkAction', () => {
  /** Named for the mechanism, and identically to the edit view — one action, one name. */
  it('offers itself for a selection of localized entries', () => {
    expect(action()?.label).toBe('AI Translate');
  });

  it('removes itself when nothing is selected', () => {
    expect(action({ documents: [] })).toBeNull();
  });

  /** Single types have no list view; their surface is the edit-view button. */
  it('removes itself from anything that is not a collection type', () => {
    expect(action({ collectionType: 'single-types' })).toBeNull();
  });

  it('removes itself from a role without the translate permission', () => {
    hooks.canTranslate = false;

    expect(action()).toBeNull();
  });

  it('removes itself from a content type without internationalization', () => {
    hooks.translatable = false;

    expect(action()).toBeNull();
  });

  it('removes itself while the content-type list is still resolving', () => {
    hooks.translatable = null;

    expect(action()).toBeNull();
  });

  /** Rows carry the locale the list view is showing; without one there is nothing to read from. */
  it('removes itself when the selected rows carry no locale', () => {
    expect(action({ documents: [{ documentId: 'a' }] })).toBeNull();
  });
});
