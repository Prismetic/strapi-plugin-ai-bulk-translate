import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Loader,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { useJobs, type JobStatus, type JobSummary } from '../hooks/useJobs';
import { getTranslation } from '../utils/getTranslation';
import { durationBetween, namedEntries } from '../utils/jobEntries';
import { statusesFor } from '../utils/jobFilters';

const STATUS_VARIANT: Record<JobStatus, 'secondary' | 'alternative' | 'success' | 'danger'> = {
  queued: 'secondary',
  processing: 'alternative',
  completed: 'success',
  failed: 'danger',
};

/** `api::article.article` says nothing an editor needs; `article` does. */
const shortType = (uid: string): string => uid.split('.').pop() ?? uid;

const COLUMNS = 9;

/**
 * What a run was about, by name.
 *
 * Titles are frozen at run time, so this still says something useful about an entry that has been
 * renamed or deleted since — which is when history is most worth having.
 */
const EntryNames = ({ job }: { job: JobSummary }) => {
  const { formatMessage } = useIntl();
  const { titles, remaining } = namedEntries(job.documents ?? [], job.documentCount);

  if (titles.length === 0) {
    return (
      <Typography>
        {formatMessage(
          {
            id: getTranslation('jobs.entries.count'),
            defaultMessage: '{count, plural, one {# entry} other {# entries}}',
          },
          { count: remaining }
        )}
      </Typography>
    );
  }

  return (
    <Typography>
      {titles.join(', ')}
      {remaining > 0
        ? formatMessage(
            { id: getTranslation('jobs.entries.more'), defaultMessage: ' +{count} more' },
            { count: remaining }
          )
        : ''}
    </Typography>
  );
};

const JobsPage = () => {
  const { formatMessage } = useIntl();
  const [page, setPage] = useState(1);
  const [completed, setCompleted] = useState(false);
  const { jobs, meta, isLoading, error } = useJobs({ statuses: statusesFor({ completed }), page });

  /**
   * Widening the filter changes what page one contains, so staying on page four would show a
   * different slice of a different list — and possibly nothing at all.
   */
  const setFilter = (next: boolean) => {
    setCompleted(next);
    setPage(1);
  };

  const originLabel = (origin: JobSummary['origin']) => {
    if (origin === 'bulk') {
      return formatMessage({ id: getTranslation('jobs.origin.bulk'), defaultMessage: 'Bulk' });
    }

    if (origin === 'monitor') {
      return formatMessage({
        id: getTranslation('jobs.origin.monitor'),
        defaultMessage: 'Monitoring',
      });
    }

    return formatMessage({ id: getTranslation('jobs.origin.document'), defaultMessage: 'Entry' });
  };

  if (isLoading) {
    return (
      <Box padding={10}>
        <Loader small>
          {formatMessage({ id: getTranslation('jobs.loading'), defaultMessage: 'Loading runs…' })}
        </Loader>
      </Box>
    );
  }

  if (error) {
    return (
      <Box padding={10}>
        <Typography textColor="danger600">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box paddingLeft={10} paddingRight={10} paddingTop={6} paddingBottom={10}>
      <Flex direction="column" alignItems="stretch" gap={4}>
        <Flex justifyContent="space-between" alignItems="center" gap={4}>
          <Typography variant="pi" textColor="neutral600">
            {completed
              ? formatMessage({
                  id: getTranslation('jobs.intro.all'),
                  defaultMessage: 'Runs that are queued, in progress, failed, or completed.',
                })
              : formatMessage({
                  id: getTranslation('jobs.intro'),
                  defaultMessage:
                    'Runs that are queued, in progress, or failed. Completed runs are hidden.',
                })}
          </Typography>

          <Checkbox
            checked={completed}
            onCheckedChange={(next: boolean) => setFilter(Boolean(next))}
          >
            {formatMessage({
              id: getTranslation('jobs.filter.completed'),
              defaultMessage: 'Show completed',
            })}
          </Checkbox>
        </Flex>

        {jobs.length === 0 ? (
          <Box padding={8} background="neutral0" hasRadius>
            <Typography textColor="neutral600">
              {completed
                ? formatMessage({
                    id: getTranslation('jobs.empty.all'),
                    defaultMessage: 'No runs yet. Translations you start will appear here.',
                  })
                : formatMessage({
                    id: getTranslation('jobs.empty'),
                    defaultMessage:
                      'Nothing needs attention. No runs are queued, going, or failed.',
                  })}
            </Typography>
          </Box>
        ) : (
          <Table colCount={COLUMNS} rowCount={jobs.length + 1}>
            <Thead>
              <Tr>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.status'),
                      defaultMessage: 'Status',
                    })}
                  </Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.contentType'),
                      defaultMessage: 'Content type',
                    })}
                  </Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.locales'),
                      defaultMessage: 'Locales',
                    })}
                  </Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.entries'),
                      defaultMessage: 'Entries',
                    })}
                  </Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.progress'),
                      defaultMessage: 'Progress',
                    })}
                  </Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.startedBy'),
                      defaultMessage: 'Started by',
                    })}
                  </Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.origin'),
                      defaultMessage: 'From',
                    })}
                  </Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.started'),
                      defaultMessage: 'Started',
                    })}
                  </Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">
                    {formatMessage({
                      id: getTranslation('jobs.column.took'),
                      defaultMessage: 'Took',
                    })}
                  </Typography>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {jobs.map((job) => (
                <Tr key={job.id}>
                  <Td>
                    <Badge variant={STATUS_VARIANT[job.status]}>{job.status}</Badge>
                  </Td>
                  <Td>
                    <Typography>{shortType(job.contentType)}</Typography>
                  </Td>
                  <Td>
                    <Typography>
                      {job.sourceLocale} → {job.targetLocales.join(', ')}
                    </Typography>
                  </Td>
                  <Td>
                    <EntryNames job={job} />
                  </Td>
                  <Td>
                    <Typography textColor={job.progress.failed > 0 ? 'danger600' : undefined}>
                      {formatMessage(
                        {
                          id: getTranslation('jobs.progress'),
                          defaultMessage:
                            '{done} of {total}{failed, plural, =0 {} other { · # failed}}',
                        },
                        {
                          done: job.progress.done,
                          total: job.progress.total,
                          failed: job.progress.failed,
                        }
                      )}
                    </Typography>
                  </Td>
                  <Td>
                    <Typography textColor={job.createdByName ? undefined : 'neutral500'}>
                      {job.createdByName ??
                        formatMessage({
                          id: getTranslation('jobs.startedBy.unknown'),
                          defaultMessage: 'Unknown',
                        })}
                    </Typography>
                  </Td>
                  <Td>
                    <Typography>{originLabel(job.origin)}</Typography>
                  </Td>
                  <Td>
                    <Typography>{new Date(job.createdAt).toLocaleString()}</Typography>
                  </Td>
                  <Td>
                    <Typography textColor="neutral600">
                      {durationBetween(job.startedAt, job.finishedAt) ?? '—'}
                    </Typography>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}

        {meta && meta.pageCount > 1 ? (
          <Flex justifyContent="space-between" alignItems="center">
            <Button
              variant="tertiary"
              disabled={meta.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {formatMessage({
                id: getTranslation('jobs.page.previous'),
                defaultMessage: 'Previous',
              })}
            </Button>
            <Typography variant="pi" textColor="neutral600">
              {formatMessage(
                {
                  id: getTranslation('jobs.page.of'),
                  defaultMessage: 'Page {page} of {pageCount}',
                },
                { page: meta.page, pageCount: meta.pageCount }
              )}
            </Typography>
            <Button
              variant="tertiary"
              disabled={meta.page >= meta.pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              {formatMessage({ id: getTranslation('jobs.page.next'), defaultMessage: 'Next' })}
            </Button>
          </Flex>
        ) : null}
      </Flex>
    </Box>
  );
};

export { JobsPage };
