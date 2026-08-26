import {
  Button,
  Checkbox,
  Field,
  Flex,
  Modal,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import type { ModelPayload, RegisteredModel } from '../../hooks/useModels';
import type { Provider } from '../../hooks/useProviders';

interface ModelFormModalProps {
  /** Only connections a model could actually be called through. */
  connections: Provider[];
  /** Absent when registering a new model. */
  model?: RegisteredModel;
  onClose: () => void;
  onSubmit: (payload: ModelPayload) => Promise<void>;
}

const ModelFormModal = ({ connections, model, onClose, onSubmit }: ModelFormModalProps) => {
  const { formatMessage } = useIntl();
  const isEditing = Boolean(model);

  const [providerId, setProviderId] = useState(model?.providerId ?? connections[0]?.id ?? 0);
  const [modelId, setModelId] = useState(model?.modelId ?? '');
  const [label, setLabel] = useState(model?.label ?? '');
  const [isDefault, setIsDefault] = useState(model?.isDefault ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setIsSaving(true);

    try {
      await onSubmit({ providerId, modelId, label, isDefault });
      onClose();
    } catch (submitError) {
      const response = (submitError as { response?: { data?: { error?: { message?: string } } } })
        ?.response;
      setError(response?.data?.error?.message ?? 'Could not save this model.');
      setIsSaving(false);
    }
  };

  return (
    <Modal.Root open onOpenChange={onClose}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage({
              id: getTranslation(isEditing ? 'models.edit.title' : 'models.add.title'),
              defaultMessage: isEditing ? 'Edit model' : 'Register a model',
            })}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Flex direction="column" alignItems="stretch" gap={4}>
            {error ? (
              <Typography variant="pi" textColor="danger600">
                {error}
              </Typography>
            ) : null}

            <Field.Root
              required
              hint={formatMessage({
                id: getTranslation('models.field.connection.hint'),
                defaultMessage:
                  'Only enabled connections that can authenticate are listed. Move a model by deleting it and registering it again.',
              })}
            >
              <Field.Label>
                {formatMessage({
                  id: getTranslation('models.field.connection'),
                  defaultMessage: 'Connection',
                })}
              </Field.Label>
              <SingleSelect
                value={String(providerId)}
                disabled={isEditing}
                onChange={(value: string) => setProviderId(Number(value))}
              >
                {connections.map((connection) => (
                  <SingleSelectOption key={connection.id} value={String(connection.id)}>
                    {connection.label}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
              <Field.Hint />
            </Field.Root>

            <Field.Root
              required
              hint={formatMessage({
                id: getTranslation('models.field.modelId.hint'),
                defaultMessage:
                  'Exactly as the provider names it. For Azure this is the deployment name, not the model name.',
              })}
            >
              <Field.Label>
                {formatMessage({
                  id: getTranslation('models.field.modelId'),
                  defaultMessage: 'Model identifier',
                })}
              </Field.Label>
              <TextInput
                value={modelId}
                placeholder="gpt-5.4-mini"
                onChange={(e: { target: { value: string } }) => setModelId(e.target.value)}
              />
              <Field.Hint />
            </Field.Root>

            <Field.Root
              required
              hint={formatMessage({
                id: getTranslation('models.field.label.hint'),
                defaultMessage: 'What editors see when choosing a model.',
              })}
            >
              <Field.Label>
                {formatMessage({
                  id: getTranslation('models.field.label'),
                  defaultMessage: 'Name',
                })}
              </Field.Label>
              <TextInput
                value={label}
                placeholder="Fast and cheap"
                onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
              />
              <Field.Hint />
            </Field.Root>

            <Checkbox
              checked={isDefault}
              onCheckedChange={(checked: boolean) => setIsDefault(Boolean(checked))}
            >
              {formatMessage({
                id: getTranslation('models.field.isDefault'),
                defaultMessage: 'Use as the default model',
              })}
            </Checkbox>
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Close>
            <Button variant="tertiary">
              {formatMessage({ id: getTranslation('action.cancel'), defaultMessage: 'Cancel' })}
            </Button>
          </Modal.Close>
          <Button
            onClick={handleSubmit}
            loading={isSaving}
            disabled={!label || !modelId || !providerId}
          >
            {formatMessage({ id: getTranslation('action.save'), defaultMessage: 'Save' })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export { ModelFormModal };
