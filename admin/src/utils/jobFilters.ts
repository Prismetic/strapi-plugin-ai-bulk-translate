export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'skipped';

/**
 * What the Jobs tab opens on: everything a person might act on.
 *
 * The server holds the same default, and the two must agree — this is what the checkboxes start
 * from, that is what an unfiltered request returns.
 */
export const NEEDS_ATTENTION: JobStatus[] = ['queued', 'processing', 'failed'];

export interface JobFilters {
  /** Finished runs are hidden until asked for: the list answers "is anything wrong or still going". */
  completed: boolean;
  /**
   * Monitored publishes that changed nothing are hidden separately, and for a different reason:
   * on a site that publishes often they are the volume, and folding them in with completed runs
   * would bury the ones somebody actually wanted to see.
   */
  skipped: boolean;
}

/**
 * The statuses to request for a given filter state.
 *
 * Additive rather than exclusive: ticking a box widens the list instead of replacing it, so the
 * runs that need attention never disappear because someone wanted to check on a finished one.
 *
 * The set is never empty. "Show me nothing" and "show me everything" must not be the same request,
 * and the server refuses an empty list rather than treating it as "no filter".
 */
export const statusesFor = ({ completed, skipped }: JobFilters): JobStatus[] => [
  ...NEEDS_ATTENTION,
  ...(completed ? (['completed'] as JobStatus[]) : []),
  ...(skipped ? (['skipped'] as JobStatus[]) : []),
];
