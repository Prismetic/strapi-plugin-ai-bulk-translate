// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen } from '../../testing/render';

import type { JobDetail as Detail } from '../../hooks/useJobDetail';

const retry = vi.fn().mockResolvedValue(true);

const state: {
  job: Detail | null;
  isLoading: boolean;
  error: string | null;
} = { job: null, isLoading: false, error: null };

vi.mock('../../hooks/useJobDetail', () => ({
  useJobDetail: () => ({ ...state, isRetrying: false, retry, refresh: vi.fn() }),
}));

const { JobDetail } = await import('./JobDetail');

const detail = (over: Partial<Detail> = {}): Detail =>
  ({
    id: 1,
    contentType: 'api::article.article',
    sourceLocale: 'en',
    targetLocales: ['ar', 'fr'],
    documents: [{ documentId: 'abc', title: 'Rome', sourcePath: '/rome' }],
    items: [
      { documentId: 'abc', locale: 'ar', status: 'translated', targetPath: '/ar/roma' },
      { documentId: 'abc', locale: 'fr', status: 'failed', error: 'Provider rejected the key' },
    ],
    progress: { total: 2, done: 2, translated: 1, skipped: 0, failed: 1 },
    ...over,
  }) as Detail;

beforeEach(() => {
  state.job = detail();
  state.isLoading = false;
  state.error = null;
  retry.mockClear();
});

describe('JobDetail', () => {
  it('names the entry a run touched', () => {
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.getByText('Rome')).toBeTruthy();
  });

  it('shows every target locale with its outcome', () => {
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.getByText('ar')).toBeTruthy();
    expect(screen.getByText('fr')).toBeTruthy();
    expect(screen.getByText('translated')).toBeTruthy();
    expect(screen.getByText('failed')).toBeTruthy();
  });

  /** "Failed" alone sends someone hunting; the reason is the part they can act on. */
  it('gives a failure its reason', () => {
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.getByText('Provider rejected the key')).toBeTruthy();
  });

  it('explains why an item was skipped', () => {
    state.job = detail({
      items: [
        {
          documentId: 'abc',
          locale: 'ar',
          status: 'skipped',
          skippedReason: 'Already translated, and not authorised for overwrite.',
        },
      ],
      progress: { total: 1, done: 1, translated: 0, skipped: 1, failed: 0 },
    });
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.getByText(/not authorised for overwrite/)).toBeTruthy();
  });

  it('shows where a translation was written', () => {
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.getByText('/ar/roma')).toBeTruthy();
  });

  it('offers a retry naming how many items failed', () => {
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Retry 1 failed item' })).toBeTruthy();
  });

  /** An enabled button that always fails is worse than no button; the server refuses these. */
  it('offers no retry when nothing failed', () => {
    state.job = detail({
      items: [{ documentId: 'abc', locale: 'ar', status: 'translated' }],
      progress: { total: 1, done: 1, translated: 1, skipped: 0, failed: 0 },
    });
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });

  it('tells the list to refresh once a retry is accepted', async () => {
    const onRetried = vi.fn();
    render(<JobDetail id={1} onRetried={onRetried} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry 1 failed item' }));
    await vi.waitFor(() => expect(onRetried).toHaveBeenCalled());

    expect(retry).toHaveBeenCalled();
  });

  /** A run in progress cannot be stopped — offering a control that implies it can is the defect
      #15 fixed by renaming Cancel to Close. */
  it('never offers to cancel', () => {
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Cancel|Stop/i })).toBeNull();
  });

  it('reports a run it could not load', () => {
    state.error = 'Could not load this run.';
    render(<JobDetail id={1} onRetried={vi.fn()} />);

    expect(screen.getByText('Could not load this run.')).toBeTruthy();
  });
});
