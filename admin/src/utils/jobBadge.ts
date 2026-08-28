import type { JobStatus } from './jobFilters';

export type BadgeVariant = 'secondary' | 'alternative' | 'success' | 'warning' | 'danger';

interface Progress {
  translated: number;
  skipped: number;
  failed: number;
}

/**
 * What colour a run's status badge is.
 *
 * The label says what the run is called; the colour says whether it was clean. Those are different
 * questions, because a run is called `completed` as soon as anything was translated — so a run that
 * translated four entries and failed two is completed, and showing that in green claims more than
 * happened.
 *
 * Green means every item was translated, and nothing else does. Below that:
 *
 * - **anything failed** — red, because it is the outcome somebody has to act on, and it outranks a
 *   skip in the same run;
 * - **anything skipped** — yellow, matching the per-item badge in the drill-down, so a run and its
 *   contents are not coloured differently for the same fact;
 * - **still moving or waiting** — neutral shades, since there is no outcome yet to colour.
 */
export const badgeVariantFor = (status: JobStatus, progress: Progress): BadgeVariant => {
  if (status === 'queued') {
    return 'secondary';
  }

  if (status === 'processing') {
    return 'alternative';
  }

  if (status === 'failed' || progress.failed > 0) {
    return 'danger';
  }

  // A run recorded as skipped changed nothing by definition, and reads as the same kind of
  // not-quite-nothing as an item that was skipped inside a run that did.
  if (status === 'skipped' || progress.skipped > 0) {
    return 'warning';
  }

  return 'success';
};
