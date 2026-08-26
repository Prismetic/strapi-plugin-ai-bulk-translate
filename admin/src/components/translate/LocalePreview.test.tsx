// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { render, screen } from '../../testing/render';
import { LocalePreview } from './LocalePreview';

import type { DocumentLocaleStatus } from '../../hooks/useLocaleStatus';

const rows: DocumentLocaleStatus[] = [
  {
    documentId: 'a',
    title: 'Accommodation',
    locales: { de: 'empty', fr: 'has-content' },
    excluded: false,
  },
  {
    documentId: 'b',
    title: 'Nothing here',
    locales: { de: 'no-source', fr: 'no-source' },
    excluded: true,
  },
];

const targetLocales = ['de', 'fr'];

describe('LocalePreview', () => {
  it('shows one row per entry, labelled with the entry title', () => {
    render(
      <LocalePreview rows={rows} targetLocales={targetLocales} isLoading={false} error={null} />
    );

    expect(screen.getByText('Accommodation')).toBeTruthy();
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  /**
   * The three states, in words rather than only colour. An editor deciding whether a run is safe
   * reads these; conveying it by colour alone would fail anyone who cannot distinguish them.
   */
  it('renders a badge per locale carrying the state in words', () => {
    render(
      <LocalePreview rows={rows} targetLocales={targetLocales} isLoading={false} error={null} />
    );

    expect(screen.getByText('de · new')).toBeTruthy();
    expect(screen.getByText('fr · has content')).toBeTruthy();
    expect(screen.getAllByText(/· no source/)).toHaveLength(2);
  });

  it('marks a locale absent from the row as no-source rather than crashing', () => {
    render(
      <LocalePreview
        rows={[{ documentId: 'c', title: 'Partial', locales: { de: 'empty' }, excluded: false }]}
        targetLocales={['de', 'fr']}
        isLoading={false}
        error={null}
      />
    );

    expect(screen.getByText('de · new')).toBeTruthy();
    expect(screen.getByText('fr · no source')).toBeTruthy();
  });

  it('shows a checking state instead of rows while the preview is loading', () => {
    render(<LocalePreview rows={[]} targetLocales={targetLocales} isLoading error={null} />);

    expect(screen.getByText('Checking…')).toBeTruthy();
    expect(screen.queryByText('Accommodation')).toBeNull();
  });

  it('shows the error instead of a misleading empty preview', () => {
    render(
      <LocalePreview
        rows={rows}
        targetLocales={targetLocales}
        isLoading={false}
        error="Could not check the target locales."
      />
    );

    expect(screen.getByText('Could not check the target locales.')).toBeTruthy();
    expect(screen.queryByText('Accommodation')).toBeNull();
  });

  it('renders nothing before there is anything to preview', () => {
    render(
      <LocalePreview rows={[]} targetLocales={targetLocales} isLoading={false} error={null} />
    );

    expect(screen.queryByText(/· new/)).toBeNull();
  });
});
