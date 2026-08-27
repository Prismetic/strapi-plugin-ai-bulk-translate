import { Field, SingleSelect, SingleSelectOption, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import type { RegisteredModel } from '../../hooks/useModels';

interface ModelPickerProps {
  models: RegisteredModel[];
  /** `null` means "no explicit choice" — the server then resolves the default itself. */
  value: number | null;
  onChange: (modelId: number | null) => void;
}

/**
 * Which model a run should use.
 *
 * The point of the choice is cost: a cheap model for a bulk backfill, a stronger one for pages that
 * matter. The chosen id travels on the job, so the record says which model produced the text.
 */
export const selectableModels = (models: RegisteredModel[]): RegisteredModel[] =>
  // Both flags, not just `enabled`: a model under a disabled connection cannot be called, and the
  // server's `resolve` returns null for it. Offering it would produce a run that fails at the
  // first request for a reason the editor could not have seen.
  models.filter((model) => model.enabled && model.providerEnabled);

/** The id to start on: the default when it is usable, otherwise nothing preselected. */
export const preselectedModelId = (models: RegisteredModel[]): number | null =>
  selectableModels(models).find((model) => model.isDefault)?.id ?? null;

const ModelPicker = ({ models, value, onChange }: ModelPickerProps) => {
  const { formatMessage } = useIntl();
  const usable = selectableModels(models);

  if (usable.length === 0) {
    return (
      <Typography variant="pi" textColor="warning600">
        {formatMessage({
          id: getTranslation('translate.model.none'),
          defaultMessage:
            'No model is available. An administrator needs to register one under an enabled connection.',
        })}
      </Typography>
    );
  }

  return (
    <Field.Root
      hint={formatMessage({
        id: getTranslation('translate.model.hint'),
        defaultMessage: 'Recorded on the run, so the job history shows which model produced it.',
      })}
    >
      <Field.Label>
        {formatMessage({ id: getTranslation('translate.model'), defaultMessage: 'Model' })}
      </Field.Label>
      <SingleSelect
        value={value === null ? undefined : String(value)}
        onChange={(next: string | number) => onChange(next === '' ? null : Number(next))}
      >
        {usable.map((model) => (
          <SingleSelectOption key={model.id} value={String(model.id)}>
            {model.isDefault
              ? formatMessage(
                  {
                    id: getTranslation('translate.model.defaultOption'),
                    defaultMessage: '{label} (default)',
                  },
                  { label: model.label }
                )
              : model.label}
          </SingleSelectOption>
        ))}
      </SingleSelect>
      <Field.Hint />
    </Field.Root>
  );
};

export { ModelPicker };
