import type { DocumentLocaleStatus } from '../hooks/useLocaleStatus';
import type { JobItem } from '../hooks/useTranslationJob';

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
  | 'no-usable-model'
  | 'no-model-selected'
  | 'no-target-locales'
  | 'nothing-in-source'
  | 'conflicts-not-authorised'
  | null;

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
  /**
   * Whether any model is both enabled and reachable through an enabled connection.
   *
   * Optional and assumed `true`, because the model list arrives after the first render: treating
   * "not loaded yet" as "none available" would flash the blocked message and disable the button
   * for the moment before the list returns. The caller passes `false` only once it knows.
   */
  hasUsableModel?: boolean;
  /**
   * Whether this run will actually resolve a model — either the editor chose one, or a usable
   * default exists for the server to fall back to.
   *
   * Distinct from `hasUsableModel` on purpose. A model existing is not the same as this run finding
   * one: with models registered but none marked default, a run sent without an explicit choice
   * reaches `resolveDefault()`, gets nothing, and fails every item. The editor can fix this one by
   * picking a model, which is why it is reported separately.
   */
  modelResolves?: boolean;
}

export const resolveOutcome = ({
  rows,
  targetLocales,
  authorised,
  hasUsableModel = true,
  modelResolves = true,
}: OutcomeInput): Outcome => {
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
    // First, because it is the one blocker the editor cannot work around by changing the selection.
    // Telling someone to choose a locale when no model exists sends them down a path that ends in a
    // run failing server-side with "No usable model is configured".
    if (!hasUsableModel) {
      return 'no-usable-model';
    }

    // After `no-usable-model`, because that one the editor cannot fix from here and this one they
    // can — reporting the fixable problem while a more fundamental one stands would misdirect.
    if (!modelResolves) {
      return 'no-model-selected';
    }

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

export interface DocumentProgress {
  documentId: string;
  /** The entry's title, or its id when no title is known for it. */
  title: string;
  items: JobItem[];
}

/**
 * Groups a run's per-item results under the entry they belong to.
 *
 * A flat list keyed only by locale is unreadable the moment a run covers more than one entry: five
 * entries into two locales produce ten rows that all look alike, and "which entry failed" — which
 * the run is supposed to answer — becomes unanswerable.
 *
 * Titles come from the preview the editor already saw, so the run reports entries by the same name
 * it promised them under. An entry with no known title falls back to its id rather than rendering
 * blank: an opaque identifier is still better than nothing to correlate against.
 *
 * Document order follows first appearance in `items`, which is the order the server queued them.
 */
export const groupProgressByDocument = (
  items: JobItem[],
  titles: Record<string, string>
): DocumentProgress[] => {
  const groups = new Map<string, DocumentProgress>();

  for (const item of items) {
    const existing = groups.get(item.documentId);

    if (existing) {
      existing.items.push(item);
      continue;
    }

    groups.set(item.documentId, {
      documentId: item.documentId,
      title: titles[item.documentId] ?? item.documentId,
      items: [item],
    });
  }

  return [...groups.values()];
};
