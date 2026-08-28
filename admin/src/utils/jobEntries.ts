export interface JobDocument {
  documentId: string;
  title: string;
  sourcePath: string | null;
}

/**
 * The entries a run is named by in the list, and how many are left over.
 *
 * A row has one line for this, so a bulk run of forty entries names the first few and counts the
 * rest. Runs recorded before titles were stored have none at all — those fall back to the count,
 * which is the honest thing to show rather than a blank column.
 */
export const namedEntries = (
  documents: JobDocument[],
  documentCount: number,
  max = 2
): { titles: string[]; remaining: number } => {
  if (documents.length === 0) {
    return { titles: [], remaining: documentCount };
  }

  return {
    titles: documents.slice(0, max).map((document) => document.title),
    remaining: Math.max(0, documents.length - max),
  };
};

/**
 * How long a run took, or null when that is not a question with an answer yet.
 *
 * Coarse on purpose: nobody reading history needs the seconds of an hour-long run, and a column
 * of "1h 3m 20s" is harder to scan than "1h 3m".
 */
export const durationBetween = (
  startedAt: string | null,
  finishedAt: string | null
): string | null => {
  if (!startedAt || !finishedAt) {
    return null;
  }

  const milliseconds = new Date(finishedAt).getTime() - new Date(startedAt).getTime();

  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return null;
  }

  // Rounded up, so a run that did real work never reports having taken no time at all.
  const seconds = Math.max(1, Math.ceil(milliseconds / 1000));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};
