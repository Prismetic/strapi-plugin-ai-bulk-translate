import { describe, expect, it } from 'vitest';

import { extractFields, type ExtractorSchema } from './field-extractor';

/**
 * Modelled on `api::page.page` from the CMS multi-locale host: a localized string, a deliberately
 * non-localized one, and the field types the tracer excludes.
 */
const pageSchema: ExtractorSchema = {
  attributes: {
    Name: { type: 'string', pluginOptions: { i18n: { localized: true } } },
    Summary: { type: 'text', pluginOptions: { i18n: { localized: true } } },
    Body: { type: 'richtext', pluginOptions: { i18n: { localized: true } } },
    Path: { type: 'string', pluginOptions: { i18n: { localized: false } } },
    Slug: { type: 'uid', pluginOptions: { i18n: { localized: true } } },
    Cover: { type: 'media', pluginOptions: { i18n: { localized: true } } },
    Author: { type: 'relation', pluginOptions: { i18n: { localized: true } } },
    Views: { type: 'integer', pluginOptions: { i18n: { localized: true } } },
    createdAt: { type: 'datetime' },
  },
};

describe('extractFields', () => {
  it('extracts localized string, text and richtext fields', () => {
    const fields = extractFields(pageSchema, {
      Name: 'Turtle Bay',
      Summary: 'A quiet cove.',
      Body: '# Heading\n\nSome prose.',
    });

    expect(fields).toEqual([
      { path: 'Name', value: 'Turtle Bay', type: 'string' },
      { path: 'Summary', value: 'A quiet cove.', type: 'text' },
      { path: 'Body', value: '# Heading\n\nSome prose.', type: 'richtext' },
    ]);
  });

  it('leaves non-localized fields out, so shared values stay shared', () => {
    const fields = extractFields(pageSchema, { Name: 'Turtle Bay', Path: '/turtle-bay' });

    expect(fields.map((field) => field.path)).toEqual(['Name']);
  });

  /**
   * i18n treats a *missing* flag as non-localized — `isLocalizedAttribute` requires
   * `pluginOptions.i18n.localized === true`. Anything without it is copied across locales by
   * Strapi, so translating it would write over a shared value.
   */
  it('treats an attribute with no localized flag as non-localized', () => {
    const schema: ExtractorSchema = { attributes: { Title: { type: 'string' } } };

    expect(extractFields(schema, { Title: 'Shared heading' })).toEqual([]);
  });

  it('never extracts media, relations, identifiers or non-text scalars', () => {
    const fields = extractFields(pageSchema, {
      Slug: 'turtle-bay',
      Cover: { id: 7, url: '/uploads/cove.jpg' },
      Author: { id: 3, name: 'Ana' },
      Views: 42,
      createdAt: '2026-08-26T00:00:00.000Z',
    });

    expect(fields).toEqual([]);
  });

  it('skips empty and whitespace-only values rather than paying to translate nothing', () => {
    const fields = extractFields(pageSchema, { Name: '', Summary: '   ', Body: 'Real text.' });

    expect(fields.map((field) => field.path)).toEqual(['Body']);
  });

  it('skips absent and null values', () => {
    const fields = extractFields(pageSchema, { Name: 'Only this', Summary: null });

    expect(fields.map((field) => field.path)).toEqual(['Name']);
  });

  it('ignores data keys that are not in the schema', () => {
    const fields = extractFields(pageSchema, { Name: 'Kept', Injected: 'Not in the schema' });

    expect(fields.map((field) => field.path)).toEqual(['Name']);
  });
});
