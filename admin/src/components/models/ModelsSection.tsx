import { Alert, Button, Flex, Typography } from '@strapi/design-system';
import { Plus } from '@strapi/icons';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import { useModels, type RegisteredModel } from '../../hooks/useModels';
import { useProviders } from '../../hooks/useProviders';
import { useSettingsPermission } from '../../hooks/useSettingsPermission';
import { ModelCard } from './ModelCard';
import { ModelFormModal } from './ModelFormModal';

const ModelsSection = () => {
  const { formatMessage } = useIntl();
  const { models, isLoading, error, dismissError, create, update, remove, setDefault } =
    useModels();
  const { providers, catalog, refresh: refreshProviders } = useProviders();
  const { canManage } = useSettingsPermission();

  const [editing, setEditing] = useState<RegisteredModel | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Mirrors the server's rule: a model can only be registered under a connection that could
  // actually answer. A keyless local gateway qualifies; a keyless OpenAI connection does not.
  const eligible = providers.filter((provider) => {
    const definition = catalog.find((entry) => entry.type === provider.type);

    return provider.enabled && (provider.hasApiKey || definition?.requiresApiKey === false);
  });

  // The Providers section above can change what is eligible while this page stays mounted, so the
  // list is refetched at the moment the choice is presented rather than trusted from mount time.
  const openAddModal = async () => {
    await refreshProviders().catch(() => undefined);
    setIsAdding(true);
  };

  if (isLoading) {
    return (
      <Typography variant="pi" textColor="neutral600">
        {formatMessage({ id: getTranslation('loading'), defaultMessage: 'Loading…' })}
      </Typography>
    );
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      {error ? (
        <Alert
          variant="danger"
          onClose={dismissError}
          title={formatMessage({
            id: getTranslation('models.error.title'),
            defaultMessage: 'Could not save',
          })}
        >
          {error}
        </Alert>
      ) : null}

      <Flex justifyContent="space-between" alignItems="center">
        <Typography variant="pi" textColor="neutral600">
          {formatMessage({
            id: getTranslation('models.intro'),
            defaultMessage:
              'Models editors can choose from. One can be the default, used when no choice is made.',
          })}
        </Typography>
        {canManage ? (
          <Button
            startIcon={<Plus />}
            size="S"
            disabled={eligible.length === 0}
            onClick={openAddModal}
          >
            {formatMessage({ id: getTranslation('models.add'), defaultMessage: 'Register model' })}
          </Button>
        ) : null}
      </Flex>

      {/* Withheld from read-only viewers: it is advice to go and fix something they have no way of
          fixing. They still get "No models registered yet" below, which is the part that is true
          for them. */}
      {canManage && eligible.length === 0 ? (
        <Typography variant="pi" textColor="neutral600">
          {formatMessage({
            id: getTranslation('models.noConnections'),
            defaultMessage:
              'No connection is ready to have models registered under it. Add an enabled connection with a working key first.',
          })}
        </Typography>
      ) : null}

      {models.length === 0 ? (
        <Typography variant="pi" textColor="neutral600">
          {formatMessage({
            id: getTranslation('models.empty'),
            defaultMessage: 'No models registered yet.',
          })}
        </Typography>
      ) : (
        models.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            canManage={canManage}
            onEdit={() => setEditing(model)}
            onToggleEnabled={(enabled) => update(model.id, { enabled }).catch(() => undefined)}
            onMakeDefault={() => setDefault(model.id).catch(() => undefined)}
            onDelete={() => remove(model.id).catch(() => undefined)}
          />
        ))
      )}

      {isAdding ? (
        <ModelFormModal
          connections={eligible}
          onClose={() => setIsAdding(false)}
          onSubmit={create}
        />
      ) : null}

      {editing ? (
        <ModelFormModal
          connections={eligible}
          model={editing}
          onClose={() => setEditing(null)}
          onSubmit={(payload) => update(editing.id, payload)}
        />
      ) : null}
    </Flex>
  );
};

export { ModelsSection };
