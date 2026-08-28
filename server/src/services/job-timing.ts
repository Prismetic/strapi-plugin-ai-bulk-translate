import type { JobStatus } from './job-store';

/**
 * The timestamps a status change should write.
 *
 * Separate from `createdAt`, which records when the run was asked for: a run can sit queued behind
 * another, and "how long did this take" is a question about work, not about waiting.
 *
 * Returns only the fields that should change, so a status change never rewrites a timestamp it has
 * no opinion about.
 */
export const timestampsFor = (
  status: JobStatus,
  current: { startedAt: Date | string | null; finishedAt: Date | string | null },
  now: Date
): { startedAt?: Date; finishedAt?: Date | null } => {
  if (status === 'processing') {
    return {
      // Only the first start counts. A run that resumes has not started again.
      ...(current.startedAt ? {} : { startedAt: now }),
      // Retrying a finished run makes it unfinished; an end time older than the work would be a lie.
      ...(current.finishedAt ? { finishedAt: null } : {}),
    };
  }

  if (status === 'completed' || status === 'failed') {
    return { finishedAt: now };
  }

  return {};
};
