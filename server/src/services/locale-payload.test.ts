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
