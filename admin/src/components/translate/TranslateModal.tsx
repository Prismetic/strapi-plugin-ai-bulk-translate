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
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { useLocaleStatus } from '../../hooks/useLocaleStatus';
import { useLocales } from '../../hooks/useLocales';
import { useModels } from '../../hooks/useModels';
import { useTranslationJob, type JobItem } from '../../hooks/useTranslationJob';
import { getTranslation } from '../../utils/getTranslation';
import { resolveOutcome, type BlockedReason } from '../../utils/outcome';
import { ConflictList } from './ConflictList';
import { LocalePreview } from './LocalePreview';
import { ModelPicker, preselectedModelId } from './ModelPicker';

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
 * Five regions, in the order an editor thinks: which locales, which model, what will happen to each
 * entry, which existing translations to replace, and then the outcome in words above the confirm
 * button.
 *
 * The arithmetic behind the last two lives in `resolveOutcome`, not here, so the sentence the footer
 * states and the condition the button is enabled by cannot disagree.
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
  const [authorised, setAuthorised] = useState<string[]>([]);

  const { models } = useModels();
  const [modelId, setModelId] = useState<number | null>(null);
  const [modelTouched, setModelTouched] = useState(false);

  // The list arrives after the first render, so the default is applied when it does — but only
  // until the editor makes a choice of their own, which `modelTouched` protects from being
  // overwritten by a later refetch.
  useEffect(() => {
    if (!modelTouched) {
      setModelId(preselectedModelId(models));
    }
  }, [models, modelTouched]);

  // Nothing is fetched until a target is chosen — the preview has nothing to say before then, and
  // asking the server to read every selected document for no locales is pure waste.
  const preview = useLocaleStatus(contentType, documentIds, sourceLocale, selected);

  const outcome = resolveOutcome({
    rows: preview.rows,
    targetLocales: selected,
    authorised,
  });

  const targets = locales.filter((locale) => locale.code !== sourceLocale);

  const toggle = (code: string) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((entry) => entry !== code) : [...current, code]
    );

  const toggleAuthorised = (documentId: string) =>
    setAuthorised((current) =>
      current.includes(documentId)
        ? current.filter((entry) => entry !== documentId)
        : [...current, documentId]
    );

  const submit = () => {
    // Entries with nothing in the source locale are dropped here as well as server-side, so the
    // job's item count matches what the preview promised rather than counting work that cannot
    // happen. Conflicts are *not* dropped: sending them is what makes the job record show them as
    // skipped, which is the audit trail the run is supposed to leave.
    const translatableIds = preview.rows.length
      ? preview.translatable.map((row) => row.documentId)
      : documentIds;

    start({
      contentType,
      documentIds: translatableIds,
      sourceLocale,
      targetLocales: selected,
      // Only approvals the editor could actually see and tick, so the job records nothing stale.
      overwriteDocumentIds: outcome.authorisedIds,
      // null is a real choice here: it tells the server to resolve its own default rather than
      // pinning the run to whatever the browser happened to have listed.
      modelId,
      origin,
    });
  };

  const blockedMessage = (reason: BlockedReason) => {
    if (reason === 'no-target-locales') {
      return formatMessage({
        id: getTranslation('outcome.blocked.noLocales'),
        defaultMessage: 'Choose at least one locale to translate into.',
      });
    }

    if (reason === 'nothing-in-source') {
      return formatMessage(
        {
          id: getTranslation('outcome.blocked.noSource'),
          defaultMessage: 'Nothing selected has content in {locale} to translate.',
        },
        { locale: sourceLocale }
      );
    }

    return formatMessage({
      id: getTranslation('outcome.blocked.conflicts'),
      defaultMessage:
        'Every locale you chose already has a translation. Tick the entries you want to replace, or choose another locale.',
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

              <ModelPicker
                models={models}
                value={modelId}
                onChange={(next) => {
                  setModelTouched(true);
                  setModelId(next);
                }}
              />

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

                  {!preview.isLoading && outcome.conflicts.length > 0 ? (
                    <ConflictList
                      conflicts={outcome.conflicts}
                      authorised={authorised}
                      onToggle={toggleAuthorised}
                      onSelectAll={() =>
                        setAuthorised(outcome.conflicts.map((conflict) => conflict.documentId))
                      }
                      onClearAll={() => setAuthorised([])}
                    />
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

                  {/* The resolved outcome, stated in words directly before the confirm button, so
                      the last thing read is what will happen rather than a count of rows. */}
                  {!preview.isLoading && preview.rows.length > 0 ? (
                    <Box
                      padding={3}
                      hasRadius
                      background={outcome.hasWork ? 'primary100' : 'warning100'}
                    >
                      <Typography
                        variant="omega"
                        fontWeight="semiBold"
                        textColor={outcome.hasWork ? 'primary600' : 'warning600'}
                      >
                        {outcome.hasWork
                          ? formatMessage(
                              {
                                id: getTranslation('outcome.summary'),
                                defaultMessage:
                                  '{create, plural, =0 {} one {Will create # translation} other {Will create # translations}}{both, select, yes {, and } other {}}{overwrite, plural, =0 {} one {will replace # existing translation} other {will replace # existing translations}}. {skip, plural, =0 {} one {# existing translation is left untouched.} other {# existing translations are left untouched.}}',
                              },
                              {
                                create: outcome.willCreate,
                                overwrite: outcome.willOverwrite,
                                skip: outcome.willSkip,
                                both:
                                  outcome.willCreate > 0 && outcome.willOverwrite > 0
                                    ? 'yes'
                                    : 'no',
                              }
                            )
                          : blockedMessage(outcome.blockedReason)}
                      </Typography>
                    </Box>
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
          <Button
            loading={isStarting}
            // Disabled whenever the run would do nothing — the body says why, so this is never a
            // dead button with no explanation.
            disabled={!outcome.hasWork || preview.isLoading}
            onClick={submit}
          >
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
                defaultMessage: 'Retry {count, plural, one {# failed item} other {# failed items}}',
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
