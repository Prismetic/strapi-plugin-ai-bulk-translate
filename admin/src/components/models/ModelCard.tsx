import { Badge, Box, Button, Flex, Typography } from '@strapi/design-system';
import { Pencil, Star, Trash } from '@strapi/icons';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import type { RegisteredModel } from '../../hooks/useModels';

interface ModelCardProps {
  model: RegisteredModel;
  onEdit: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onMakeDefault: () => void;
  onDelete: () => void;
}

const ModelCard = ({ model, onEdit, onToggleEnabled, onMakeDefault, onDelete }: ModelCardProps) => {
  const { formatMessage } = useIntl();

  return (
    <Box
      padding={4}
      background="neutral0"
      hasRadius
      shadow="tableShadow"
      borderColor="neutral200"
      borderWidth="1px"
      borderStyle="solid"
    >
      <Flex direction="column" alignItems="stretch" gap={3}>
        <Flex justifyContent="space-between" alignItems="center" gap={2}>
          <Flex gap={2} alignItems="center">
            <Typography variant="delta" fontWeight="bold">
              {model.label}
            </Typography>
            {model.isDefault ? (
              <Badge textColor="primary600">
                {formatMessage({
                  id: getTranslation('models.default'),
                  defaultMessage: 'Default',
                })}
              </Badge>
            ) : null}
            <Badge textColor={model.enabled ? 'success600' : 'neutral600'}>
              {model.enabled
                ? formatMessage({
                    id: getTranslation('providers.enabled'),
                    defaultMessage: 'Enabled',
                  })
                : formatMessage({
                    id: getTranslation('providers.disabled'),
                    defaultMessage: 'Disabled',
                  })}
            </Badge>
          </Flex>
          <Flex gap={1}>
            <Button variant="tertiary" size="S" startIcon={<Pencil />} onClick={onEdit}>
              {formatMessage({ id: getTranslation('action.edit'), defaultMessage: 'Edit' })}
            </Button>
            <Button
              variant="tertiary"
              size="S"
              startIcon={<Star />}
              disabled={model.isDefault || !model.enabled || !model.providerEnabled}
              onClick={onMakeDefault}
            >
              {formatMessage({
                id: getTranslation('models.makeDefault'),
                defaultMessage: 'Make default',
              })}
            </Button>
            <Button
              variant="tertiary"
              size="S"
              onClick={() => onToggleEnabled(!model.enabled)}
              disabled={!model.enabled && !model.providerEnabled}
            >
              {model.enabled
                ? formatMessage({ id: getTranslation('action.disable'), defaultMessage: 'Disable' })
                : formatMessage({ id: getTranslation('action.enable'), defaultMessage: 'Enable' })}
            </Button>
            <Button variant="danger-light" size="S" startIcon={<Trash />} onClick={onDelete}>
              {formatMessage({ id: getTranslation('action.delete'), defaultMessage: 'Delete' })}
            </Button>
          </Flex>
        </Flex>

        <Flex gap={4} alignItems="center">
          <Typography variant="pi" textColor="neutral600">
            <code>{model.modelId}</code>
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            {formatMessage(
              {
                id: getTranslation('models.via'),
                defaultMessage: 'via {provider}',
              },
              { provider: model.providerLabel }
            )}
          </Typography>
        </Flex>

        {!model.providerEnabled ? (
          <Typography variant="pi" textColor="danger600">
            {formatMessage({
              id: getTranslation('models.providerDisabled'),
              defaultMessage:
                'Its connection is disabled, so this model cannot be used. Enable the connection first.',
            })}
          </Typography>
        ) : null}
      </Flex>
    </Box>
  );
};

export { ModelCard };
