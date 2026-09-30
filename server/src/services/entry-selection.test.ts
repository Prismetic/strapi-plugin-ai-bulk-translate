import { describe, expect, it } from 'vitest';

import { resolveEntrySelection } from './entry-selection';

import type { Core } from '@strapi/strapi';

/** Just enough of Strapi for the resolver: the schema registry and the translator's lookup. */
const fakeStrapi = (schema: Record<string, unknown> | undefined, resolved: string | null) =>
  ({
    contentType: () => schema,
    plugin: () => ({
      service: () => ({ resolveSingleTypeDocumentId: async () => resolved }),
    }),
  }) as unknown as Core.Strapi;

const localized = { pluginOptions: { i18n: { localized: true } } };

describe('resolveEntrySelection', () => {
  it('uses the identifiers the admin sent, when it sent any', async () => {
    const selection = await resolveEntrySelection(
      fakeStrapi({ kind: 'collectionType', ...localized }, null),
      { contentType: 'api::a.a', sourceLocale: 'en', documentIds: ['x', 'y'] }
    );

    expect(selection).toEqual({ documentIds: ['x', 'y'] });
  });

  it('finds the one document behind a single type', async () => {
    const selection = await resolveEntrySelection(
      fakeStrapi({ kind: 'singleType', ...localized }, 'home-1'),
      { contentType: 'api::home.home', sourceLocale: 'en' }
    );

    expect(selection).toEqual({ documentIds: ['home-1'] });
  });

  it('refuses a single type with nothing saved in the source locale, saying so', async () => {
    const selection = await resolveEntrySelection(
      fakeStrapi({ kind: 'singleType', ...localized }, null),
      { contentType: 'api::home.home', sourceLocale: 'en' }
    );

    expect(selection).toEqual({
      refusal: '"api::home.home" has nothing saved in en yet, so there is nothing to translate.',
    });
  });

  it('refuses an empty selection on a collection type', async () => {
    const selection = await resolveEntrySelection(
      fakeStrapi({ kind: 'collectionType', ...localized }, 'never-used'),
      { contentType: 'api::a.a', sourceLocale: 'en', documentIds: [] }
    );

    expect(selection).toEqual({ refusal: 'Choose at least one entry.' });
  });

  it('refuses a content type without internationalization', async () => {
    const selection = await resolveEntrySelection(fakeStrapi({ kind: 'singleType' }, 'x'), {
      contentType: 'api::a.a',
      sourceLocale: 'en',
    });

    expect(selection).toEqual({
      refusal: '"api::a.a" does not have internationalization enabled, so it cannot be translated.',
    });
  });

  it('refuses an unknown content type', async () => {
    const selection = await resolveEntrySelection(fakeStrapi(undefined, 'x'), {
      contentType: 'api::nope.nope',
      sourceLocale: 'en',
    });

    expect(selection).toEqual({ refusal: 'Unknown content type "api::nope.nope".' });
  });
});
