import { z } from 'zod';

import { PROVIDER_TYPES } from '../config/provider-catalog';

/**
 * Validated server-side, not merely in the browser. The settings routes accept credentials, so
 * "the form wouldn't let you" is not a control.
 */
export const providerCreateSchema = z.object({
  type: z.enum(PROVIDER_TYPES as [string, ...string[]]),
  label: z.string().trim().min(1, 'Label is required').max(80),
  baseUrl: z.string().trim().url('Base URL must be a valid URL').or(z.literal('')).nullish(),
  apiKey: z.string().trim().nullish(),
  config: z.record(z.string(), z.unknown()).nullish(),
  enabled: z.boolean().optional(),
});

export const providerUpdateSchema = providerCreateSchema.partial();

export const testConnectionSchema = z.object({
  modelId: z.string().trim().min(1, 'A model identifier is required').max(120),
});

export const formatZodError = (error: z.ZodError): string =>
  error.issues.map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message)).join('; ');
