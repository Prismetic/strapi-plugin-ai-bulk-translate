/**
 * Runs an async worker over a list with a ceiling on how many are in flight at once.
 *
 * Bulk translation is the reason this exists: twenty entries across three locales is sixty model
 * calls, and firing them all at once is how a provider rate-limits you, or how a mis-configured run
 * spends a lot of money very quickly. A fixed-size pool keeps a run's request rate predictable
 * regardless of how many entries were selected.
 *
 * **Never rejects.** A worker that throws is the caller's problem to record, not a reason to abandon
 * the other fifty-nine items — the whole point of per-item isolation. Errors are surfaced as
 * results, so nothing here can produce an unhandled rejection.
 *
 * Pure and Strapi-free.
 */

export type SettledResult<R> =
  | { ok: true; index: number; value: R }
  | { ok: false; index: number; error: unknown };

export const mapWithLimit = async <T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<SettledResult<R>[]> => {
  const results: SettledResult<R>[] = new Array(items.length);

  if (items.length === 0) {
    return results;
  }

  // A limit below one would stall forever; above the item count it just wastes workers.
  const size = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));

  // Shared cursor rather than pre-sliced batches: with batches, a pool waits for the slowest item
  // in each batch before starting the next, so one long document idles every other worker. Here a
  // worker takes the next index the moment it is free.
  let cursor = 0;

  const runWorker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = { ok: true, index, value: await worker(items[index], index) };
      } catch (error) {
        results[index] = { ok: false, index, error };
      }
    }
  };

  await Promise.all(Array.from({ length: size }, runWorker));

  return results;
};
