// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();

vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => ({ get }) }));

const { NEEDS_ATTENTION, isActive, useJobs } = await import('./useJobs');

const job = (over: Record<string, unknown> = {}) => ({
  id: 1,
  origin: 'bulk',
  contentType: 'api::article.article',
  sourceLocale: 'en',
  targetLocales: ['ar'],
  status: 'completed',
  documentCount: 1,
  modelId: 1,
  createdById: 1,
  createdByName: 'Ada Lovelace',
  createdAt: '2026-08-28T10:00:00.000Z',
  updatedAt: '2026-08-28T10:01:00.000Z',
  progress: { total: 1, done: 1, translated: 1, skipped: 0, failed: 0 },
  ...over,
});

const respond = (jobs: unknown[]) =>
  get.mockResolvedValue({
    data: { data: jobs, meta: { page: 1, pageSize: 20, total: jobs.length, pageCount: 1 } },
  });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  get.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isActive', () => {
  it('is true while anything is queued or processing', () => {
    expect(isActive([{ status: 'completed' }, { status: 'processing' }])).toBe(true);
    expect(isActive([{ status: 'queued' }])).toBe(true);
  });

  it('is false once nothing is moving', () => {
    expect(isActive([{ status: 'completed' }, { status: 'failed' }])).toBe(false);
  });

  it('is false for an empty list, so a quiet tab asks nothing', () => {
    expect(isActive([])).toBe(false);
  });
});

describe('useJobs', () => {
  it('requests the statuses it was given', async () => {
    respond([]);
    renderHook(() => useJobs({ statuses: NEEDS_ATTENTION, page: 1 }));

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(get.mock.calls[0][0]).toContain('status=queued%2Cprocessing%2Cfailed');
  });

  /** A tab left open on a finished list should be silent. */
  it('stops polling when nothing is active', async () => {
    respond([job({ status: 'completed' })]);
    renderHook(() => useJobs({ statuses: NEEDS_ATTENTION, page: 1 }));

    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('keeps polling while a run is still going', async () => {
    respond([job({ status: 'processing' })]);
    const { result } = renderHook(() => useJobs({ statuses: NEEDS_ATTENTION, page: 1 }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const before = get.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(9000);
    });

    expect(get.mock.calls.length).toBeGreaterThan(before);
  });

  /** Otherwise a broken endpoint is polled forever, several times a minute, per open tab. */
  it('stops polling when the request fails', async () => {
    get.mockRejectedValue({ response: { data: { error: { message: 'Nope' } } } });
    const { result } = renderHook(() => useJobs({ statuses: NEEDS_ATTENTION, page: 1 }));

    await waitFor(() => expect(result.current.error).toBe('Nope'));
    await act(async () => {
      vi.advanceTimersByTime(20000);
    });

    expect(get).toHaveBeenCalledTimes(1);
  });
});
