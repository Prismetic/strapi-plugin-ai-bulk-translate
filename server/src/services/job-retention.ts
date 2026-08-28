import type { JobStatus } from './job-store';

/** A run in one of these is not history yet, however old it looks. */
const UNFINISHED: JobStatus[] = ['queued', 'processing'];

/** The moment before which history is discarded. */
export const cutoffFrom = (now: Date, days: number): Date =>
  new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

/**
 * Whether a run is old enough to discard.
 *
 * Age is measured from when the run **ended**, falling back to when it was created for rows that
 * predate timings. A run created two months ago but finished yesterday is recent work, and
 * measuring from creation would delete the record of something that happened this week.
 *
 * A queued or processing run is never removed. It is not history — it is a job someone is waiting
 * on, and deleting it would strand the work as well as the record.
 */
export const isPrunable = (
  job: { status: JobStatus; createdAt: string | Date; finishedAt: string | Date | null },
  cutoff: Date
): boolean => {
  if (UNFINISHED.includes(job.status)) {
    return false;
  }

  return new Date(job.finishedAt ?? job.createdAt).getTime() < cutoff.getTime();
};
