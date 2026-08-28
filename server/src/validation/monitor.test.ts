import { describe, expect, it } from 'vitest';

import { monitorConfigSchema } from './monitor';

const locale = (over: Record<string, unknown> = {}) => ({
  code: 'ar',
  overwriteContent: false,
  overwriteManualEdits: false,
  ...over,
});

const parse = (input: unknown) => monitorConfigSchema.parse(input);

describe('monitorConfigSchema', () => {
  it('accepts a type monitored into one locale', () => {
    expect(parse({ contentType: 'api::article.article', enabled: true, locales: [locale()] })).toMatchObject({
      enabled: true,
    });
  });

  it('defaults a type to not monitored, with no locales', () => {
    expect(parse({ contentType: 'api::article.article' })).toMatchObject({
      enabled: false,
      locales: [],
    });
  });

  it('defaults both overwrite flags to off, so the safe behaviour needs no decision', () => {
    const parsed = parse({ contentType: 'api::article.article', locales: [{ code: 'ar' }] });

    expect(parsed.locales[0]).toMatchObject({
      overwriteContent: false,
      overwriteManualEdits: false,
    });
  });

  it('accepts overwriting content without overwriting manual edits', () => {
    expect(() =>
      parse({
        contentType: 'api::article.article',
        locales: [locale({ overwriteContent: true })],
      })
    ).not.toThrow();
  });

  it('accepts both together', () => {
    expect(() =>
      parse({
        contentType: 'api::article.article',
        locales: [locale({ overwriteContent: true, overwriteManualEdits: true })],
      })
    ).not.toThrow();
  });

  /**
   * The combination the nesting exists to prevent: "overwrite nothing, but overwrite hand-edited
   * things" has no meaning, and a disabled control in the interface is not enforcement.
   */
  it('refuses overwriting manual edits without overwriting content', () => {
    expect(() =>
      parse({
        contentType: 'api::article.article',
        locales: [locale({ overwriteContent: false, overwriteManualEdits: true })],
      })
    ).toThrow(/overwrite/i);
  });

  it('refuses the same locale twice, which would make the policy ambiguous', () => {
    expect(() =>
      parse({
        contentType: 'api::article.article',
        locales: [locale({ code: 'ar' }), locale({ code: 'ar', overwriteContent: true })],
      })
    ).toThrow(/once/i);
  });

  it('refuses a missing content type', () => {
    expect(() => parse({ enabled: true })).toThrow();
  });

  it('refuses a blank locale code', () => {
    expect(() => parse({ contentType: 'api::article.article', locales: [{ code: '  ' }] })).toThrow();
  });
});
