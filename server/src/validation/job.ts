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
  documentIds: z.array(z.string().trim().min(1)).min(1, 'Choose at least one entry'),
  /** The subset of entries the user authorised for overwrite; the per-entry UI arrives later. */
  overwriteDocumentIds: z.array(z.string().trim().min(1)).optional(),
  modelId: z.number().int().positive().nullish(),
});

export type JobCreateInput = z.infer<typeof jobCreateSchema>;
