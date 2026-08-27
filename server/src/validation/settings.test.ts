import { describe, expect, it } from 'vitest';

import { settingsUpdateSchema } from './settings';

const parse = (input: unknown) => settingsUpdateSchema.safeParse(input);

describe('settingsUpdateSchema', () => {
  it('accepts a prompt and an in-range temperature', () => {
    const result = parse({ systemPrompt: 'Be terse.', temperature: 1.4 });

    expect(result.success).toBe(true);
  });

  it('accepts either field alone, so one can be changed without restating the other', () => {
    expect(parse({ temperature: 0.5 }).success).toBe(true);
    expect(parse({ systemPrompt: 'Be terse.' }).success).toBe(true);
  });

  // The acceptance criterion this exists for: rejected, never silently clamped. A browser that
  // clamped would still send a legal value; the server has to be the one that says no.
  it.each([-0.1, 2.1, 99])('rejects temperature %s rather than clamping it', (temperature) => {
    expect(parse({ temperature }).success).toBe(false);
  });

  it.each([0, 2])('accepts temperature %s, the boundaries themselves', (temperature) => {
    expect(parse({ temperature }).success).toBe(true);
  });

  it('rejects a non-numeric temperature rather than coercing it', () => {
    expect(parse({ temperature: '0.5' }).success).toBe(false);
  });

  it('rejects an empty or whitespace-only prompt', () => {
    expect(parse({ systemPrompt: '' }).success).toBe(false);
    expect(parse({ systemPrompt: '   ' }).success).toBe(false);
  });

  it('rejects a prompt long enough to be a paste accident', () => {
    expect(parse({ systemPrompt: 'x'.repeat(4001) }).success).toBe(false);
  });

  it('rejects an update that changes nothing, so a no-op cannot look like a save', () => {
    expect(parse({}).success).toBe(false);
  });
});
