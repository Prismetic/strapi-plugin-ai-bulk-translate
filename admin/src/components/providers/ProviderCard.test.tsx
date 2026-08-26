// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { render, screen } from '../../testing/render';
import { ProviderCard } from './ProviderCard';

import type { Provider } from '../../hooks/useProviders';

const provider: Provider = {
  id: 1,
  type: 'openai',
  label: 'OpenAI production',
  baseUrl: null,
  config: null,
  enabled: true,
  hasApiKey: true,
  maskedApiKey: '••••1234',
};

const noop = () => {};
const neverTests = async () => ({ ok: true, message: 'unused' });

const renderCard = (canManage: boolean) =>
  render(
    <ProviderCard
      provider={provider}
      canManage={canManage}
      onEdit={noop}
      onDelete={noop}
      onToggleEnabled={noop}
      onTest={neverTests}
    />
  );

describe('ProviderCard', () => {
  it('offers every write control to someone who may manage settings', () => {
    renderCard(true);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeTruthy();
  });

  it('withholds every write control from a read-only viewer', () => {
    renderCard(false);

    // Asserted as "no buttons at all" rather than name by name, so a control added later is caught
    // by this test instead of quietly shipping ungated.
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('withholds Test connection, which spends provider credit and is gated server-side too', () => {
    renderCard(false);

    expect(screen.queryByRole('button', { name: 'Test connection' })).toBeNull();
    expect(screen.queryByLabelText('Model to test with')).toBeNull();
  });

  it('still shows a read-only viewer what is configured, including that a key is set', () => {
    renderCard(false);

    expect(screen.getByText('OpenAI production')).toBeTruthy();
    expect(screen.getByText('Key ••••1234')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
  });
});
