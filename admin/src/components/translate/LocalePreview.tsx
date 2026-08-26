import { Badge, Box, Flex, Loader, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import type { DocumentLocaleStatus, LocaleState } from '../../hooks/useLocaleStatus';

/**
 * Shows what the run will do, per entry and per locale, before anything is spent.
 *
 * Three states, and the wording matters more than the colour: an editor scanning this needs to see
 * at a glance which entries are safe to create and which already hold something. Colour alone would
 * fail anyone who cannot distinguish the two.
 */
const STATE_STYLE: Record<LocaleState, { textColor: string; backgroundColor: string }> = {
  empty: { textColor: 'success600', backgroundColor: 'success100' },
  'has-content': { textColor: 'warning600', backgroundColor: 'warning100' },
  'no-source': { textColor: 'neutral600', backgroundColor: 'neutral150' },
};

interface LocalePreviewProps {
  rows: DocumentLocaleStatus[];
  targetLocales: string[];
  isLoading: boolean;
  error: string | null;
}

const LocalePreview = ({ rows, targetLocales, isLoading, error }: LocalePreviewProps) => {
  const { formatMessage } = useIntl();

  const label = (state: LocaleState, locale: string) => {
    if (state === 'empty') {
      return formatMessage(
        { id: getTranslation('preview.state.empty'), defaultMessage: '{locale} · new' },
        { locale }
      );
    }

    if (state === 'has-content') {
      return formatMessage(
        {
          id: getTranslation('preview.state.hasContent'),
          defaultMessage: '{locale} · has content',
        },
        { locale }
      );
    }

    return formatMessage(
      { id: getTranslation('preview.state.noSource'), defaultMessage: '{locale} · no source' },
      { locale }
    );
  };

  if (isLoading) {
    return (
      <Flex gap={2} paddingTop={2} paddingBottom={2}>
        <Loader small>
          {formatMessage({ id: getTranslation('preview.loading'), defaultMessage: 'Checking…' })}
        </Loader>
      </Flex>
    );
  }

  if (error) {
    return (
      <Typography variant="pi" textColor="danger600">
        {error}
      </Typography>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      {rows.map((row) => (
        <Box
          key={row.documentId}
          padding={3}
          hasRadius
          background={row.excluded ? 'neutral100' : 'neutral0'}
          borderColor="neutral200"
          borderWidth="1px"
          borderStyle="solid"
        >
          <Flex justifyContent="space-between" alignItems="center" gap={3}>
            <Typography
              variant="omega"
              textColor={row.excluded ? 'neutral600' : 'neutral800'}
              ellipsis
            >
              {row.title}
            </Typography>
            <Flex gap={1} wrap="wrap">
              {targetLocales.map((locale) => {
                const state = row.locales[locale] ?? 'no-source';

                return (
                  <Badge key={locale} {...STATE_STYLE[state]}>
                    {label(state, locale)}
                  </Badge>
                );
              })}
            </Flex>
          </Flex>
        </Box>
      ))}
    </Flex>
  );
};

export { LocalePreview };
