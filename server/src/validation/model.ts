import { z } from 'zod';

/**
 * Validated server-side for the same reason the provider schemas are: the browser form is not a
 * control. A model identifier ends up in a request to a billed API, so its shape is checked here.
 */
export const modelCreateSchema = z.object({
  providerId: z.number().int().positive(),
  modelId: z.string().trim().min(1, 'A model identifier is required').max(120),
  label: z.string().trim().min(1, 'Label is required').max(80),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export const modelUpdateSchema = modelCreateSchema.partial();
