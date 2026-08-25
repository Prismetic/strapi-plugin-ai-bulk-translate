import { Box, Flex, Main, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { getTranslation } from '../utils/getTranslation';

/**
 * Settings landing page. Provider connections, models and translation settings are
 * added here in later slices; for now it exists so the plugin has a reachable page and
 * the admin bundle is exercised by the build.
 */
const HomePage = () => {
  const { formatMessage } = useIntl();

  return (
    <Main>
      <Box paddingLeft={10} paddingRight={10} paddingTop={8} paddingBottom={8}>
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
      </Box>
    </Main>
  );
};

export { HomePage };
