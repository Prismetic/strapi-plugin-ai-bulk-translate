import { Alert, Button, Flex, Typography } from '@strapi/design-system';
import { Plus } from '@strapi/icons';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import { useProviders, type Provider } from '../../hooks/useProviders';
import { ProviderCard } from './ProviderCard';
import { ProviderFormModal } from './ProviderFormModal';

const ProvidersSection = () => {
  const { formatMessage } = useIntl();
  const { providers, catalog, encryptionAvailable, isLoading, create, update, remove, test } =
    useProviders();

  const [editing, setEditing] = useState<Provider | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  if (isLoading) {
    return (
      <Typography variant="pi" textColor="neutral600">
        {formatMessage({ id: getTranslation('loading'), defaultMessage: 'Loading…' })}
      </Typography>
    );
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      {!encryptionAvailable ? (
        <Alert
          variant="danger"
          title={formatMessage({
            id: getTranslation('providers.noEncryption.title'),
            defaultMessage: 'API keys cannot be stored',
          })}
        >
          {formatMessage({
            id: getTranslation('providers.noEncryption.body'),
            defaultMessage:
              'This Strapi project has no admin encryption key. Set ENCRYPTION_KEY and expose it through config/admin as secrets.encryptionKey, then restart.',
          })}
        </Alert>
      ) : null}

      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="pi" textColor="neutral600">
          {formatMessage({
            id: getTranslation('providers.intro'),
            defaultMessage:
              'Connections to LLM providers. Keys are encrypted before storage and never shown again.',
          })}
        </Typography>
        <Button
          startIcon={<Plus />}
          size="S"
          disabled={!encryptionAvailable}
          onClick={() => setIsAdding(true)}
        >
          {formatMessage({
            id: getTranslation('providers.add'),
            defaultMessage: 'Add provider',
          })}
        </Button>
      </Flex>

      {providers.length === 0 ? (
        <Typography variant="pi" textColor="neutral600">
          {formatMessage({
            id: getTranslation('providers.empty'),
            defaultMessage: 'No providers configured yet. Add one to get started.',
          })}
        </Typography>
      ) : (
        providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            definition={catalog.find((entry) => entry.type === provider.type)}
            onEdit={() => setEditing(provider)}
            onDelete={() => remove(provider.id)}
            onToggleEnabled={(enabled) => update(provider.id, { enabled })}
            onTest={(modelId) => test(provider.id, modelId)}
          />
        ))
      )}

      {isAdding ? (
        <ProviderFormModal
          catalog={catalog}
          onClose={() => setIsAdding(false)}
          onSubmit={create}
        />
      ) : null}

      {editing ? (
        <ProviderFormModal
          catalog={catalog}
          provider={editing}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => update(editing.id, payload)}
        />
      ) : null}
    </Flex>
  );
};

export { ProvidersSection };
