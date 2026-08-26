/**
 * Raw database model for translation runs.
 *
 * One row per run, carrying both what was requested and what happened to each item. The row is the
 * audit trail: it answers "why did this locale change" after the fact, which is the whole reason
 * per-item outcomes are stored rather than only a final status.
 *
 * `origin` is present from the start even though only `document` is written in this slice. The
 * later surfaces — the list-view bulk action, and post-1.0 monitoring — are then additions to an
 * existing column rather than a migration.
 */
export const JOB_UID = 'plugin::ai-bulk-translate.job';

export const jobModel = {
  uid: JOB_UID,
  tableName: 'ai_bulk_translate_jobs',
  singularName: 'job',
  attributes: {
    id: { type: 'increments' },
    /** `document` | `bulk` | `monitor`. */
    origin: { type: 'string', column: { notNullable: true } },
    contentType: { type: 'string', column: { notNullable: true } },
    sourceLocale: { type: 'string', column: { notNullable: true } },
    targetLocales: { type: 'json' },
    documentIds: { type: 'json' },
    /**
     * The subset of documents the user authorised for overwrite. Stored on the job rather than
     * only applied at creation, so the row records what was approved. The per-item opt-in UI
     * arrives in a later slice; the column is the audit trail either way.
     */
    overwriteDocumentIds: { type: 'json' },
    /** `[{ documentId, locale, status, skippedReason?, error? }]`. */
    items: { type: 'json' },
    /** `queued` | `processing` | `completed` | `failed`. */
    status: { type: 'string', column: { notNullable: true } },
    /** The registered model row used for the run, recorded for audit. */
    modelId: { type: 'integer' },
    createdById: { type: 'integer' },
    createdAt: { type: 'datetime', default: () => new Date() },
    updatedAt: { type: 'datetime', default: () => new Date() },
  },
};
