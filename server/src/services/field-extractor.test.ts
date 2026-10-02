import { describe, expect, it } from 'vitest';

import { extractFields, type ComponentSchemas, type ExtractorSchema } from './field-extractor';

/**
 * Modelled on a real `api::page.page`: a localized string, a deliberately non-localized one, a
 * component holding text and media, a dynamic zone, and the field types the extractor must never
 * send to a model.
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
    Header: {
      type: 'component',
      component: 'utils.image-text',
      pluginOptions: { i18n: { localized: true } },
    },
    Cards: {
      type: 'component',
      component: 'utils.card',
      repeatable: true,
      pluginOptions: { i18n: { localized: true } },
    },
    Shared: {
      type: 'component',
      component: 'utils.card',
      pluginOptions: { i18n: { localized: false } },
    },
    Sections: {
      type: 'dynamiczone',
      components: ['blocks.hero', 'blocks.quote'],
      pluginOptions: { i18n: { localized: true } },
    },
  },
};

const components: ComponentSchemas = {
  'utils.image-text': {
    attributes: {
      Text: { type: 'string' },
      Image: { type: 'media' },
      Link: { type: 'relation' },
      Inner: { type: 'component', component: 'utils.card' },
    },
  },
  'utils.card': {
    attributes: {
      Title: { type: 'string' },
      Note: { type: 'text', pluginOptions: { i18n: { localized: false } } },
      Icon: { type: 'media' },
    },
  },
  'blocks.hero': { attributes: { Heading: { type: 'string' }, Media: { type: 'media' } } },
  'blocks.quote': { attributes: { Quote: { type: 'text' } } },
};

const paths = (schema: ExtractorSchema, data: Record<string, unknown>) =>
  extractFields(schema, data, components).map((field) => field.path);

describe('extractFields — flat fields', () => {
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
    expect(paths(pageSchema, { Name: 'Turtle Bay', Path: '/turtle-bay' })).toEqual(['Name']);
  });

  /**
   * i18n treats a *missing* flag as non-localized — `isLocalizedAttribute` requires
   * `pluginOptions.i18n.localized === true`. Anything without it is copied across locales by
   * Strapi, so translating it would write over a shared value.
   */
  it('treats a content-type attribute with no localized flag as non-localized', () => {
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
    expect(paths(pageSchema, { Name: '', Summary: '   ', Body: 'Real text.' })).toEqual(['Body']);
  });

  it('skips absent and null values', () => {
    expect(paths(pageSchema, { Name: 'Only this', Summary: null })).toEqual(['Name']);
  });

  it('ignores data keys that are not in the schema', () => {
    expect(paths(pageSchema, { Name: 'Kept', Injected: 'Not declared' })).toEqual(['Name']);
  });
});

describe('extractFields — components', () => {
  it('extracts text from inside a single component', () => {
    const fields = extractFields(
      pageSchema,
      { Header: { id: 4, Text: 'Welcome aboard' } },
      components
    );

    expect(fields).toEqual([{ path: 'Header.Text', value: 'Welcome aboard', type: 'string' }]);
  });

  it('extracts text from every entry of a repeatable component', () => {
    const fields = paths(pageSchema, {
      Cards: [
        { id: 1, Title: 'First' },
        { id: 2, Title: 'Second' },
        { id: 3, Title: 'Third' },
      ],
    });

    expect(fields).toEqual(['Cards.0.Title', 'Cards.1.Title', 'Cards.2.Title']);
  });

  it('recurses into a component nested inside another component', () => {
    const fields = paths(pageSchema, {
      Header: { id: 4, Text: 'Outer', Inner: { id: 9, Title: 'Inner' } },
    });

    expect(fields).toEqual(['Header.Text', 'Header.Inner.Title']);
  });

  /**
   * The gate is asymmetric on purpose. At the content-type level a missing flag means the value is
   * shared across locales, so it must not be touched. Inside a component the flag has no effect on
   * i18n at all — `getNonLocalizedAttributes` never recurses — and on a real host the overwhelming
   * majority of component attributes carry no flag. Requiring `true` there would silently skip
   * nearly every nested field.
   */
  it('translates unflagged component attributes, since the flag is inert inside components', () => {
    expect(paths(pageSchema, { Cards: [{ id: 1, Title: 'Unflagged but translatable' }] })).toEqual([
      'Cards.0.Title',
    ]);
  });

  it('still honours an explicit localized:false inside a component', () => {
    const fields = paths(pageSchema, {
      Cards: [{ id: 1, Title: 'Translate me', Note: 'Leave me alone' }],
    });

    expect(fields).toEqual(['Cards.0.Title']);
  });

  it('does not descend into a component whose content-type attribute is non-localized', () => {
    expect(paths(pageSchema, { Shared: { id: 1, Title: 'Shared across locales' } })).toEqual([]);
  });

  it('leaves media and relations inside components alone', () => {
    const fields = paths(pageSchema, {
      Header: {
        id: 4,
        Text: 'Kept',
        Image: { id: 7, url: '/uploads/cove.jpg', alternativeText: 'A cove' },
        Link: { id: 3 },
      },
    });

    expect(fields).toEqual(['Header.Text']);
  });

  it('tolerates a component whose schema is unknown rather than throwing', () => {
    const schema: ExtractorSchema = {
      attributes: {
        Mystery: {
          type: 'component',
          component: 'not.registered',
          pluginOptions: { i18n: { localized: true } },
        },
      },
    };

    expect(extractFields(schema, { Mystery: { Title: 'x' } }, components)).toEqual([]);
  });
});

describe('extractFields — dynamic zones', () => {
  it('extracts text from each item, resolving its component by __component', () => {
    const fields = paths(pageSchema, {
      Sections: [
        { __component: 'blocks.hero', id: 1, Heading: 'The harbour' },
        { __component: 'blocks.quote', id: 2, Quote: 'A bell, far off.' },
        { __component: 'blocks.hero', id: 3, Heading: 'The lighthouse' },
      ],
    });

    expect(fields).toEqual(['Sections.0.Heading', 'Sections.1.Quote', 'Sections.2.Heading']);
  });

  it('skips a dynamic-zone item whose component is not registered', () => {
    const fields = paths(pageSchema, {
      Sections: [
        { __component: 'blocks.unknown', id: 1, Heading: 'Skipped' },
        { __component: 'blocks.hero', id: 2, Heading: 'Kept' },
      ],
    });

    expect(fields).toEqual(['Sections.1.Heading']);
  });

  it('leaves media inside a dynamic-zone item alone', () => {
    const fields = paths(pageSchema, {
      Sections: [{ __component: 'blocks.hero', id: 1, Heading: 'Kept', Media: { id: 7 } }],
    });

    expect(fields).toEqual(['Sections.0.Heading']);
  });
});

describe('extractFields — block and JSON rich text', () => {
  const blocksSchema: ExtractorSchema = {
    attributes: {
      Content: { type: 'blocks', pluginOptions: { i18n: { localized: true } } },
      Data: { type: 'json', pluginOptions: { i18n: { localized: true } } },
    },
  };

  it('extracts the text leaves of a blocks field, leaving its structure alone', () => {
    const fields = extractFields(blocksSchema, {
      Content: [
        {
          type: 'heading',
          level: 2,
          children: [{ type: 'text', text: 'The harbour at night' }],
        },
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Boats rest against the ' },
            { type: 'text', text: 'quay', bold: true },
            { type: 'text', text: '.' },
          ],
        },
      ],
    });

    expect(fields).toEqual([
      { path: 'Content.0.children.0.text', value: 'The harbour at night', type: 'blocks' },
      { path: 'Content.1.children.0.text', value: 'Boats rest against the ', type: 'blocks' },
      { path: 'Content.1.children.1.text', value: 'quay', type: 'blocks' },
      { path: 'Content.1.children.2.text', value: '.', type: 'blocks' },
    ]);
  });

  it('extracts text from a link node nested inside a block', () => {
    const fields = extractFields(blocksSchema, {
      Content: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'link',
              url: 'https://example.com',
              children: [{ type: 'text', text: 'here' }],
            },
          ],
        },
      ],
    });

    expect(fields.map((field) => field.path)).toEqual(['Content.0.children.0.children.0.text']);
  });

  it('never extracts a block node url, so links keep working', () => {
    const fields = extractFields(blocksSchema, {
      Content: [{ type: 'image', image: { url: 'https://cdn.example.com/a.png', name: 'a.png' } }],
    });

    expect(fields).toEqual([]);
  });

  it('extracts string values from a json field', () => {
    const fields = extractFields(blocksSchema, {
      Data: { heading: 'Opening hours', items: [{ label: 'Weekdays' }, { label: 'Weekends' }] },
    });

    expect(fields.map((field) => [field.path, field.value])).toEqual([
      ['Data.heading', 'Opening hours'],
      ['Data.items.0.label', 'Weekdays'],
      ['Data.items.1.label', 'Weekends'],
    ]);
  });

  it('leaves urls and emails inside json alone, since translating them breaks them', () => {
    const fields = extractFields(blocksSchema, {
      Data: {
        label: 'Contact us',
        href: 'https://example.com/contact',
        mail: 'hello@example.com',
        protocolless: 'www.example.com/path',
      },
    });

    expect(fields.map((field) => field.path)).toEqual(['Data.label']);
  });

  it('ignores non-string json leaves', () => {
    const fields = extractFields(blocksSchema, {
      Data: { count: 3, enabled: true, missing: null, label: 'Kept' },
    });

    expect(fields.map((field) => field.path)).toEqual(['Data.label']);
  });
});
