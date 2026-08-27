import { z } from 'zod';

import { SYSTEM_PROMPT_MAX_LENGTH, TEMPERATURE_RANGE } from '../config';

/**
 * Validated server-side because the browser is not the only way to reach this route, and because
 * an out-of-range temperature must be *refused* rather than quietly corrected. A UI that clamped
 * would send a legal value and the operator would never learn their number was ignored.
 *
 * Both fields are optional so one can be changed without restating the other, but an update that
 * carries neither is rejected: a request that changes nothing should not report success.
 */
export const settingsUpdateSchema = z
  .object({
    systemPrompt: z
      .string()
      .trim()
      .min(1, 'The system prompt cannot be empty')
      .max(
        SYSTEM_PROMPT_MAX_LENGTH,
        `The system prompt cannot exceed ${SYSTEM_PROMPT_MAX_LENGTH} characters`
      )
      .optional(),
    temperature: z
      .number()
      .min(TEMPERATURE_RANGE.min, `Temperature must be at least ${TEMPERATURE_RANGE.min}`)
      .max(TEMPERATURE_RANGE.max, `Temperature must be at most ${TEMPERATURE_RANGE.max}`)
      .optional(),
  })
  .strict()
  .refine(
    (input) => input.systemPrompt !== undefined || input.temperature !== undefined,
    'Provide a system prompt or a temperature to change'
  );

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
