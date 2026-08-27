// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { render, screen } from '../../testing/render';
import { ModelCard } from './ModelCard';

import type { RegisteredModel } from '../../hooks/useModels';

const model: RegisteredModel = {
  id: 1,
  providerId: 1,
  modelId: 'gpt-5.4-mini',
  label: 'Fast',
  enabled: true,
  isDefault: true,
  providerLabel: 'OpenAI',
  providerType: 'openai',
  providerEnabled: true,
};

const noop = () => {};

const renderCard = (canManage: boolean, over: Partial<RegisteredModel> = {}) =>
  render(
    <ModelCard
      model={{ ...model, ...over }}
      canManage={canManage}
      onEdit={noop}
      onToggleEnabled={noop}
      onMakeDefault={noop}
      onDelete={noop}
    />
  );

describe('ModelCard', () => {
  it('offers every write control to someone who may manage settings', () => {
    renderCard(true);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make default' })).toBeTruthy();
  });

  it('withholds every write control from a read-only viewer', () => {
    renderCard(false);

    // Asserted as "no buttons at all" rather than name by name, so a control added later is caught
    // by this test instead of quietly shipping ungated.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('still shows a read-only viewer what is configured', () => {
    renderCard(false);

    expect(screen.getByText('Fast')).toBeTruthy();
    expect(screen.getByText('gpt-5.4-mini')).toBeTruthy();
    expect(screen.getByText('Default')).toBeTruthy();
  });
});

/**
 * The default is what a run falls back to when the editor makes no explicit choice. Losing it
 * leaves every such run failing with "No usable model is configured", so the controls that would
 * remove it are withheld while an alternative exists to promote instead.
 */
describe('ModelCard — protecting the default', () => {
  const enabled = (name: string) => screen.getByRole('button', { name }).hasAttribute('disabled');

  it('withholds Disable and Delete from the default when another model exists', () => {
    renderCard(true, { isDefault: true });

    expect(enabled('Disable')).toBe(true);
    expect(enabled('Delete')).toBe(true);
  });

  it('says why, rather than leaving two dead buttons unexplained', () => {
    renderCard(true, { isDefault: true });

    expect(screen.getByText(/Make another model the default/)).toBeTruthy();
  });

  it('still allows Edit on the default — renaming it loses nothing', () => {
    renderCard(true, { isDefault: true });

    expect(enabled('Edit')).toBe(false);
  });

  it('protects the default unconditionally, the sole model included', () => {
    // Not a dead end even then: the hint says to register another model and mark it default, which
    // is followable, and deleting the connection still cascades to its models.
    renderCard(true, { isDefault: true });

    expect(enabled('Delete')).toBe(true);
    expect(enabled('Disable')).toBe(true);
  });

  it('leaves a non-default model freely removable', () => {
    renderCard(true, { isDefault: false });

    expect(enabled('Delete')).toBe(false);
    expect(enabled('Disable')).toBe(false);
  });
});
