import { Box, Flex, Tabs, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';

import { PLUGIN_ID } from '../pluginId';
import { getTranslation } from '../utils/getTranslation';

const BASE = `/plugins/${PLUGIN_ID}`;

/** Which tab a path belongs to. Exported so the mapping is testable without rendering a router. */
export const tabForPath = (pathname: string): 'settings' | 'jobs' =>
  pathname.replace(/\/+$/, '').endsWith('/jobs') ? 'jobs' : 'settings';

/**
 * The plugin's title and its two tabs.
 *
 * Configuration and operations are different tasks with different audiences: an editor checking
 * whether their translation finished should not have to scroll past provider credentials to find
 * out. They share a menu entry because they are one plugin, and nothing more.
 *
 * The tabs navigate rather than swap panels, so each is a real URL that can be linked and reloaded.
 */
const PluginHeader = () => {
  const { formatMessage } = useIntl();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const current = tabForPath(pathname);

  return (
    <Box paddingLeft={10} paddingRight={10} paddingTop={8} background="neutral100">
      <Flex direction="column" alignItems="flex-start" gap={2}>
        <Typography variant="alpha" tag="h1" fontWeight="bold">
          {formatMessage({
            id: getTranslation('plugin.page.title'),
            defaultMessage: 'AI Bulk Translate',
          })}
        </Typography>
        <Typography variant="epsilon" textColor="neutral600">
          {formatMessage({
            id: getTranslation('plugin.page.subtitle'),
            defaultMessage:
              'Configure providers, models and translation settings for bulk AI translation.',
          })}
        </Typography>
      </Flex>

      <Box paddingTop={4}>
        <Tabs.Root
          value={current}
          onValueChange={(value: string) => navigate(value === 'jobs' ? `${BASE}/jobs` : BASE)}
        >
          <Tabs.List
            aria-label={formatMessage({
              id: getTranslation('plugin.tabs.label'),
              defaultMessage: 'Plugin sections',
            })}
          >
            <Tabs.Trigger value="settings">
              {formatMessage({
                id: getTranslation('plugin.tabs.settings'),
                defaultMessage: 'Settings',
              })}
            </Tabs.Trigger>
            <Tabs.Trigger value="jobs">
              {formatMessage({ id: getTranslation('plugin.tabs.jobs'), defaultMessage: 'Jobs' })}
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </Box>
    </Box>
  );
};

export { PluginHeader };
