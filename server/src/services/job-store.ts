import { JOB_UID } from '../models';

import { timestampsFor } from './job-timing';

import type { JobDocument } from './entry-identity';
import type { Core } from '@strapi/strapi';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type JobOrigin = 'document' | 'bulk' | 'monitor';

export type ItemStatus = 'pending' | 'translated' | 'skipped' | 'failed';

export interface JobItem {
  documentId: string;
  locale: string;
  status: ItemStatus;
  /** Why the item was not translated, in words an editor can read. */
  skippedReason?: string;
  error?: string;
  /** The page path this locale was written to, where the content type has one. */
  targetPath?: string | null;
}

export interface JobRow {
  id: number;
  origin: JobOrigin;
  contentType: string;
  sourceLocale: string;
  targetLocales: string[];
  documentIds: string[];
  documents: JobDocument[];
  overwriteDocumentIds: string[];
  items: JobItem[];
  status: JobStatus;
  modelId: number | null;
  createdById: number | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  startedAt: string | Date | null;
  finishedAt: string | Date | null;
}

export interface JobInput {
  origin: JobOrigin;
  contentType: string;
  sourceLocale: string;
  targetLocales: string[];
  documentIds: string[];
  /** Titles and paths, resolved by the caller before the run is recorded. */
  documents?: JobDocument[];
  overwriteDocumentIds?: string[];
  modelId?: number | null;
  createdById?: number | null;
}

export interface JobProgress {
  total: number;
  done: number;
  translated: number;
  skipped: number;
  failed: number;
}

export interface PublicJob extends JobRow {
  progress: JobProgress;
}

/**
 * A run as the list shows it: everything except the per-item detail.
 *
 * `items` is the bulk of a row — one entry per document and locale — and a page of twenty runs
 * would carry thousands of them to render a progress count that is already summarised. The
 * drill-down fetches the full run by id when someone actually opens one.
 */
export type JobSummary = Omit<PublicJob, 'items' | 'documentIds' | 'overwriteDocumentIds'> & {
  documentCount: number;
};

export interface JobPage {
  data: JobSummary[];
  total: number;
}

export const progressOf = (items: JobItem[]): JobProgress => {
  const count = (status: ItemStatus) => items.filter((item) => item.status === status).length;
  const translated = count('translated');
  const skipped = count('skipped');
  const failed = count('failed');

  return { total: items.length, done: translated + skipped + failed, translated, skipped, failed };
};

/**
 * Reads and writes job rows.
 *
 * Item updates are read-modify-write on a JSON column, so they are serialised per job through an
 * in-memory promise chain. The tracer processes items one at a time and would not notice, but the
 * bulk slice runs them concurrently, and two items finishing together would otherwise each write
 * back a list missing the other's result — a lost outcome, invisible except as a job that never
 * reaches its total.
 */
const jobStore = ({ strapi }: { strapi: Core.Strapi }) => {
  const query = () => strapi.db.query(JOB_UID);
  const writeQueues = new Map<number, Promise<unknown>>();

  const serialize = <T>(jobId: number, task: () => Promise<T>): Promise<T> => {
    const previous = writeQueues.get(jobId) ?? Promise.resolve();
    const next = previous.then(task, task);

    // Keep the chain from growing without bound, and from retaining a rejection.
    writeQueues.set(
      jobId,
      next.then(
        () => undefined,
        () => undefined
      )
    );

    return next;
  };

  const toPublic = (row: JobRow): PublicJob => ({ ...row, progress: progressOf(row.items ?? []) });

  const toSummary = (row: JobRow): JobSummary => {
    const { items, documentIds, overwriteDocumentIds, ...rest } = row;

    return {
      ...rest,
      progress: progressOf(items ?? []),
      documentCount: (documentIds ?? []).length,
    };
  };

  return {
    progressOf,

    /** One item per document-and-locale pair, so progress is per unit of real work. */
    async create(input: JobInput): Promise<PublicJob> {
      const items: JobItem[] = input.documentIds.flatMap((documentId) =>
        input.targetLocales.map((locale) => ({ documentId, locale, status: 'pending' as const }))
      );

      const row = (await query().create({
        data: {
          origin: input.origin,
          contentType: input.contentType,
          sourceLocale: input.sourceLocale,
          targetLocales: input.targetLocales,
          documentIds: input.documentIds,
          documents: input.documents ?? [],
          overwriteDocumentIds: input.overwriteDocumentIds ?? [],
          items,
          status: 'queued',
          modelId: input.modelId ?? null,
          createdById: input.createdById ?? null,
          startedAt: null,
          finishedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })) as JobRow;

      return toPublic(row);
    },

    /**
     * A page of runs, newest first, filtered by status.
     *
     * Paged in the database rather than in the browser: history is unbounded until the retention
     * prune exists, and even after it a busy site's month of runs is not something to send in full
     * so the admin can hide most of it.
     *
     * The total is counted with the same filter, so the pager describes the filtered list rather
     * than the table.
     */
    async findMany({
      statuses,
      page,
      pageSize,
    }: {
      statuses: JobStatus[];
      page: number;
      pageSize: number;
    }): Promise<JobPage> {
      const where = { status: { $in: statuses } };

      const [rows, total] = await Promise.all([
        query().findMany({
          where,
          orderBy: { id: 'desc' },
          limit: pageSize,
          offset: (page - 1) * pageSize,
        }) as Promise<JobRow[]>,
        query().count({ where }) as Promise<number>,
      ]);

      return { data: rows.map(toSummary), total };
    },

    async findOne(id: number): Promise<PublicJob | null> {
      const row = (await query().findOne({ where: { id } })) as JobRow | null;

      return row ? toPublic(row) : null;
    },

    async setStatus(id: number, status: JobStatus): Promise<void> {
      await serialize(id, async () => {
        const row = (await query().findOne({ where: { id } })) as JobRow | null;

        if (!row) {
          return;
        }

        const now = new Date();

        await query().update({
          where: { id },
          data: {
            status,
            ...timestampsFor(status, row, now),
            updatedAt: now,
          },
        });
      });
    },

    /** Records the outcome of one document-and-locale pair. */
    async updateItem(
      id: number,
      documentId: string,
      locale: string,
      patch: Omit<JobItem, 'documentId' | 'locale'>
    ): Promise<void> {
      await serialize(id, async () => {
        const row = (await query().findOne({ where: { id } })) as JobRow | null;

        if (!row) {
          return;
        }

        const items = (row.items ?? []).map((item) =>
          item.documentId === documentId && item.locale === locale
            ? { documentId, locale, ...patch }
            : item
        );

        await query().update({ where: { id }, data: { items, updatedAt: new Date() } });
      });
    },

    /**
     * Puts failed items back to `pending` so a retry re-runs only those.
     *
     * Translated and skipped items are left as they are: re-running a success would pay for the
     * same translation twice and overwrite a locale the editor may have edited since. Returns how
     * many items were reset, so a caller can refuse a retry that would do nothing.
     */
    async resetFailedItems(id: number): Promise<number> {
      let reset = 0;

      await serialize(id, async () => {
        const row = (await query().findOne({ where: { id } })) as JobRow | null;

        if (!row) {
          return;
        }

        const items = (row.items ?? []).map((item) => {
          if (item.status !== 'failed') {
            return item;
          }

          reset += 1;

          // The previous error is dropped rather than kept: leaving it on a pending item would
          // show a stale failure next to work that is running again.
          return { documentId: item.documentId, locale: item.locale, status: 'pending' as const };
        });

        // Only reopen the job if something was actually reset. Moving a job with no failures back
        // to `queued` would strand it: the caller refuses to start a run with nothing to do, and
        // the job would sit claiming to be pending work that does not exist.
        const data: Record<string, unknown> = { items, updatedAt: new Date() };

        if (reset > 0) {
          data.status = 'queued';
        }

        await query().update({ where: { id }, data });
      });

      return reset;
    },

    /**
     * Marks the run finished. `failed` only when nothing succeeded — a run where some items failed
     * still completed, and per-item errors say which. Reporting the whole run as failed would hide
     * the work that did land.
     */
    async finish(id: number): Promise<PublicJob | null> {
      const job = await this.findOne(id);

      if (!job) {
        return null;
      }

      const { translated, failed, total } = job.progress;
      const status: JobStatus = translated === 0 && failed > 0 ? 'failed' : 'completed';

      await this.setStatus(id, total === 0 ? 'completed' : status);

      return this.findOne(id);
    },
  };
};

export default jobStore;
