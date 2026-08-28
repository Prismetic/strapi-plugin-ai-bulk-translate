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
    { code: 'en', name: 'English', isDefault: true },
    { code: 'ar', name: 'Arabic', isDefault: false },
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

const box = (name: string | RegExp) => screen.queryByRole('checkbox', { name });

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

describe('MonitoringSection', () => {
  it('lists localized content types, collection and single', () => {
    render(<MonitoringSection />);

    expect(box('article')).not.toBeNull();
    expect(box('homepage')).not.toBeNull();
  });

  it('starts with every type unmonitored, so nothing is switched on by arriving', () => {
    render(<MonitoringSection />);

    expect(isChecked(box('article') as HTMLElement)).toBe(false);
    expect(screen.queryByText('Translate into')).toBeNull();
  });

  it('offers target locales once a type is monitored', () => {
    state.configs = { 'api::article.article': monitored({ locales: [] }) };
    render(<MonitoringSection />);

    expect(screen.getByText('Translate into')).toBeTruthy();
    expect(box(/Arabic/)).not.toBeNull();
  });

  /** The source of truth is never a target — the same rule the translation dialog enforces. */
  it('never offers the default locale as a target', () => {
    state.configs = { 'api::article.article': monitored({ locales: [] }) };
    render(<MonitoringSection />);

    expect(box(/English/)).toBeNull();
  });

  it('shows the overwrite controls only for a locale that is being translated into', () => {
    state.configs = { 'api::article.article': monitored({ locales: [] }) };
    render(<MonitoringSection />);

    expect(box('Overwrite content')).toBeNull();
  });

  it('offers the overwrite controls for a chosen locale, both off', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);

    expect(isChecked(box('Overwrite content') as HTMLElement)).toBe(false);
    expect(isChecked(box('Overwrite manual edits') as HTMLElement)).toBe(false);
  });

  /** The nesting rule: the stronger act cannot be reached without choosing the weaker one first. */
  it('disables overwriting manual edits until content is overwritten', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);

    expect((box('Overwrite manual edits') as HTMLElement).hasAttribute('disabled')).toBe(true);
  });

  it('enables it once content is overwritten', () => {
    state.configs = {
      'api::article.article': monitored({
        locales: [{ code: 'ar', overwriteContent: true, overwriteManualEdits: false }],
      }),
    };
    render(<MonitoringSection />);

    expect((box('Overwrite manual edits') as HTMLElement).hasAttribute('disabled')).toBe(false);
  });

  it('clears the nested choice when its parent is turned off', () => {
    state.configs = {
      'api::article.article': monitored({
        locales: [{ code: 'ar', overwriteContent: true, overwriteManualEdits: true }],
      }),
    };
    render(<MonitoringSection />);

    fireEvent.click(box('Overwrite content') as HTMLElement);

    expect(isChecked(box('Overwrite manual edits') as HTMLElement)).toBe(false);
    expect((box('Overwrite manual edits') as HTMLElement).hasAttribute('disabled')).toBe(true);
  });

  it('offers no write control at all to a role that cannot manage settings', () => {
    state.canManage = false;
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);

    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect((box('article') as HTMLElement).hasAttribute('disabled')).toBe(true);
    expect((box('Overwrite content') as HTMLElement).hasAttribute('disabled')).toBe(true);
  });

  it('keeps Save disabled until something changes', () => {
    state.configs = { 'api::article.article': monitored() };
    render(<MonitoringSection />);

    const saveButtons = screen.getAllByRole('button', { name: 'Save' });

    expect(saveButtons[0].hasAttribute('disabled')).toBe(true);
  });

  it('says so when nothing can be monitored', () => {
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
