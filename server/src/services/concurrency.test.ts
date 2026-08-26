import { describe, expect, it } from 'vitest';

import { mapWithLimit } from './concurrency';

/** Resolves after `ms`, so overlapping work is observable. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithLimit', () => {
  it('returns results in input order regardless of completion order', async () => {
    const results = await mapWithLimit([30, 10, 20], 3, async (ms, i) => {
      await delay(ms);

      return i;
    });

    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([0, 1, 2]);
  });

  it('never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithLimit(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight -= 1;
    });

    expect(peak).toBe(3);
  });

  it('actually runs concurrently rather than one at a time', async () => {
    let peak = 0;
    let inFlight = 0;

    await mapWithLimit([1, 2, 3, 4], 4, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight -= 1;
    });

    expect(peak).toBeGreaterThan(1);
  });

  it('keeps going when a worker throws, and reports it as a result', async () => {
    const results = await mapWithLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) {
        throw new Error('boom');
      }

      return n * 10;
    });

    expect(results[0]).toEqual({ ok: true, index: 0, value: 10 });
    expect(results[1].ok).toBe(false);
    expect((results[1] as { error: Error }).error.message).toBe('boom');
    expect(results[2]).toEqual({ ok: true, index: 2, value: 30 });
  });

  it('does not reject even when every worker throws', async () => {
    const results = await mapWithLimit([1, 2], 2, async () => {
      throw new Error('always');
    });

    expect(results.every((r) => !r.ok)).toBe(true);
  });

  it('treats a limit below one as one rather than stalling', async () => {
    const results = await mapWithLimit([1, 2], 0, async (n) => n);

    expect(results.map((r) => (r.ok ? r.value : null))).toEqual([1, 2]);
  });

  it('handles an empty list', async () => {
    expect(await mapWithLimit([], 4, async () => 1)).toEqual([]);
  });

  // A pre-sliced batch pool idles workers waiting for the slowest item in each batch. A shared
  // cursor does not, and this is the case that tells them apart.
  it('starts later items while an early slow one is still running', async () => {
    const finished: number[] = [];

    await mapWithLimit([50, 1, 1, 1], 2, async (ms, i) => {
      await delay(ms);
      finished.push(i);
    });

    expect(finished[finished.length - 1]).toBe(0);
  });
});
