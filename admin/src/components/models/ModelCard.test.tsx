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

const renderCard = (canManage: boolean) =>
  render(
    <ModelCard
      model={model}
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
