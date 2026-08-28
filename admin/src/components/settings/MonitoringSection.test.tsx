// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, isChecked, render, screen } from '../../testing/render';

import type { MonitorConfig } from '../../hooks/useMonitorConfig';

const state = {
  canManage: true,
  translatable: [
    { uid: 'api::article.article', kind: 'collectionType', localized: true },
    { uid: 'api::homepage.homepage', kind: 'singleType', localized: true },
  ] as { uid: string; kind: string; localized: boolean }[] | null,
  locales: [
    { code: 'en', name: 'English (en)', isDefault: true },
    { code: 'ar', name: 'Arabic (ar)', isDefault: false },
  ],
  configs: {} as Record<string, MonitorConfig>,
  isLoading: false,
  error: null as string | null,
};

const save = vi.fn().mockResolvedValue(true);

vi.mock('../../hooks/useSettingsPermission', () => ({
  useSettingsPermission: () => ({ canManage: state.canManage, isLoading: false }),
}));

vi.mock('../../hooks/useTranslatableContentTypes', () => ({
  useTranslatableContentTypes: () => ({
    translatable: state.translatable,
    contentTypes: state.translatable,
    isTranslatable: () => true,
  }),
}));

vi.mock('../../hooks/useLocales', () => ({
  useLocales: () => ({ locales: state.locales, isLoading: false }),
}));

vi.mock('../../hooks/useMonitorConfig', () => ({
  useMonitorConfig: () => ({
    configs: state.configs,
    isLoading: state.isLoading,
    error: state.error,
    refresh: vi.fn(),
    save,
  }),
}));

const { MonitoringSection } = await import('./MonitoringSection');

const monitored = (over: Partial<MonitorConfig> = {}): MonitorConfig => ({
  contentType: 'api::article.article',
  enabled: true,
  locales: [{ code: 'ar', overwriteContent: false, overwriteManualEdits: false }],
  ...over,
});

beforeEach(() => {
  state.canManage = true;
  state.configs = {};
  state.isLoading = false;
  state.error = null;
  state.translatable = [
    { uid: 'api::article.article', kind: 'collectionType', localized: true },
    { uid: 'api::homepage.homepage', kind: 'singleType', localized: true },
  ];
  save.mockClear();
});

const box = (name: string | RegExp) => screen.queryByRole('checkbox', { name });

/** Locale rows live behind the expand, so most assertions have to open the type first. */
const expand = (contentType: string) =>
  fireEvent.click(screen.getByRole('button', { name: `Locales for ${contentType}` }));

const translateBox = (locale = 'Arabic (ar)') => box(`Translate into ${locale}`);
const contentBox = (locale = 'Arabic (ar)') => box(`Overwrite content in ${locale}`);
const manualBox = (locale = 'Arabic (ar)') => box(`Overwrite manual edits in ${locale}`);

describe('MonitoringSection', () => {
  it('lists localized content types, collection and single', () => {
    render(<MonitoringSection />);

    expect(box('article')).not.toBeNull();
    expect(box('homepage')).not.toBeNull();
  });

  it('starts with every type unmonitored, so nothing is switched on by arriving', () => {
    render(<MonitoringSection />);

    expect(isChecked(box('article') as HTMLElement)).toBe(false);
    expect(screen.getAllByText('Not monitored').length).toBe(2);
  });

  /** One line per content type until it has something to say. */
  it('keeps a monitored type collapsed until it is opened', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);

    expect(translateBox()).toBeNull();

    expand('article');

    expect(translateBox()).not.toBeNull();
  });

  /** Shipped as "Arabic (ar) (ar)": i18n's name already carries the parenthetical. */
  it('names a locale once, not twice', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);
    expand('article');

    expect(screen.getByText('Arabic (ar)')).toBeTruthy();
    expect(screen.queryByText(/\(ar\)\s*\(ar\)/)).toBeNull();
  });

  it('names its columns once, above every row', () => {
    render(<MonitoringSection />);

    expect(screen.getByText('Content type')).toBeTruthy();
    expect(screen.getByText('Translate')).toBeTruthy();
    expect(screen.getByText('Overwrite content')).toBeTruthy();
    expect(screen.getByText('Overwrite manual edits')).toBeTruthy();
  });

  /** The source of truth is never a target — the same rule the translation dialog enforces. */
  it('never offers the default locale as a target', () => {
    state.configs = { 'api::article.article': monitored({ locales: [] }) };
    render(<MonitoringSection />);
    expand('article');

    expect(translateBox('English (en)')).toBeNull();
    expect(translateBox()).not.toBeNull();
  });

  it('leaves the overwrite controls disabled for a locale not being translated into', () => {
    state.configs = { 'api::article.article': monitored({ locales: [] }) };
    render(<MonitoringSection />);
    expand('article');

    expect((contentBox() as HTMLElement).hasAttribute('disabled')).toBe(true);
  });

  it('offers the overwrite controls for a chosen locale, both off', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);
    expand('article');

    expect(isChecked(contentBox() as HTMLElement)).toBe(false);
    expect(isChecked(manualBox() as HTMLElement)).toBe(false);
  });

  /** The nesting rule: the stronger act cannot be reached without choosing the weaker one first. */
  it('disables overwriting manual edits until content is overwritten', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);
    expand('article');

    expect((manualBox() as HTMLElement).hasAttribute('disabled')).toBe(true);
  });

  it('enables it once content is overwritten', () => {
    state.configs = {
      'api::article.article': monitored({
        locales: [{ code: 'ar', overwriteContent: true, overwriteManualEdits: false }],
      }),
    };
    render(<MonitoringSection />);
    expand('article');

    expect((manualBox() as HTMLElement).hasAttribute('disabled')).toBe(false);
  });

  it('clears the nested choice when its parent is turned off', () => {
    state.configs = {
      'api::article.article': monitored({
        locales: [{ code: 'ar', overwriteContent: true, overwriteManualEdits: true }],
      }),
    };
    render(<MonitoringSection />);
    expand('article');

    fireEvent.click(contentBox() as HTMLElement);

    expect(isChecked(manualBox() as HTMLElement)).toBe(false);
    expect((manualBox() as HTMLElement).hasAttribute('disabled')).toBe(true);
  });

  it('opens a type as soon as it is switched on, rather than leaving an empty row', () => {
    render(<MonitoringSection />);
    fireEvent.click(box('article') as HTMLElement);

    expect(translateBox()).not.toBeNull();
  });

  it('offers no write control at all to a role that cannot manage settings', () => {
    state.canManage = false;
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);
    expand('article');

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect((box('article') as HTMLElement).hasAttribute('disabled')).toBe(true);
    expect((translateBox() as HTMLElement).hasAttribute('disabled')).toBe(true);
  });

  /** One button for the section, not one per content type. */
  it('keeps a single Save, disabled until something changes', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);

    const buttons = screen.getAllByRole('button', { name: 'Save' });

    expect(buttons.length).toBe(1);
    expect(buttons[0].hasAttribute('disabled')).toBe(true);
  });

  it('enables Save once something changes', () => {
    render(<MonitoringSection />);
    fireEvent.click(box('article') as HTMLElement);

    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);
  });

  it('saves every content type that changed', async () => {
    render(<MonitoringSection />);
    fireEvent.click(box('article') as HTMLElement);
    fireEvent.click(box('homepage') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  });

  /**
   * The defect this exists for: a ticked-but-unsaved box looked exactly like a saved one, so a
   * monitoring policy was believed to be in force when it had never been written.
   */
  it('marks nothing as unsaved when nothing has changed', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);

    expect(screen.queryByText('Unsaved')).toBeNull();
  });

  it('marks the row that changed, where the change was made', () => {
    render(<MonitoringSection />);
    fireEvent.click(box('article') as HTMLElement);

    expect(screen.getByText('Unsaved')).toBeTruthy();
  });

  it('marks only the rows that changed', () => {
    render(<MonitoringSection />);
    fireEvent.click(box('article') as HTMLElement);

    expect(screen.getAllByText('Unsaved')).toHaveLength(1);

    fireEvent.click(box('homepage') as HTMLElement);

    expect(screen.getAllByText('Unsaved')).toHaveLength(2);
  });

  it('marks a row changed by a locale option, not just by being switched on', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);
    expand('article');
    fireEvent.click(contentBox() as HTMLElement);

    expect(screen.getByText('Unsaved')).toBeTruthy();
  });

  it('says how much is unsaved in words that name the state', () => {
    render(<MonitoringSection />);
    fireEvent.click(box('article') as HTMLElement);

    expect(screen.getByText('1 content type has unsaved changes')).toBeTruthy();
  });

  it('says when nothing can be monitored', () => {
    state.translatable = [];
    render(<MonitoringSection />);

    expect(screen.getByText(/nothing to monitor/i)).toBeTruthy();
  });

  it('surfaces a failure to load or save', () => {
    state.error = 'Could not save monitoring configuration.';
    render(<MonitoringSection />);

    expect(screen.getByText('Could not save monitoring configuration.')).toBeTruthy();
  });
});
