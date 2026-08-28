import { z } from 'zod';

import type { JobStatus } from '../services/job-store';

/** Every status a run can hold. Kept beside the schema so the two cannot drift. */
export const JOB_STATUSES = ['queued', 'processing', 'completed', 'failed', 'skipped'] as const;

/**
 * What the Jobs tab opens on: everything a person might act on.
 *
 * Completed runs are deliberately absent. The list exists to answer "is anything wrong or still
 * going", and a finished run answers neither — it is available behind a filter instead.
 */
export const NEEDS_ATTENTION: JobStatus[] = ['queued', 'processing', 'failed'];

/**
 * Query parameters for the run list.
 *
 * Statuses arrive in three shapes and all three are real: Koa gives an array when a parameter
 * repeats, a bare string when it does not, and a comma-separated string is how a filtered URL reads
 * when someone shares one. An empty list is refused rather than treated as "no filter", because
 * "show me nothing" and "show me everything" must not be the same request.
 */
const statuses = z
  .preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (Array.isArray(value)) return value;

      return String(value).split(',');
    },
    z.array(z.enum(JOB_STATUSES)).min(1, 'Choose at least one status')
  )
  .default(NEEDS_ATTENTION);

export const jobListQuerySchema = z.object({
  status: statuses,
  page: z.coerce.number().int().min(1).default(1),
  /** Capped, so a crafted request cannot pull the whole table in one page. */
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type JobListQuery = z.infer<typeof jobListQuerySchema>;
