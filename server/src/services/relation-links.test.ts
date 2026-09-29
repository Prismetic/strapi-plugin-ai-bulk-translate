import { describe, expect, it } from 'vitest';

import type { ComponentSchemas, ExtractorSchema } from './field-extractor';
import { collectLinks, describeDropped, pruneLinks, type RelationLink } from './relation-links';

const schema: ExtractorSchema = {
  attributes: {
    Name: { type: 'string' },
    Sector: { type: 'relation', relation: 'oneToOne', target: 'api::sector.sector' },
    Header: { type: 'component', component: 'utils.teaser' },
    Cards: { type: 'component', component: 'utils.teaser', repeatable: true },
    Sections: { type: 'dynamiczone', components: ['blocks.sectors', 'blocks.related'] },
  },
};

const components: ComponentSchemas = {
  'utils.teaser': {
    attributes: {
      Title: { type: 'string' },
      Image: { type: 'media' },
      Article: { type: 'relation', relation: 'oneToOne', target: 'api::article.article' },
    },
  },
  'blocks.sectors': {
    attributes: {
      Heading: { type: 'string' },
      Sectors: { type: 'relation', relation: 'oneToMany', target: 'api::sector.sector' },
      Inner: { type: 'component', component: 'utils.teaser' },
    },
  },
  'blocks.related': {
    attributes: {
      Items: { type: 'relation', relation: 'morphToMany' },
    },
  },
};

const only =
  (...available: string[]) =>
  (link: RelationLink) =>
    available.includes(link.documentId);

describe('collectLinks', () => {
  it('finds links at every depth, grouped by the content type they point at', () => {
    const links = collectLinks({
      schema,
      components,
      data: {
        Sector: { id: 1, documentId: 'sector-a' },
        Header: { Title: 'Hola', Article: { id: 2, documentId: 'article-a' } },
        Sections: [
          {
            __component: 'blocks.sectors',
            Sectors: [
              { id: 3, documentId: 'sector-b' },
              { id: 4, documentId: 'sector-a' },
            ],
            Inner: { Article: { id: 5, documentId: 'article-b' } },
          },
        ],
      },
    });

    expect(links).toEqual(
      new Map([
        ['api::sector.sector', new Set(['sector-a', 'sector-b'])],
        ['api::article.article', new Set(['article-a', 'article-b'])],
      ])
    );
  });

  /** A polymorphic attribute declares no target; each item names its own. */
  it('reads the target of a polymorphic link from the item itself', () => {
    const links = collectLinks({
      schema,
      components,
      data: {
        Sections: [
          {
            __component: 'blocks.related',
            Items: [{ __type: 'api::article.article', id: 9, documentId: 'article-c' }],
          },
        ],
      },
    });

    expect(links).toEqual(new Map([['api::article.article', new Set(['article-c'])]]));
  });

  it('returns nothing for a payload that holds no links', () => {
    expect(collectLinks({ schema, components, data: { Name: 'Bahía' } })).toEqual(new Map());
  });
});

describe('pruneLinks', () => {
  /**
   * The failure this module exists for. Strapi resolves a link written at a target locale against
   * that same locale, and one entry without a version there rejects the whole write — so a page
   * with forty translated fields is lost to a sector nobody has translated yet.
   */
  it('drops the unavailable entries of a to-many link and keeps the rest in order', () => {
    const { data, dropped } = pruneLinks(
      {
        schema,
        components,
        data: {
          Sections: [
            {
              __component: 'blocks.sectors',
              Heading: '行业',
              Sectors: [
                { id: 3, documentId: 'sector-a' },
                { id: 4, documentId: 'sector-b' },
                { id: 5, documentId: 'sector-c' },
              ],
            },
          ],
        },
      },
      only('sector-a', 'sector-c')
    );

    expect(data).toEqual({
      Sections: [
        {
          __component: 'blocks.sectors',
          Heading: '行业',
          Sectors: [
            { id: 3, documentId: 'sector-a' },
            { id: 5, documentId: 'sector-c' },
          ],
        },
      ],
    });
    expect(dropped).toEqual([
      { targetUid: 'api::sector.sector', documentId: 'sector-b', path: 'Sections.0.Sectors' },
    ]);
  });

  it('empties a to-one link whose entry is unavailable', () => {
    const { data, dropped } = pruneLinks(
      {
        schema,
        components,
        data: { Header: { Title: 'Hola', Article: { id: 2, documentId: 'article-a' } } },
      },
      only()
    );

    expect(data).toEqual({ Header: { Title: 'Hola', Article: null } });
    expect(dropped).toEqual([
      { targetUid: 'api::article.article', documentId: 'article-a', path: 'Header.Article' },
    ]);
  });

  it('prunes inside repeatable and nested components', () => {
    const { data, dropped } = pruneLinks(
      {
        schema,
        components,
        data: {
          Cards: [
            { Title: 'Uno', Article: { id: 1, documentId: 'article-a' } },
            { Title: 'Dos', Article: { id: 2, documentId: 'article-b' } },
          ],
          Sections: [
            {
              __component: 'blocks.sectors',
              Inner: { Title: 'Tres', Article: { id: 3, documentId: 'article-b' } },
            },
          ],
        },
      },
      only('article-a')
    );

    expect(data).toEqual({
      Cards: [
        { Title: 'Uno', Article: { id: 1, documentId: 'article-a' } },
        { Title: 'Dos', Article: null },
      ],
      Sections: [{ __component: 'blocks.sectors', Inner: { Title: 'Tres', Article: null } }],
    });
    expect(dropped.map((link) => link.path)).toEqual(['Cards.1.Article', 'Sections.0.Inner.Article']);
  });

  /** Media is a link too, but to a file rather than an entry, and files have no locale. */
  it('leaves media alone, whatever the predicate says', () => {
    const { data, dropped } = pruneLinks(
      {
        schema,
        components,
        data: { Header: { Title: 'Hola', Image: { id: 9, documentId: 'file-a', url: '/a.jpg' } } },
      },
      only()
    );

    expect(data).toEqual({
      Header: { Title: 'Hola', Image: { id: 9, documentId: 'file-a', url: '/a.jpg' } },
    });
    expect(dropped).toEqual([]);
  });

  /** Nothing to resolve it against, so there is no basis for calling it unavailable. */
  it('leaves a link alone when it carries no document id', () => {
    const { data, dropped } = pruneLinks(
      { schema, components, data: { Header: { Title: 'Hola', Article: { id: 2 } } } },
      only()
    );

    expect(data).toEqual({ Header: { Title: 'Hola', Article: { id: 2 } } });
    expect(dropped).toEqual([]);
  });

  it('returns the payload unchanged when every link is available', () => {
    const payload = { Header: { Title: 'Hola', Article: { id: 2, documentId: 'article-a' } } };
    const { data, dropped } = pruneLinks({ schema, components, data: payload }, () => true);

    expect(data).toEqual(payload);
    expect(dropped).toEqual([]);
  });

  it('does not mutate the payload it was given', () => {
    const payload = {
      Sections: [{ __component: 'blocks.sectors', Sectors: [{ id: 3, documentId: 'sector-a' }] }],
    };

    pruneLinks({ schema, components, data: payload }, only());

    expect(payload.Sections[0].Sectors).toEqual([{ id: 3, documentId: 'sector-a' }]);
  });
});

describe('describeDropped', () => {
  const nameOf = (uid: string) => (uid === 'api::sector.sector' ? 'Sector' : 'Article');

  it('says nothing when nothing was dropped', () => {
    expect(describeDropped([], 'zh-CN', nameOf)).toBeUndefined();
  });

  it('names the content type and the locale for a single entry', () => {
    const notice = describeDropped(
      [{ targetUid: 'api::sector.sector', documentId: 'sector-a', path: 'Sections.0.Sectors' }],
      'zh-CN',
      nameOf
    );

    expect(notice).toBe(
      'Links to 1 entry with no zh-CN version were left out: Sector (1). Translate it to link it from zh-CN.'
    );
  });

  /** Three links to one sector are one entry to translate, not three. */
  it('counts entries rather than links, per content type', () => {
    const notice = describeDropped(
      [
        { targetUid: 'api::sector.sector', documentId: 'sector-a', path: 'Sections.0.Sectors' },
        { targetUid: 'api::sector.sector', documentId: 'sector-a', path: 'Sections.4.Sectors' },
        { targetUid: 'api::sector.sector', documentId: 'sector-b', path: 'Sections.4.Sectors' },
        { targetUid: 'api::article.article', documentId: 'article-a', path: 'Header.Article' },
      ],
      'zh-CN',
      nameOf
    );

    expect(notice).toBe(
      'Links to 3 entries with no zh-CN version were left out: Sector (2), Article (1). Translate them to link them from zh-CN.'
    );
  });
});
