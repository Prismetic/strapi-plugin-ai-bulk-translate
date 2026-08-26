import {
  Alert,
  Box,
  Button,
  Checkbox,
  Flex,
  Loader,
  Modal,
  Typography,
} from '@strapi/design-system';
import { useQueryParams } from '@strapi/strapi/admin';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { useLocaleStatus } from '../../hooks/useLocaleStatus';
import { useLocales } from '../../hooks/useLocales';
import { useTranslationJob, type JobItem } from '../../hooks/useTranslationJob';
import { getTranslation } from '../../utils/getTranslation';
import { LocalePreview } from './LocalePreview';

interface TranslateModalProps {
  contentType: string;
  documentIds: string[];
  sourceLocale: string;
  /** Which surface opened this. Recorded on the job for audit; grants nothing. */
  origin?: 'document' | 'bulk';
  onClose: () => void;
}

const statusColor = (status: JobItem['status']) => {
  if (status === 'translated') return 'success600';
  if (status === 'failed') return 'danger600';
  if (status === 'skipped') return 'warning600';

  return 'neutral600';
};

/**
 * The dialog every translation run passes through, on every surface.
 *
 * Minimal on purpose in this slice: pick target locales, confirm, watch progress. The per-entry
 * preview, the three badge states and the conflict opt-in arrive in later slices and extend this
 * component rather than replacing it.
 */
const TranslateModal = ({
  contentType,
  documentIds,
  sourceLocale,
  origin = 'document',
  onClose,
}: TranslateModalProps) => {
  const { formatMessage } = useIntl();
  const { locales, isLoading } = useLocales();
  const { job, error, isStarting, isRunning, failedCount, start, retry } = useTranslationJob();
  const [{ query }, setQuery] = useQueryParams<Record<string, unknown>>();

  const [selected, setSelected] = useState<string[]>([]);

  // Nothing is fetched until a target is chosen — the preview has nothing to say before then, and
  // asking the server to read every selected document for no locales is pure waste.
  const preview = useLocaleStatus(contentType, documentIds, sourceLocale, selected);

  const targets = locales.filter((locale) => locale.code !== sourceLocale);

  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code]
    );

  const submit = () => {
    // Entries with nothing in the source locale are dropped here as well as server-side, so the
    // job's item count matches what the preview promised rather than counting work that cannot
    // happen.
    const translatableIds = preview.rows.length
      ? preview.translatable.map((row) => row.documentId)
      : documentIds;

    start({
      contentType,
      documentIds: translatableIds,
      sourceLocale,
      targetLocales: selected,
      origin,
    });
  };

  /**
   * Sends the edit view to a translated locale. This is also what refreshes the Content Manager's
   * view of the document: the plugin cannot invalidate another plugin's query cache — no public API
   * exposes that — but a locale change is a route change, and the Content Manager refetches on it.
   */
  const viewLocale = (code: string) => {
    setQuery({ ...query, plugins: { ...(query.plugins as object), i18n: { locale: code } } });
    onClose();
  };

  if (isLoading) {
    return (
      <Modal.Body>
        <Flex justifyContent="center" padding={6}>
          <Loader small>
            {formatMessage({ id: getTranslation('loading'), defaultMessage: 'Loading…' })}
          </Loader>
        </Flex>
      </Modal.Body>
    );
  }

  const succeeded = job?.items.filter((item) => item.status === 'translated') ?? [];

  return (
    <>
      <Modal.Body>
        <Flex direction="column" alignItems="stretch" gap={4}>
          {error ? (
            <Alert
              variant="danger"
              title={formatMessage({
                id: getTranslation('translate.failed'),
                defaultMessage: 'Translation could not start',
              })}
            >
              {error}
            </Alert>
          ) : null}

          {!job ? (
            <>
              <Typography variant="pi" textColor="neutral600">
                {formatMessage(
                  {
                    id: getTranslation('translate.intro'),
                    defaultMessage:
                      'Translating from {source}. Results are saved as drafts for review — nothing is published.',
                  },
                  { source: sourceLocale }
                )}
              </Typography>

              {targets.length === 0 ? (
                <Typography variant="pi" textColor="warning600">
                  {formatMessage({
                    id: getTranslation('translate.noTargets'),
                    defaultMessage:
                      'This project has no other locale to translate into. Add one in Internationalization settings.',
                  })}
                </Typography>
              ) : (
                <Flex direction="column" alignItems="stretch" gap={2}>
                  <Typography variant="delta">
                    {formatMessage({
                      id: getTranslation('translate.targets'),
                      defaultMessage: 'Translate into',
                    })}
                  </Typography>
                  {targets.map((locale) => (
                    <Checkbox
                      key={locale.code}
                      checked={selected.includes(locale.code)}
                      onCheckedChange={() => toggle(locale.code)}
                    >
                      {`${locale.name} (${locale.code})`}
                    </Checkbox>
                  ))}
                </Flex>
              )}

              {selected.length > 0 ? (
                <Flex direction="column" alignItems="stretch" gap={2}>
                  <Typography variant="delta">
                    {formatMessage({
                      id: getTranslation('preview.heading'),
                      defaultMessage: 'What will happen',
                    })}
                  </Typography>

                  <LocalePreview
                    rows={preview.rows}
                    targetLocales={selected}
                    isLoading={preview.isLoading}
                    error={preview.error}
                  />

                  {!preview.isLoading && preview.rows.length > 0 ? (
                    <Typography variant="pi" textColor="neutral600">
                      {formatMessage(
                        {
                          id: getTranslation('preview.summary'),
                          defaultMessage:
                            '{create, plural, one {# locale} other {# locales}} will be written. {conflicts, plural, =0 {} one {# already has content and will be skipped.} other {# already have content and will be skipped.}}',
                        },
                        { create: preview.counts.willCreate, conflicts: preview.counts.conflicts }
                      )}
                    </Typography>
                  ) : null}

                  {preview.excluded.length > 0 ? (
                    <Typography variant="pi" textColor="warning600">
                      {formatMessage(
                        {
                          id: getTranslation('preview.excluded'),
                          defaultMessage:
                            '{count, plural, one {# entry has} other {# entries have}} nothing in {locale} and will be skipped.',
                        },
                        { count: preview.excluded.length, locale: sourceLocale }
                      )}
                    </Typography>
                  ) : null}
                </Flex>
              ) : null}
            </>
          ) : (
            <Flex direction="column" alignItems="stretch" gap={3}>
              <Flex gap={2} alignItems="center">
                {isRunning ? <Loader small /> : null}
                <Typography variant="delta">
                  {isRunning
                    ? formatMessage(
                        {
                          id: getTranslation('translate.progress'),
                          defaultMessage: 'Translating… {done} of {total} done',
                        },
                        { done: job.progress.done, total: job.progress.total }
                      )
                    : formatMessage(
                        {
                          id: getTranslation('translate.done'),
                          defaultMessage:
                            '{translated} translated, {skipped} skipped, {failed} failed',
                        },
                        {
                          translated: job.progress.translated,
                          skipped: job.progress.skipped,
                          failed: job.progress.failed,
                        }
                      )}
                </Typography>
              </Flex>

              {job.items.map((item) => (
                <Box key={`${item.documentId}-${item.locale}`}>
                  <Typography variant="pi" textColor={statusColor(item.status)}>
                    {`${item.locale}: ${item.status}`}
                    {item.error ? ` — ${item.error}` : ''}
                    {item.skippedReason ? ` — ${item.skippedReason}` : ''}
                  </Typography>
                </Box>
              ))}
            </Flex>
          )}
        </Flex>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="tertiary" onClick={onClose}>
          {formatMessage({
            id: getTranslation(job && !isRunning ? 'action.close' : 'action.cancel'),
            defaultMessage: job && !isRunning ? 'Close' : 'Cancel',
          })}
        </Button>

        {!job ? (
          <Button loading={isStarting} disabled={selected.length === 0} onClick={submit}>
            {formatMessage({
              id: getTranslation('translate.confirm'),
              defaultMessage: 'Translate',
            })}
          </Button>
        ) : null}

        {job && !isRunning && failedCount > 0 ? (
          <Button variant="secondary" loading={isStarting} onClick={retry}>
            {formatMessage(
              {
                id: getTranslation('translate.retry'),
                defaultMessage:
                  'Retry {count, plural, one {# failed item} other {# failed items}}',
              },
              { count: failedCount }
            )}
          </Button>
        ) : null}

        {job && !isRunning && succeeded.length > 0 ? (
          <Button onClick={() => viewLocale(succeeded[0].locale)}>
            {formatMessage(
              {
                id: getTranslation('translate.view'),
                defaultMessage: 'View {locale}',
              },
              { locale: succeeded[0].locale }
            )}
          </Button>
        ) : null}
      </Modal.Footer>
    </>
  );
};

export { TranslateModal };
