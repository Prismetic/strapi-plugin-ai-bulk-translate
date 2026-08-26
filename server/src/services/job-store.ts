import { JOB_UID } from '../models';

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
}

export interface JobRow {
  id: number;
  origin: JobOrigin;
  contentType: string;
  sourceLocale: string;
  targetLocales: string[];
  documentIds: string[];
  overwriteDocumentIds: string[];
  items: JobItem[];
  status: JobStatus;
  modelId: number | null;
  createdById: number | null;
}

export interface JobInput {
  origin: JobOrigin;
  contentType: string;
  sourceLocale: string;
  targetLocales: string[];
  documentIds: string[];
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
          overwriteDocumentIds: input.overwriteDocumentIds ?? [],
          items,
          status: 'queued',
          modelId: input.modelId ?? null,
          createdById: input.createdById ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      })) as JobRow;

      return toPublic(row);
    },

    async findOne(id: number): Promise<PublicJob | null> {
      const row = (await query().findOne({ where: { id } })) as JobRow | null;

      return row ? toPublic(row) : null;
    },

    async setStatus(id: number, status: JobStatus): Promise<void> {
      await serialize(id, async () => {
        await query().update({ where: { id }, data: { status, updatedAt: new Date() } });
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
