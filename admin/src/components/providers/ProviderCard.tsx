import { Badge, Box, Button, Flex, TextInput, Typography } from '@strapi/design-system';
import { Check, Cross, Pencil, Trash } from '@strapi/icons';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import type { Provider, ProviderDefinition } from '../../hooks/useProviders';

interface ProviderCardProps {
  provider: Provider;
  definition?: ProviderDefinition;
  /**
   * Whether the viewer holds `settings.update`. Without it the card is read-only: the endpoint and
   * key state stay visible, because `settings.read` is what put the viewer on this page, but every
   * control the server would refuse is withheld. Test Connection counts as a write — it spends
   * provider credit and is gated behind `settings.update` server-side.
   */
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onTest: (modelId: string) => Promise<{ ok: boolean; message: string }>;
}

const ProviderCard = ({
  provider,
  definition,
  canManage,
  onEdit,
  onDelete,
  onToggleEnabled,
  onTest,
}: ProviderCardProps) => {
  const { formatMessage } = useIntl();
  const [modelId, setModelId] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const runTest = async () => {
    setTesting(true);
    setResult(null);
    setResult(await onTest(modelId));
    setTesting(false);
  };

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
              {provider.label}
            </Typography>
            <Badge>{definition?.label ?? provider.type}</Badge>
            <Badge textColor={provider.enabled ? 'success600' : 'neutral600'}>
              {provider.enabled
                ? formatMessage({ id: getTranslation('providers.enabled'), defaultMessage: 'Enabled' })
                : formatMessage({
                    id: getTranslation('providers.disabled'),
                    defaultMessage: 'Disabled',
                  })}
            </Badge>
          </Flex>
          {canManage ? (
            <Flex gap={1}>
              <Button variant="tertiary" size="S" startIcon={<Pencil />} onClick={onEdit}>
                {formatMessage({ id: getTranslation('action.edit'), defaultMessage: 'Edit' })}
              </Button>
              <Button
                variant="tertiary"
                size="S"
                onClick={() => onToggleEnabled(!provider.enabled)}
              >
                {provider.enabled
                  ? formatMessage({ id: getTranslation('action.disable'), defaultMessage: 'Disable' })
                  : formatMessage({ id: getTranslation('action.enable'), defaultMessage: 'Enable' })}
              </Button>
              <Button variant="danger-light" size="S" startIcon={<Trash />} onClick={onDelete}>
                {formatMessage({ id: getTranslation('action.delete'), defaultMessage: 'Delete' })}
              </Button>
            </Flex>
          ) : null}
        </Flex>

        <Flex gap={4} alignItems="center">
          <Typography variant="pi" textColor="neutral600">
            {provider.baseUrl ??
              formatMessage({
                id: getTranslation('providers.defaultEndpoint'),
                defaultMessage: 'Default endpoint',
              })}
          </Typography>
          <Typography variant="pi" textColor="neutral600">
            {provider.hasApiKey
              ? `Key ${provider.maskedApiKey}`
              : formatMessage({ id: getTranslation('providers.noKey'), defaultMessage: 'No key set' })}
          </Typography>
        </Flex>

        {canManage ? (
          <Flex gap={2} alignItems="flex-end">
            <Box flex="1">
              <TextInput
                size="S"
                aria-label={formatMessage({
                  id: getTranslation('providers.testModel'),
                  defaultMessage: 'Model to test with',
                })}
                placeholder={formatMessage({
                  id: getTranslation('providers.testModel.placeholder'),
                  defaultMessage: 'Model to test with, e.g. gpt-5.4-mini',
                })}
                value={modelId}
                onChange={(e: { target: { value: string } }) => setModelId(e.target.value)}
              />
            </Box>
            <Button
              variant="secondary"
              size="S"
              loading={testing}
              disabled={!modelId}
              onClick={runTest}
            >
              {formatMessage({
                id: getTranslation('providers.test'),
                defaultMessage: 'Test connection',
              })}
            </Button>
          </Flex>
        ) : null}

        {result ? (
          <Flex gap={2} alignItems="flex-start">
            {result.ok ? <Check fill="success600" /> : <Cross fill="danger600" />}
            <Typography variant="pi" textColor={result.ok ? 'success600' : 'danger600'}>
              {result.message}
            </Typography>
          </Flex>
        ) : null}
      </Flex>
    </Box>
  );
};

export { ProviderCard };
