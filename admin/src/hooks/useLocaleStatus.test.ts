// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();

vi.mock('@strapi/strapi/admin', () => ({ useFetchClient: () => ({ post }) }));

const { useLocaleStatus } = await import('./useLocaleStatus');

const answer = (rows: unknown[]) => post.mockResolvedValue({ data: { data: rows } });

beforeEach(() => {
  post.mockReset();
});

describe('useLocaleStatus', () => {
  it('asks nothing until a target locale is chosen', async () => {
    answer([]);
    const { result } = renderHook(() => useLocaleStatus('api::a.a', ['x'], 'en', []));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(post).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
  });

  it('asks nothing for an empty selection on a collection type', async () => {
    answer([]);
    const { result } = renderHook(() => useLocaleStatus('api::a.a', [], 'en', ['fr']));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(post).not.toHaveBeenCalled();
    expect(result.current.loaded).toBe(false);
  });

  /**
   * The single-type case. Its edit view has no identifier, so the admin has none to send; the
   * server finds the document. Previously this request was never made, and the dialog showed a
   * heading with nothing under it.
   */
  it('asks without identifiers when the server resolves the entry itself', async () => {
    answer([{ documentId: 'home-1', title: 'Home', locales: { fr: 'empty' }, excluded: false }]);
    const { result } = renderHook(() =>
      useLocaleStatus('api::home.home', [], 'en', ['fr'], { resolvesEntryServerSide: true })
    );

    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toEqual({
      contentType: 'api::home.home',
      sourceLocale: 'en',
      targetLocales: ['fr'],
    });
    expect(result.current.rows).toHaveLength(1);
  });

  it('sends the identifiers it has', async () => {
    answer([]);
    renderHook(() => useLocaleStatus('api::a.a', ['x', 'y'], 'en', ['fr']));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toMatchObject({ documentIds: ['x', 'y'] });
  });

  it('reports an empty answer as loaded, not as pending', async () => {
    answer([]);
    const { result } = renderHook(() => useLocaleStatus('api::a.a', ['x'], 'en', ['fr']));

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.rows).toEqual([]);
  });

  it("carries the server's refusal and stays unloaded", async () => {
    post.mockRejectedValue({
      response: { data: { error: { message: 'Nothing saved in en yet.' } } },
    });
    const { result } = renderHook(() =>
      useLocaleStatus('api::home.home', [], 'en', ['fr'], { resolvesEntryServerSide: true })
    );

    await waitFor(() => expect(result.current.error).toBe('Nothing saved in en yet.'));
    expect(result.current.loaded).toBe(false);
    expect(result.current.rows).toEqual([]);
  });
});
