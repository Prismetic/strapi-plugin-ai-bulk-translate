import type { MonitorLocale } from '../validation/monitor';

/**
 * What a monitored run should do about one target locale.
 *
 * `skip:has-content` and `skip:manual-edit` are deliberately different answers. The first is the
 * administrator's configuration working as asked; the second is the plugin declining to destroy
 * somebody's work. An operator reading history needs to tell those apart, because only one of them
 * is fixed by changing a setting.
 */
export type OverwriteDecision = 'write' | 'skip:has-content' | 'skip:manual-edit';

/**
 * Applies a locale's two-level policy to what is actually in the target locale.
 *
 * Pure, so every combination is a test rather than a publish. The order of the rules is the
 * meaning of the feature:
 *
 * 1. **Empty target — always write.** There is nothing to overwrite, so no policy applies.
 * 2. **Overwriting off — never write.** The safe default, and the one that needs no decision.
 * 3. **Manual edits may be overwritten — always write.** The explicit, destructive opt-in.
 * 4. **Otherwise, write only what we wrote and nobody has touched since.**
 *
 * "Touched since" compares the entry's current timestamp against the one the plugin recorded when
 * it last wrote that locale. Both values come from the same source — the document's own
 * `updatedAt` — so this is an equality question rather than a clock comparison, and an unchanged
 * timestamp means our own write rather than somebody else's.
 *
 * Every uncertainty resolves toward preserving the work: content the plugin never wrote is
 * somebody's by definition, and an entry that cannot say when it changed is assumed to have been.
 */
export const decideOverwrite = ({
  policy,
  targetHasContent,
  lastWrittenAt,
  targetUpdatedAt,
}: {
  policy: Pick<MonitorLocale, 'overwriteContent' | 'overwriteManualEdits'>;
  targetHasContent: boolean;
  /** What the plugin left the entry's timestamp at, or null if it never wrote this locale. */
  lastWrittenAt: string | Date | null;
  /** What the entry's timestamp says now. */
  targetUpdatedAt: string | Date | null;
}): OverwriteDecision => {
  if (!targetHasContent) {
    return 'write';
  }

  if (!policy.overwriteContent) {
    return 'skip:has-content';
  }

  if (policy.overwriteManualEdits) {
    return 'write';
  }

  if (lastWrittenAt === null || targetUpdatedAt === null) {
    return 'skip:manual-edit';
  }

  return new Date(targetUpdatedAt).getTime() > new Date(lastWrittenAt).getTime()
    ? 'skip:manual-edit'
    : 'write';
};
