import { Accordion, Box, Flex, Main, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { ModelsSection } from '../components/models/ModelsSection';
import { ProvidersSection } from '../components/providers/ProvidersSection';
import { TranslationSection } from '../components/settings/TranslationSection';
import { getTranslation } from '../utils/getTranslation';

/**
 * Settings page. Sections are accordion items rather than tabs: configuring this is a sequential
 * task — add a provider, register a model under it, tune the prompt — and an accordion lets two
 * sections stay open at once while cross-referencing. The Monitoring section is added by a later
 * slice.
 */
const HomePage = () => {
  const { formatMessage } = useIntl();

  return (
    <Main>
      <Box
        paddingLeft={10}
        paddingRight={10}
        paddingTop={8}
        paddingBottom={6}
        background="neutral100"
      >
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

      <Box paddingLeft={10} paddingRight={10} paddingTop={6} paddingBottom={10}>
        <Accordion.Root defaultValue="providers">
          <Accordion.Item value="providers">
            <Accordion.Header>
              <Accordion.Trigger>
                {formatMessage({
                  id: getTranslation('providers.section'),
                  defaultMessage: 'Providers',
                })}
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>
              <Box padding={5}>
                <ProvidersSection />
              </Box>
            </Accordion.Content>
          </Accordion.Item>

          <Accordion.Item value="models">
            <Accordion.Header>
              <Accordion.Trigger>
                {formatMessage({
                  id: getTranslation('models.section'),
                  defaultMessage: 'Models',
                })}
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>
              <Box padding={5}>
                <ModelsSection />
              </Box>
            </Accordion.Content>
          </Accordion.Item>

          <Accordion.Item value="translation">
            <Accordion.Header>
              <Accordion.Trigger>
                {formatMessage({
                  id: getTranslation('translation.section'),
                  defaultMessage: 'Translation',
                })}
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content>
              <Box padding={5}>
                <TranslationSection />
              </Box>
            </Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      </Box>
    </Main>
  );
};

export { HomePage };
