import {
  Button,
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
import type { Provider, ProviderDefinition, ProviderPayload } from '../../hooks/useProviders';

interface ProviderFormModalProps {
  catalog: ProviderDefinition[];
  /** Absent when adding. */
  provider?: Provider;
  onClose: () => void;
  onSubmit: (payload: ProviderPayload) => Promise<void>;
}

const ProviderFormModal = ({ catalog, provider, onClose, onSubmit }: ProviderFormModalProps) => {
  const { formatMessage } = useIntl();
  const isEditing = Boolean(provider);

  const [type, setType] = useState(provider?.type ?? catalog[0]?.type ?? 'openai');
  const [label, setLabel] = useState(provider?.label ?? '');
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const definition = catalog.find((entry) => entry.type === type);

  const handleSubmit = async () => {
    setError(null);
    setIsSaving(true);

    try {
      const payload: ProviderPayload = { type, label, baseUrl: baseUrl || null };

      // On edit, an untouched key field means "keep the stored key" — so only send it when set.
      if (apiKey || !isEditing) {
        payload.apiKey = apiKey || null;
      }

      await onSubmit(payload);
      onClose();
    } catch (submitError) {
      const response = (submitError as { response?: { data?: { error?: { message?: string } } } })
        ?.response;
      setError(response?.data?.error?.message ?? 'Could not save this connection.');
      setIsSaving(false);
    }
  };

  return (
    <Modal.Root open onOpenChange={onClose}>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage({
              id: getTranslation(isEditing ? 'providers.edit.title' : 'providers.add.title'),
              defaultMessage: isEditing ? 'Edit connection' : 'Add provider connection',
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

            <Field.Root required>
              <Field.Label>
                {formatMessage({
                  id: getTranslation('providers.field.type'),
                  defaultMessage: 'Provider',
                })}
              </Field.Label>
              <SingleSelect value={type} onChange={(value: string) => setType(value)}>
                {catalog.map((entry) => (
                  <SingleSelectOption key={entry.type} value={entry.type}>
                    {entry.label}
                  </SingleSelectOption>
                ))}
              </SingleSelect>
            </Field.Root>

            <Field.Root required>
              <Field.Label>
                {formatMessage({
                  id: getTranslation('providers.field.label'),
                  defaultMessage: 'Name',
                })}
              </Field.Label>
              <TextInput
                value={label}
                placeholder="Azure production"
                onChange={(e: { target: { value: string } }) => setLabel(e.target.value)}
              />
              <Field.Hint />
            </Field.Root>

            <Field.Root required={definition?.baseUrl.required} hint={definition?.baseUrl.hint}>
              <Field.Label>
                {formatMessage({
                  id: getTranslation('providers.field.baseUrl'),
                  defaultMessage: 'Base URL',
                })}
              </Field.Label>
              <TextInput
                value={baseUrl}
                onChange={(e: { target: { value: string } }) => setBaseUrl(e.target.value)}
              />
              <Field.Hint />
            </Field.Root>

            <Field.Root
              required={definition?.requiresApiKey && !isEditing}
              hint={
                isEditing
                  ? formatMessage({
                      id: getTranslation('providers.field.apiKey.hintEdit'),
                      defaultMessage: 'Leave empty to keep the stored key.',
                    })
                  : formatMessage({
                      id: getTranslation('providers.field.apiKey.hint'),
                      defaultMessage: 'Encrypted before it is stored, and never shown again.',
                    })
              }
            >
              <Field.Label>
                {formatMessage({
                  id: getTranslation('providers.field.apiKey'),
                  defaultMessage: 'API key',
                })}
              </Field.Label>
              <TextInput
                type="password"
                value={apiKey}
                placeholder={provider?.maskedApiKey ?? ''}
                onChange={(e: { target: { value: string } }) => setApiKey(e.target.value)}
              />
              <Field.Hint />
            </Field.Root>
          </Flex>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Close>
            <Button variant="tertiary">
              {formatMessage({ id: getTranslation('action.cancel'), defaultMessage: 'Cancel' })}
            </Button>
          </Modal.Close>
          <Button onClick={handleSubmit} loading={isSaving} disabled={!label}>
            {formatMessage({ id: getTranslation('action.save'), defaultMessage: 'Save' })}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
};

export { ProviderFormModal };
