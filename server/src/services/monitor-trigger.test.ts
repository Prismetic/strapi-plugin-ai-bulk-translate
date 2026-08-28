import { describe, expect, it } from 'vitest';

import { triggeredRun } from './monitor-trigger';

const monitored = {
  'api::article.article': {
    contentType: 'api::article.article',
    enabled: true,
    locales: [
      { code: 'ar', overwriteContent: false, overwriteManualEdits: false },
      { code: 'fr', overwriteContent: false, overwriteManualEdits: false },
    ],
  },
};

const publish = (over: Record<string, unknown> = {}) => ({
  action: 'publish',
  uid: 'api::article.article',
  params: { documentId: 'abc123', locale: 'en' },
  ...over,
});

const run = (ctx: unknown, config = monitored, defaultLocale: string | null = 'en') =>
  triggeredRun(ctx as never, config as never, defaultLocale);

describe('triggeredRun', () => {
  it('translates a monitored entry published in the default locale', () => {
    expect(run(publish())).toEqual({
      contentType: 'api::article.article',
      documentId: 'abc123',
      sourceLocale: 'en',
      targetLocales: ['ar', 'fr'],
    });
  });

  /** Saving a draft is a different action. Only publishing is the "I am done" signal. */
  it('ignores every action but publish', () => {
    for (const action of ['update', 'create', 'delete', 'unpublish', 'findOne']) {
      expect(run(publish({ action }))).toBeNull();
    }
  });

  it('ignores a content type that is not monitored', () => {
    expect(run(publish({ uid: 'api::page.page' }))).toBeNull();
  });

  it('ignores a monitored content type that has been switched off', () => {
    const off = { 'api::article.article': { ...monitored['api::article.article'], enabled: false } };

    expect(run(publish(), off)).toBeNull();
  });

  /**
   * The structural guarantee that monitoring cannot feed itself: only the source of truth drives
   * it, so promoting a translation to published does nothing.
   */
  it('ignores a publish of any locale but the default', () => {
    expect(run(publish({ params: { documentId: 'abc123', locale: 'ar' } }))).toBeNull();
  });

  /** Publishing every locale at once is still one publish of the source of truth. */
  it('treats a publish of all locales as one run for the default locale', () => {
    expect(run(publish({ params: { documentId: 'abc123', locale: '*' } }))?.sourceLocale).toBe('en');
  });

  it('treats an unspecified locale as the default, which is what Strapi means by it', () => {
    expect(run(publish({ params: { documentId: 'abc123' } }))?.sourceLocale).toBe('en');
  });

  it('does nothing without a document to translate', () => {
    expect(run(publish({ params: { locale: 'en' } }))).toBeNull();
  });

  it('does nothing when the install has no default locale to reason about', () => {
    expect(run(publish(), monitored, null)).toBeNull();
  });

  it('does nothing when a monitored type has no target locales chosen', () => {
    const empty = { 'api::article.article': { ...monitored['api::article.article'], locales: [] } };

    expect(run(publish(), empty)).toBeNull();
  });

  /** Belt and braces: the default locale is refused as a target on save, but never trust it here. */
  it('never translates into the default locale even if one is configured', () => {
    const withDefault = {
      'api::article.article': {
        ...monitored['api::article.article'],
        locales: [
          { code: 'en', overwriteContent: false, overwriteManualEdits: false },
          { code: 'ar', overwriteContent: false, overwriteManualEdits: false },
        ],
      },
    };

    expect(run(publish(), withDefault)?.targetLocales).toEqual(['ar']);
  });

  it('survives a context with no params at all', () => {
    expect(run({ action: 'publish', uid: 'api::article.article' })).toBeNull();
  });
});
