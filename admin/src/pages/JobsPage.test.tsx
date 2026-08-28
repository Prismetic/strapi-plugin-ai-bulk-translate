// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render, screen } from '../testing/render';

import type { JobSummary } from '../hooks/useJobs';

const state: {
  jobs: JobSummary[];
  meta: { page: number; pageSize: number; total: number; pageCount: number } | null;
  isLoading: boolean;
  error: string | null;
} = { jobs: [], meta: null, isLoading: false, error: null };

/**
 * The hook is replaced outright rather than partially: importing the real module pulls in
 * '@strapi/strapi/admin', whose lodash imports Node's ESM resolver refuses — the mispackaging
 * CONVENTIONS.md records. Mock the boundary; do not reach through it.
 */
vi.mock('../hooks/useJobs', () => ({
  NEEDS_ATTENTION: ['queued', 'processing', 'failed'],
  isActive: () => false,
  useJobs: () => ({ ...state, refresh: vi.fn() }),
}));

const { JobsPage } = await import('./JobsPage');

const job = (over: Partial<JobSummary> = {}): JobSummary =>
  ({
    id: 1,
    origin: 'bulk',
    contentType: 'api::article.article',
    sourceLocale: 'en',
    targetLocales: ['ar', 'fr'],
    status: 'processing',
    documentCount: 3,
    modelId: 1,
    createdById: 7,
    createdByName: 'Ada Lovelace',
    createdAt: '2026-08-28T10:00:00.000Z',
    updatedAt: '2026-08-28T10:01:00.000Z',
    progress: { total: 6, done: 2, translated: 2, skipped: 0, failed: 0 },
    ...over,
  }) as JobSummary;

beforeEach(() => {
  state.jobs = [job()];
  state.meta = { page: 1, pageSize: 20, total: 1, pageCount: 1 };
  state.isLoading = false;
  state.error = null;
});

describe('JobsPage', () => {
  it('lists a run with its status, entries and progress', () => {
    render(<JobsPage />);

    expect(screen.getByText('processing')).toBeTruthy();
    expect(screen.getByText('2 of 6')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  /** `api::article.article` says nothing an editor needs. */
  it('names the content type the way an editor would', () => {
    render(<JobsPage />);

    expect(screen.getByText('article')).toBeTruthy();
    expect(screen.queryByText('api::article.article')).toBeNull();
  });

  it('shows the locales a run covers, source first', () => {
    render(<JobsPage />);

    expect(screen.getByText('en → ar, fr')).toBeTruthy();
  });

  it('calls out failures in the progress cell', () => {
    state.jobs = [job({ progress: { total: 6, done: 6, translated: 4, skipped: 0, failed: 2 } })];
    render(<JobsPage />);

    expect(screen.getByText('6 of 6 · 2 failed')).toBeTruthy();
  });

  it('names who started a run, and says so when nobody is recorded', () => {
    state.jobs = [job(), job({ id: 2, createdById: null, createdByName: null })];
    render(<JobsPage />);

    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('Unknown')).toBeTruthy();
  });

  it('distinguishes where a run came from', () => {
    state.jobs = [
      job({ id: 1, origin: 'bulk' }),
      job({ id: 2, origin: 'document' }),
      job({ id: 3, origin: 'monitor' }),
    ];
    render(<JobsPage />);

    expect(screen.getByText('Bulk')).toBeTruthy();
    expect(screen.getByText('Entry')).toBeTruthy();
    expect(screen.getByText('Monitoring')).toBeTruthy();
  });

  /** An empty list is the good state here, and should read like one. */
  it('explains an empty list rather than showing a bare table', () => {
    state.jobs = [];
    render(<JobsPage />);

    expect(screen.getByText(/Nothing needs attention/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows a loading state', () => {
    state.isLoading = true;
    render(<JobsPage />);

    expect(screen.getByText(/Loading runs/)).toBeTruthy();
  });

  it('shows the reason it could not load', () => {
    state.error = 'Could not load translation runs.';
    render(<JobsPage />);

    expect(screen.getByText('Could not load translation runs.')).toBeTruthy();
  });

  it('hides the pager when everything fits on one page', () => {
    render(<JobsPage />);

    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
  });

  it('offers a pager when it does not, with Previous disabled on the first page', () => {
    state.meta = { page: 1, pageSize: 20, total: 45, pageCount: 3 };
    render(<JobsPage />);

    expect(screen.getByText('Page 1 of 3')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previous' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled')).toBe(false);
  });
});
