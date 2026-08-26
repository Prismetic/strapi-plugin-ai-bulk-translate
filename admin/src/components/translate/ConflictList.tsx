import { Box, Button, Checkbox, Flex, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import type { Conflict } from '../../utils/outcome';

interface ConflictListProps {
  conflicts: Conflict[];
  /** Document ids currently authorised for overwrite. */
  authorised: string[];
  onToggle: (documentId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
}

/**
 * Per-entry opt-in for overwriting translations that already exist.
 *
 * Deliberately not a single global "overwrite existing" switch. A global toggle forces one decision
 * across a mixed selection, which in practice means either clobbering translations a colleague
 * hand-edited or abandoning the run and re-selecting rows. Per-entry opt-in expresses what an editor
 * actually wants: create the twelve empty ones, and also refresh these two specific stale ones.
 *
 * Every box starts unchecked. Overwriting is the destructive option, so it is never the default —
 * and "select all" exists for the deliberate full refresh without making it the path of least
 * resistance.
 */
const ConflictList = ({
  conflicts,
  authorised,
  onToggle,
  onSelectAll,
  onClearAll,
}: ConflictListProps) => {
  const { formatMessage } = useIntl();

  if (conflicts.length === 0) {
    return null;
  }

  const allSelected = conflicts.every((conflict) => authorised.includes(conflict.documentId));

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <Flex justifyContent="space-between" alignItems="center" gap={2}>
        <Typography variant="delta">
          {formatMessage(
            {
              id: getTranslation('conflicts.heading'),
              defaultMessage:
                '{count, plural, one {# entry already has a translation} other {# entries already have translations}}',
            },
            { count: conflicts.length }
          )}
        </Typography>

        <Button variant="tertiary" size="S" onClick={allSelected ? onClearAll : onSelectAll}>
          {allSelected
            ? formatMessage({
                id: getTranslation('conflicts.clearAll'),
                defaultMessage: 'Clear all',
              })
            : formatMessage({
                id: getTranslation('conflicts.selectAll'),
                defaultMessage: 'Select all',
              })}
        </Button>
      </Flex>

      <Typography variant="pi" textColor="neutral600">
        {formatMessage({
          id: getTranslation('conflicts.intro'),
          defaultMessage:
            'These are left alone unless you tick them. Ticking one replaces its existing translation.',
        })}
      </Typography>

      {conflicts.map((conflict) => (
        <Box
          key={conflict.documentId}
          padding={3}
          hasRadius
          background="neutral0"
          borderColor="neutral200"
          borderWidth="1px"
          borderStyle="solid"
        >
          <Checkbox
            checked={authorised.includes(conflict.documentId)}
            onCheckedChange={() => onToggle(conflict.documentId)}
          >
            {/* The label names the entry *and* the locales, because ticking authorises every one
                of them — the job stores authorisation per entry, not per locale. */}
            {formatMessage(
              {
                id: getTranslation('conflicts.label'),
                defaultMessage: 'Overwrite {title} in {locales}',
              },
              { title: conflict.title, locales: conflict.locales.join(', ') }
            )}
          </Checkbox>
        </Box>
      ))}
    </Flex>
  );
};

export { ConflictList };
