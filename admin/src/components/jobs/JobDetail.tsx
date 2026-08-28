import { Badge, Box, Button, Flex, Loader, Typography } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { useJobDetail } from '../../hooks/useJobDetail';
import { getTranslation } from '../../utils/getTranslation';
import { groupProgressByDocument } from '../../utils/outcome';

import type { JobItem } from '../../hooks/useTranslationJob';

const ITEM_VARIANT: Record<JobItem['status'], 'success' | 'danger' | 'warning' | 'neutral'> = {
  translated: 'success',
  failed: 'danger',
  skipped: 'warning',
  pending: 'neutral',
};

/**
 * One run, opened.
 *
 * Grouped by entry rather than listed flat, and grouped by the same helper the live progress view
 * uses — a run should read the same way in history as it did while it was running. An editor who
 * watched it happen should recognise what they are looking at.
 */
const JobDetail = ({ id, onRetried }: { id: number; onRetried: () => void }) => {
  const { formatMessage } = useIntl();
  const { job, isLoading, error, isRetrying, retry } = useJobDetail(id);

  if (isLoading && !job) {
    return (
      <Box padding={4}>
        <Loader small>
          {formatMessage({ id: getTranslation('jobs.detail.loading'), defaultMessage: 'Loading…' })}
        </Loader>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={4}>
        <Typography textColor="danger600">{error}</Typography>
      </Box>
    );
  }

  if (!job) {
    return null;
  }

  const titles = Object.fromEntries(
    (job.documents ?? []).map((document) => [document.documentId, document.title])
  );

  const groups = groupProgressByDocument(job.items ?? [], titles);

  return (
    <Box padding={4} background="neutral100">
      <Flex direction="column" alignItems="stretch" gap={3}>
        {groups.map((group) => (
          <Box key={group.documentId} padding={3} background="neutral0" hasRadius>
            <Flex direction="column" alignItems="stretch" gap={2}>
              <Typography fontWeight="bold">{group.title}</Typography>

              {group.items.map((item) => (
                <Flex key={item.locale} gap={3} alignItems="baseline" wrap="wrap">
                  <Badge variant={ITEM_VARIANT[item.status]}>{item.locale}</Badge>

                  <Typography variant="pi" textColor="neutral600">
                    {item.status}
                  </Typography>

                  {/* The reason matters more than the status: "skipped" alone sends someone
                      looking for a fault that may not exist. */}
                  {item.skippedReason ? (
                    <Typography variant="pi" textColor="neutral600">
                      {item.skippedReason}
                    </Typography>
                  ) : null}

                  {item.error ? (
                    <Typography variant="pi" textColor="danger600">
                      {item.error}
                    </Typography>
                  ) : null}

                  {item.targetPath ? (
                    <Typography variant="pi" textColor="neutral500">
                      {item.targetPath}
                    </Typography>
                  ) : null}
                </Flex>
              ))}
            </Flex>
          </Box>
        ))}

        {/* Offered only when there is something to retry. The server refuses the rest, but an
            enabled button that always fails is worse than no button. There is deliberately no
            Cancel: a run in progress cannot be stopped, and a control implying otherwise was the
            defect #15 fixed by renaming Cancel to Close. */}
        {job.progress.failed > 0 ? (
          <Flex justifyContent="flex-end">
            <Button
              variant="secondary"
              loading={isRetrying}
              onClick={async () => {
                if (await retry()) {
                  onRetried();
                }
              }}
            >
              {formatMessage(
                {
                  id: getTranslation('jobs.detail.retry'),
                  defaultMessage:
                    'Retry {count, plural, one {# failed item} other {# failed items}}',
                },
                { count: job.progress.failed }
              )}
            </Button>
          </Flex>
        ) : null}
      </Flex>
    </Box>
  );
};

export { JobDetail };
