import { describe, expect, it } from 'vitest';

import { classifyLocale, hasTranslatableContent } from './locale-status';

import type { ComponentSchemas, ExtractorSchema } from './field-extractor';

const schema: ExtractorSchema = {
  attributes: {
    Title: { type: 'string', pluginOptions: { i18n: { localized: true } } },
    Body: { type: 'text', pluginOptions: { i18n: { localized: true } } },
    // Not localized, so it is shared across locales and never counts as this locale's content.
    Path: { type: 'string' },
    Cover: { type: 'media', pluginOptions: { i18n: { localized: true } } },
    Block: { type: 'component', component: 'utils.block', pluginOptions: { i18n: { localized: true } } },
  },
};

const components: ComponentSchemas = {
  'utils.block': { attributes: { Text: { type: 'string' }, Image: { type: 'media' } } },
};

describe('classifyLocale', () => {
  it('reports no-source when the source has nothing, whatever the target holds', () => {
    expect(classifyLocale(false, false)).toBe('no-source');
    expect(classifyLocale(false, true)).toBe('no-source');
  });

  it('reports empty when the source has content and the target does not', () => {
    expect(classifyLocale(true, false)).toBe('empty');
  });

  it('reports has-content when both have content', () => {
    expect(classifyLocale(true, true)).toBe('has-content');
  });
});

describe('hasTranslatableContent', () => {
  it('is false for a missing document — the locale row does not exist', () => {
    expect(hasTranslatableContent(schema, null, components)).toBe(false);
    expect(hasTranslatableContent(schema, undefined, components)).toBe(false);
  });

  /**
   * The case that separates this definition from "does a row exist". A locale can be present with
   * every translatable field blank, and an editor asking whether French has content means the
   * words, not the record. Defining it the other way is exactly how a preview and a run come to
   * disagree.
   */
  it('is false for a row that exists with every translatable field blank', () => {
    expect(hasTranslatableContent(schema, { Title: '', Body: '   ' }, components)).toBe(false);
  });

  it('is true when any translatable field holds text', () => {
    expect(hasTranslatableContent(schema, { Title: 'Hello', Body: '' }, components)).toBe(true);
  });

  it('ignores non-localized fields, which every locale shares', () => {
    expect(hasTranslatableContent(schema, { Path: '/shared' }, components)).toBe(false);
  });

  it('ignores media, which is never translated', () => {
    expect(hasTranslatableContent(schema, { Cover: { id: 7, url: '/a.png' } }, components)).toBe(
      false
    );
  });

  it('counts text nested inside a component', () => {
    expect(hasTranslatableContent(schema, { Block: { Text: 'Nested' } }, components)).toBe(true);
  });

  it('does not count a component holding only media', () => {
    expect(
      hasTranslatableContent(schema, { Block: { Image: { id: 3 } } }, components)
    ).toBe(false);
  });
});

describe('the matrix these two produce', () => {
  const stateFor = (source: Record<string, unknown> | null, target: Record<string, unknown> | null) =>
    classifyLocale(
      hasTranslatableContent(schema, source, components),
      hasTranslatableContent(schema, target, components)
    );

  it('covers all three states across several locales', () => {
    const source = { Title: 'The lighthouse keeper' };

    expect(stateFor(source, null)).toBe('empty');
    expect(stateFor(source, { Title: '' })).toBe('empty');
    expect(stateFor(source, { Title: 'Le gardien' })).toBe('has-content');
    expect(stateFor(null, { Title: 'Le gardien' })).toBe('no-source');
  });

  // The preview says "will be created"; the runner must reach the same conclusion from the same
  // inputs. One implementation is what guarantees that, and this pins it.
  it('gives the runner and the dialog the same answer for an empty existing locale', () => {
    const source = { Title: 'Something' };
    const emptyTarget = { Title: '   ', Body: '' };

    const dialogSays = stateFor(source, emptyTarget);
    const runnerWouldSkip = hasTranslatableContent(schema, emptyTarget, components);

    expect(dialogSays).toBe('empty');
    expect(runnerWouldSkip).toBe(false);
  });
});
