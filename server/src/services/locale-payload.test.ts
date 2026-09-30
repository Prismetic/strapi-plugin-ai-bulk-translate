import { describe, expect, it } from 'vitest';

import type { ComponentSchemas, ExtractorSchema } from './field-extractor';
import { buildLocalePayload } from './locale-payload';

const schema: ExtractorSchema = {
  attributes: {
    Name: { type: 'string', pluginOptions: { i18n: { localized: true } } },
    Path: { type: 'string', pluginOptions: { i18n: { localized: false } } },
    Cover: { type: 'media', pluginOptions: { i18n: { localized: true } } },
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
    Sections: {
      type: 'dynamiczone',
      components: ['blocks.hero'],
      pluginOptions: { i18n: { localized: true } },
    },
  },
};

const components: ComponentSchemas = {
  'utils.image-text': {
    attributes: {
      Text: { type: 'string' },
      Image: { type: 'media' },
      Inner: { type: 'component', component: 'utils.card' },
    },
  },
  'utils.card': { attributes: { Title: { type: 'string' }, Icon: { type: 'media' } } },
  'blocks.hero': { attributes: { Heading: { type: 'string' }, Media: { type: 'media' } } },
};

describe('buildLocalePayload', () => {
  it('sends only the attributes translation touched', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: { Name: 'Bahía', Path: '/shared', Cover: { id: 7 } },
      touchedPaths: ['Name'],
    });

    expect(payload).toEqual({ Name: 'Bahía' });
  });

  it('sends a whole component when something inside it was translated', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: { Header: { id: 4, Text: 'Bienvenido', Image: { id: 9, url: '/a.jpg' } } },
      touchedPaths: ['Header.Text'],
    });

    expect(payload).toEqual({ Header: { Text: 'Bienvenido', Image: { id: 9, url: '/a.jpg' } } });
  });

  /**
   * The subtle one. Component rows belong to a locale, and the document being sent is a clone of
   * the *source* locale, so its component ids point at the source's rows. Sending them at a target
   * locale either errors or re-links the source's components. i18n strips ids for the same reason
   * when it copies non-localized fields across (`removeIdsMut`).
   */
  it('strips component ids, which belong to the source locale', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: { Header: { id: 4, Text: 'Bienvenido' } },
      touchedPaths: ['Header.Text'],
    }) as { Header: Record<string, unknown> };

    expect('id' in payload.Header).toBe(false);
  });

  it('strips ids from every entry of a repeatable component', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: {
        Cards: [
          { id: 1, Title: 'Uno' },
          { id: 2, Title: 'Dos' },
        ],
      },
      touchedPaths: ['Cards.0.Title'],
    }) as { Cards: Record<string, unknown>[] };

    expect(payload.Cards).toEqual([{ Title: 'Uno' }, { Title: 'Dos' }]);
  });

  it('strips ids from a component nested inside a component', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: { Header: { id: 4, Text: 'Hola', Inner: { id: 9, Title: 'Dentro' } } },
      touchedPaths: ['Header.Text'],
    });

    expect(payload).toEqual({ Header: { Text: 'Hola', Inner: { Title: 'Dentro' } } });
  });

  it('strips the id but keeps __component on dynamic-zone items', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: {
        Sections: [{ __component: 'blocks.hero', id: 5, Heading: 'El puerto' }],
      },
      touchedPaths: ['Sections.0.Heading'],
    });

    expect(payload).toEqual({
      Sections: [{ __component: 'blocks.hero', Heading: 'El puerto' }],
    });
  });

  /**
   * A media or relation id is the *link itself*. Stripping it would detach the image — exactly the
   * failure the exclusions exist to prevent — so the id-stripping must be schema-aware, not a blind
   * sweep for every key called `id`.
   */
  it('keeps media ids inside components, since that id is the link', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: {
        Header: { id: 4, Text: 'Hola', Image: { id: 9, url: '/a.jpg', name: 'a.jpg' } },
      },
      touchedPaths: ['Header.Text'],
    }) as { Header: { Image: Record<string, unknown> } };

    expect(payload.Header.Image).toEqual({ id: 9, url: '/a.jpg', name: 'a.jpg' });
  });

  it('keeps media ids inside dynamic-zone items', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: {
        Sections: [{ __component: 'blocks.hero', id: 5, Heading: 'Hola', Media: { id: 12 } }],
      },
      touchedPaths: ['Sections.0.Heading'],
    }) as { Sections: { Media: Record<string, unknown> }[] };

    expect(payload.Sections[0].Media).toEqual({ id: 12 });
  });

  it('returns nothing when no path was touched, so no pointless write is made', () => {
    expect(
      buildLocalePayload({ schema, components, document: { Name: 'x' }, touchedPaths: [] })
    ).toEqual({});
  });

  it('ignores a touched path whose root is not in the schema', () => {
    const payload = buildLocalePayload({
      schema,
      components,
      document: { Name: 'Bahía', Rogue: 'injected' },
      touchedPaths: ['Name', 'Rogue'],
    });

    expect(payload).toEqual({ Name: 'Bahía' });
  });

  it('does not mutate the document it was given', () => {
    const document = { Header: { id: 4, Text: 'Hola' } };
    buildLocalePayload({ schema, components, document, touchedPaths: ['Header.Text'] });

    expect(document.Header.id).toBe(4);
  });
});

/**
 * The gap the `target` option closes. Everything on this schema is localized, as it must be on a
 * host affected by strapi#27182 — so nothing here is shared, and nothing is filled by i18n.
 */
const localizedSchema: ExtractorSchema = {
  attributes: {
    Title: { type: 'string', pluginOptions: { i18n: { localized: true } } },
    Slug: { type: 'uid', pluginOptions: { i18n: { localized: true } } },
    Image: { type: 'media', pluginOptions: { i18n: { localized: true } } },
    PriorityOrder: { type: 'integer', pluginOptions: { i18n: { localized: true } } },
    PublishedDate: { type: 'datetime', pluginOptions: { i18n: { localized: true } } },
    ShowInSlider: { type: 'boolean', pluginOptions: { i18n: { localized: true } } },
    Tags: { type: 'relation', relation: 'manyToMany', target: 'api::tag.tag' },
    Header: {
      type: 'component',
      component: 'utils.image-text',
      pluginOptions: { i18n: { localized: true } },
    },
    Shared: { type: 'string' },
    Secret: { type: 'password', pluginOptions: { i18n: { localized: true } } },
    createdAt: { type: 'datetime' },
    updatedAt: { type: 'datetime' },
    publishedAt: { type: 'datetime' },
    createdBy: { type: 'relation', relation: 'oneToOne', target: 'admin::user', private: true },
    locale: { type: 'string' },
    localizations: { type: 'relation', relation: 'oneToMany', target: 'api::x.x' },
  },
};

const source = {
  id: 1,
  documentId: 'doc-a',
  Title: 'Muebles',
  Slug: 'furniture',
  Image: { id: 9, url: '/a.jpg' },
  PriorityOrder: 15,
  PublishedDate: '2025-09-29T03:30:00.000Z',
  ShowInSlider: false,
  Tags: [{ id: 3, documentId: 'tag-a' }],
  Header: { id: 4, Text: 'Hola', Image: { id: 10 } },
  Shared: 'same everywhere',
  Secret: 'hash',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-02T00:00:00.000Z',
  publishedAt: '2025-01-03T00:00:00.000Z',
  createdBy: { id: 1, documentId: 'admin-a' },
  locale: 'en',
  localizations: [],
};

describe('buildLocalePayload with a target locale', () => {
  it('carries every per-locale field a new locale would otherwise lack', () => {
    const payload = buildLocalePayload({
      schema: localizedSchema,
      components,
      document: source,
      touchedPaths: ['Title'],
      target: null,
    });

    expect(payload).toEqual({
      Title: 'Muebles',
      Image: { id: 9, url: '/a.jpg' },
      PriorityOrder: 15,
      PublishedDate: '2025-09-29T03:30:00.000Z',
      ShowInSlider: false,
      Tags: [{ id: 3, documentId: 'tag-a' }],
      Header: { Text: 'Hola', Image: { id: 10 } },
    });
  });

  /** A slug is regenerated from the translated title, not copied; copying would undo that. */
  it('never carries identifiers, secrets, shared fields or what Strapi manages itself', () => {
    const payload = buildLocalePayload({
      schema: localizedSchema,
      components,
      document: source,
      touchedPaths: [],
      target: null,
    });

    for (const name of [
      'Slug',
      'Secret',
      'Shared',
      'id',
      'documentId',
      'locale',
      'localizations',
      'createdAt',
      'updatedAt',
      'publishedAt',
      'createdBy',
    ]) {
      expect(name in payload, name).toBe(false);
    }
  });

  /** Carrying fills gaps. An image the editor chose for this locale is theirs to keep. */
  it('leaves alone what the existing target already has a value for', () => {
    const payload = buildLocalePayload({
      schema: localizedSchema,
      components,
      document: source,
      touchedPaths: ['Title'],
      target: {
        Title: 'Old',
        Image: { id: 99 },
        PriorityOrder: 2,
        PublishedDate: null,
        ShowInSlider: true,
        Tags: [],
        Header: null,
      },
    });

    expect(payload).toEqual({
      Title: 'Muebles',
      PublishedDate: '2025-09-29T03:30:00.000Z',
      Tags: [{ id: 3, documentId: 'tag-a' }],
      Header: { Text: 'Hola', Image: { id: 10 } },
    });
  });

  /**
   * The row a 1.1.0 translation left behind: never sent a date, so Strapi applied the default.
   * By the value alone that is a real date; by the schema it is the absence of one.
   */
  it('treats the schema default as no value, so a defaulted row is repaired', () => {
    const withDefaults: ExtractorSchema = {
      attributes: {
        PublishedDate: {
          type: 'datetime',
          default: '2025-01-01T03:30:00.000Z',
          pluginOptions: { i18n: { localized: true } },
        },
        ShowInSlider: {
          type: 'boolean',
          default: true,
          pluginOptions: { i18n: { localized: true } },
        },
      },
    };

    const payload = buildLocalePayload({
      schema: withDefaults,
      components,
      document: { PublishedDate: '2025-09-29T03:30:00.000Z', ShowInSlider: false },
      touchedPaths: [],
      target: { PublishedDate: '2025-01-01T03:30:00.000Z', ShowInSlider: true },
    });

    expect(payload).toEqual({ PublishedDate: '2025-09-29T03:30:00.000Z', ShowInSlider: false });
  });

  it('keeps a target value that differs from the default', () => {
    const withDefaults: ExtractorSchema = {
      attributes: {
        PublishedDate: {
          type: 'datetime',
          default: '2025-01-01T03:30:00.000Z',
          pluginOptions: { i18n: { localized: true } },
        },
      },
    };

    const payload = buildLocalePayload({
      schema: withDefaults,
      components,
      document: { PublishedDate: '2025-09-29T03:30:00.000Z' },
      touchedPaths: [],
      target: { PublishedDate: '2026-02-02T00:00:00.000Z' },
    });

    expect(payload).toEqual({});
  });

  it('treats an empty string and an empty list as no value', () => {
    const payload = buildLocalePayload({
      schema: localizedSchema,
      components,
      document: { Title: 'Muebles', Tags: [{ id: 3, documentId: 'tag-a' }] },
      touchedPaths: [],
      target: { Title: '', Tags: [] },
    });

    expect(payload).toEqual({ Title: 'Muebles', Tags: [{ id: 3, documentId: 'tag-a' }] });
  });

  it('sends only touched roots when no target is given, as before', () => {
    const payload = buildLocalePayload({
      schema: localizedSchema,
      components,
      document: source,
      touchedPaths: ['Title'],
    });

    expect(payload).toEqual({ Title: 'Muebles' });
  });
});
