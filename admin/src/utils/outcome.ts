import type { DocumentLocaleStatus } from '../hooks/useLocaleStatus';

/**
 * Turns the locale-status matrix and the editor's opt-ins into the outcome of pressing Translate.
 *
 * Pure, and separate from the dialog on purpose. This is the arithmetic the footer states in words
 * and the confirm button is enabled by, and both have to agree — a summary promising three writes
 * above a disabled button is worse than either problem alone. Keeping it out of the component also
 * means the interesting cases are testable without rendering anything.
 *
 * The server remains the authority: it re-checks every pair at execution time and skips anything not
 * authorised. This is what the editor is *shown*, not what is enforced.
 */

export interface Conflict {
  documentId: string;
  title: string;
  /** The locales of this entry that already hold content, in the order the editor chose them. */
  locales: string[];
}

export type BlockedReason =
  'no-target-locales' | 'nothing-in-source' | 'conflicts-not-authorised' | null;

export interface Outcome {
  conflicts: Conflict[];
  /** Entry-and-locale pairs that will be written where nothing exists. */
  willCreate: number;
  /** Pairs that will replace existing content, because the editor ticked the entry. */
  willOverwrite: number;
  /** Pairs left alone because their entry was not ticked. */
  willSkip: number;
  /** Entries with nothing in the source locale, excluded from the run. */
  excludedCount: number;
  /**
   * The authorisations worth sending — every ticked entry that is still a conflict in this
   * selection. Unticking a locale can strand an id, and a job record should show what the editor
   * could actually see and approve, not a leftover.
   */
  authorisedIds: string[];
  hasWork: boolean;
  blockedReason: BlockedReason;
}

export interface OutcomeInput {
  rows: DocumentLocaleStatus[];
  targetLocales: string[];
  /** Document ids the editor ticked for overwrite. */
  authorised: string[];
}

export const resolveOutcome = ({ rows, targetLocales, authorised }: OutcomeInput): Outcome => {
  const included = rows.filter((row) => !row.excluded);
  const authorisedSet = new Set(authorised);

  const conflicts: Conflict[] = [];
  let willCreate = 0;
  let willOverwrite = 0;
  let willSkip = 0;

  for (const row of included) {
    // Driven by the chosen locales rather than the row's own keys, so the order an editor sees
    // matches the order they picked.
    const conflicting = targetLocales.filter((locale) => row.locales[locale] === 'has-content');

    willCreate += targetLocales.filter((locale) => row.locales[locale] === 'empty').length;

    if (conflicting.length === 0) {
      continue;
    }

    conflicts.push({ documentId: row.documentId, title: row.title, locales: conflicting });

    if (authorisedSet.has(row.documentId)) {
      willOverwrite += conflicting.length;
    } else {
      willSkip += conflicting.length;
    }
  }

  const authorisedIds = conflicts
    .filter((conflict) => authorisedSet.has(conflict.documentId))
    .map((conflict) => conflict.documentId);

  const resolveBlocked = (): BlockedReason => {
    if (targetLocales.length === 0) {
      return 'no-target-locales';
    }

    // Nothing has come back from the preview yet, so there is nothing to judge. Disabling here
    // would flicker the button off between choosing a locale and the check returning.
    if (rows.length === 0) {
      return null;
    }

    if (included.length === 0) {
      return 'nothing-in-source';
    }

    if (willCreate + willOverwrite > 0) {
      return null;
    }

    return conflicts.length > 0 ? 'conflicts-not-authorised' : 'nothing-in-source';
  };

  const blockedReason = resolveBlocked();

  return {
    conflicts,
    willCreate,
    willOverwrite,
    willSkip,
    excludedCount: rows.length - included.length,
    authorisedIds,
    hasWork: blockedReason === null,
    blockedReason,
  };
};
