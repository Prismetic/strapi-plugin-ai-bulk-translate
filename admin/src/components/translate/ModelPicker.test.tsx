// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '../../testing/render';
import { ModelPicker, preselectedModelId, selectableModels } from './ModelPicker';

import type { RegisteredModel } from '../../hooks/useModels';

const model = (over: Partial<RegisteredModel>): RegisteredModel => ({
  id: 1,
  providerId: 1,
  modelId: 'gpt-5.4-mini',
  label: 'Fast',
  enabled: true,
  isDefault: false,
  providerLabel: 'OpenAI',
  providerType: 'openai',
  providerEnabled: true,
  ...over,
});

describe('selectableModels', () => {
  it('drops disabled models', () => {
    const models = [model({ id: 1 }), model({ id: 2, enabled: false })];

    expect(selectableModels(models).map((m) => m.id)).toEqual([1]);
  });

  it('drops models whose connection is disabled, which the server also refuses to resolve', () => {
    const models = [model({ id: 1 }), model({ id: 2, providerEnabled: false })];

    expect(selectableModels(models).map((m) => m.id)).toEqual([1]);
  });
});

describe('preselectedModelId', () => {
  it('picks the default', () => {
    expect(preselectedModelId([model({ id: 1 }), model({ id: 2, isDefault: true })])).toBe(2);
  });

  it('picks nothing when the default is disabled, rather than silently choosing another', () => {
    // Falling through to another model would run on something the operator never chose, at a cost
    // they did not expect. The server resolves its own default instead.
    expect(preselectedModelId([model({ id: 1 }), model({ id: 2, isDefault: true, enabled: false })]))
      .toBeNull();
  });

  it('picks nothing when there is no default at all', () => {
    expect(preselectedModelId([model({ id: 1 })])).toBeNull();
  });
});

describe('ModelPicker', () => {
  it('lists only usable models, and never a disabled one', () => {
    render(
      <ModelPicker
        models={[
          model({ id: 1, label: 'Fast' }),
          model({ id: 2, label: 'Retired', enabled: false }),
          model({ id: 3, label: 'Orphaned', providerEnabled: false }),
        ]}
        value={1}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Fast')).toBeTruthy();
    expect(screen.queryByText('Retired')).toBeNull();
    expect(screen.queryByText('Orphaned')).toBeNull();
  });

  it('marks which option is the default', () => {
    render(
      <ModelPicker
        models={[model({ id: 1, label: 'Fast', isDefault: true })]}
        value={1}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Fast (default)')).toBeTruthy();
  });

  it('says so when nothing is usable, instead of rendering an empty select', () => {
    render(
      <ModelPicker models={[model({ id: 1, enabled: false })]} value={null} onChange={vi.fn()} />
    );

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText(/No model is available/)).toBeTruthy();
  });
});
