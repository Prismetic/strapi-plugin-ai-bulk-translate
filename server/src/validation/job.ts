import { z } from 'zod';

/**
 * Validated server-side because this is the request that spends money. The client sends
 * identifiers only — never document content — so there is nothing here the server has to trust
 * beyond which documents to load itself.
 */
export const jobCreateSchema = z.object({
  contentType: z.string().trim().min(1),
  sourceLocale: z.string().trim().min(1).max(20),
  targetLocales: z.array(z.string().trim().min(1).max(20)).min(1, 'Choose at least one locale'),
  /**
   * Optional, because a single type has exactly one document and the plugin resolves its
   * identifier server-side rather than having the admin read it off the route.
   */
  documentIds: z.array(z.string().trim().min(1)).optional(),
  /** The subset of entries the user authorised for overwrite; the per-entry UI arrives later. */
  overwriteDocumentIds: z.array(z.string().trim().min(1)).optional(),
  modelId: z.number().int().positive().nullish(),
  /**
   * Which surface started the run. An audit label on the job record, not a permission — the server
   * derives nothing from it, so a wrong value misreports history and grants nothing.
   */
  origin: z.enum(['document', 'bulk']).optional(),
});

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
