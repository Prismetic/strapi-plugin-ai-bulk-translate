import { Box, Button, Checkbox, Flex, Typography } from '@strapi/design-system';
import { ChevronDown, ChevronRight } from '@strapi/icons';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { useLocales } from '../../hooks/useLocales';
import { useMonitorConfig, type MonitorConfig } from '../../hooks/useMonitorConfig';
import { useSettingsPermission } from '../../hooks/useSettingsPermission';
import { useTranslatableContentTypes } from '../../hooks/useTranslatableContentTypes';
import { getTranslation } from '../../utils/getTranslation';
import { localeIn, patchLocale, toggleLocale } from '../../utils/monitorPolicy';

/**
 * Column widths borrowed from the role permissions page, which solves the same layout problem:
 * a label column of varying length, then aligned columns of checkboxes that must line up across
 * every row so a column can be read down.
 */
const LABEL_WIDTH = '20rem';
const CELL_WIDTH = '12rem';

const blank = (contentType: string): MonitorConfig => ({
  contentType,
  enabled: false,
  locales: [],
});

const shortType = (uid: string): string => uid.split('.').pop() ?? uid;

const Cell = ({ children }: { children: React.ReactNode }) => (
  <Flex width={CELL_WIDTH} shrink={0} justifyContent="center">
    {children}
  </Flex>
);

/**
 * Which content types translate themselves when their default locale is published.
 *
 * Nothing here fires a translation — this says what *should* happen, and the publish hook acts on
 * it. Configuring it is deliberately an administrator's job: the choice commits the organisation to
 * spending on every publish, which is not an editor's decision to make.
 *
 * Laid out like the role permissions page rather than as a stack of cards. A content type is one
 * line until it has something to say; ticking it reveals a line per target locale, with the options
 * in aligned columns so "which locales may overwrite" can be read down a column rather than hunted
 * for. The default locale is never listed — it is the source of truth, and monitoring must not
 * become a way around that.
 */
const MonitoringSection = () => {
  const { formatMessage } = useIntl();
  const { canManage } = useSettingsPermission();
  const { translatable } = useTranslatableContentTypes();
  const { locales } = useLocales();
  const { configs, isLoading, error, save } = useMonitorConfig();

  const [drafts, setDrafts] = useState<Record<string, MonitorConfig>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDrafts(configs);
  }, [configs]);

  const targets = locales.filter((locale) => !locale.isDefault);

  const draftFor = (uid: string): MonitorConfig => drafts[uid] ?? configs[uid] ?? blank(uid);

  const update = (uid: string, next: MonitorConfig) =>
    setDrafts((current) => ({ ...current, [uid]: next }));

  const changed = (translatable ?? [])
    .map((contentType) => contentType.uid)
    .filter((uid) => JSON.stringify(draftFor(uid)) !== JSON.stringify(configs[uid] ?? blank(uid)));

  if (isLoading) {
    return (
      <Typography textColor="neutral600">
        {formatMessage({
          id: getTranslation('monitoring.loading'),
          defaultMessage: 'Loading monitoring configuration…',
        })}
      </Typography>
    );
  }

  if (translatable !== null && translatable.length === 0) {
    return (
      <Typography textColor="neutral600">
        {formatMessage({
          id: getTranslation('monitoring.noContentTypes'),
          defaultMessage:
            'No content type has internationalization enabled, so there is nothing to monitor.',
        })}
      </Typography>
    );
  }

  const columns = [
    formatMessage({
      id: getTranslation('monitoring.column.translate'),
      defaultMessage: 'Translate',
    }),
    formatMessage({
      id: getTranslation('monitoring.overwriteContent'),
      defaultMessage: 'Overwrite content',
    }),
    formatMessage({
      id: getTranslation('monitoring.overwriteManualEdits'),
      defaultMessage: 'Overwrite manual edits',
    }),
  ];

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      <Typography variant="pi" textColor="neutral600">
        {formatMessage({
          id: getTranslation('monitoring.intro'),
          defaultMessage:
            'Publishing the default locale of a monitored entry translates that entry automatically. Only the entry published is translated.',
        })}
      </Typography>

      {error ? <Typography textColor="danger600">{error}</Typography> : null}

      <Box>
        {/* Column headers sit once above every row, so a column can be read down. */}
        <Flex paddingBottom={2} paddingLeft={2}>
          <Box width={LABEL_WIDTH} shrink={0}>
            <Typography variant="sigma" textColor="neutral500">
              {formatMessage({
                id: getTranslation('monitoring.column.contentType'),
                defaultMessage: 'Content type',
              })}
            </Typography>
          </Box>
          {columns.map((label) => (
            <Cell key={label}>
              <Typography variant="sigma" textColor="neutral500">
                {label}
              </Typography>
            </Cell>
          ))}
        </Flex>

        {(translatable ?? []).map((contentType) => {
          const draft = draftFor(contentType.uid);
          const isOpen = expanded === contentType.uid;

          return (
            <Box
              key={contentType.uid}
              background="neutral0"
              hasRadius
              borderColor="neutral150"
              borderWidth="1px"
              borderStyle="solid"
              marginBottom={1}
            >
              <Flex paddingTop={3} paddingBottom={3} paddingLeft={2}>
                <Flex width={LABEL_WIDTH} shrink={0} gap={2} alignItems="center">
                  <Checkbox
                    checked={draft.enabled}
                    disabled={!canManage}
                    onCheckedChange={(checked: boolean) => {
                      update(contentType.uid, { ...draft, enabled: Boolean(checked) });
                      // Enabling with nothing to configure would leave a row that looks finished
                      // and translates nowhere.
                      setExpanded(checked ? contentType.uid : null);
                    }}
                  >
                    <Typography fontWeight="bold">{shortType(contentType.uid)}</Typography>
                  </Checkbox>

                  {draft.enabled ? (
                    <Box
                      tag="button"
                      type="button"
                      background="transparent"
                      borderWidth={0}
                      cursor="pointer"
                      aria-expanded={isOpen}
                      aria-label={formatMessage(
                        {
                          id: getTranslation('monitoring.toggle'),
                          defaultMessage: 'Locales for {contentType}',
                        },
                        { contentType: shortType(contentType.uid) }
                      )}
                      onClick={() => setExpanded(isOpen ? null : contentType.uid)}
                    >
                      {isOpen ? <ChevronDown /> : <ChevronRight />}
                    </Box>
                  ) : null}
                </Flex>

                {!draft.enabled ? (
                  <Flex alignItems="center">
                    <Typography variant="pi" textColor="neutral500">
                      {formatMessage({
                        id: getTranslation('monitoring.off'),
                        defaultMessage: 'Not monitored',
                      })}
                    </Typography>
                  </Flex>
                ) : null}
              </Flex>

              {draft.enabled && isOpen
                ? targets.map((locale) => {
                    const monitored = localeIn(draft.locales, locale.code);
                    const name = `${locale.name} (${locale.code})`;

                    return (
                      <Flex
                        key={locale.code}
                        paddingTop={2}
                        paddingBottom={2}
                        paddingLeft={2}
                        borderColor="neutral150"
                        borderWidth="1px 0 0 0"
                        borderStyle="solid"
                      >
                        <Box width={LABEL_WIDTH} shrink={0} paddingLeft={7}>
                          <Typography textColor="neutral700">{name}</Typography>
                        </Box>

                        <Cell>
                          <Checkbox
                            aria-label={formatMessage(
                              {
                                id: getTranslation('monitoring.aria.translate'),
                                defaultMessage: 'Translate into {locale}',
                              },
                              { locale: name }
                            )}
                            checked={Boolean(monitored)}
                            disabled={!canManage}
                            onCheckedChange={() =>
                              update(contentType.uid, {
                                ...draft,
                                locales: toggleLocale(draft.locales, locale.code),
                              })
                            }
                          />
                        </Cell>

                        <Cell>
                          <Checkbox
                            aria-label={formatMessage(
                              {
                                id: getTranslation('monitoring.aria.overwriteContent'),
                                defaultMessage: 'Overwrite content in {locale}',
                              },
                              { locale: name }
                            )}
                            checked={Boolean(monitored?.overwriteContent)}
                            disabled={!canManage || !monitored}
                            onCheckedChange={(checked: boolean) =>
                              update(contentType.uid, {
                                ...draft,
                                locales: patchLocale(draft.locales, locale.code, {
                                  overwriteContent: Boolean(checked),
                                }),
                              })
                            }
                          />
                        </Cell>

                        {/* Nested, not merely adjacent: overwriting a human's edits is a stronger
                            act than overwriting our own output, and cannot be reached without
                            choosing the weaker one first. */}
                        <Cell>
                          <Checkbox
                            aria-label={formatMessage(
                              {
                                id: getTranslation('monitoring.aria.overwriteManualEdits'),
                                defaultMessage: 'Overwrite manual edits in {locale}',
                              },
                              { locale: name }
                            )}
                            checked={Boolean(monitored?.overwriteManualEdits)}
                            disabled={!canManage || !monitored?.overwriteContent}
                            onCheckedChange={(checked: boolean) =>
                              update(contentType.uid, {
                                ...draft,
                                locales: patchLocale(draft.locales, locale.code, {
                                  overwriteManualEdits: Boolean(checked),
                                }),
                              })
                            }
                          />
                        </Cell>
                      </Flex>
                    );
                  })
                : null}
            </Box>
          );
        })}
      </Box>

      {canManage ? (
        <Flex justifyContent="flex-end" gap={2} alignItems="center">
          {changed.length > 0 ? (
            <Typography variant="pi" textColor="neutral600">
              {formatMessage(
                {
                  id: getTranslation('monitoring.unsaved'),
                  defaultMessage:
                    '{count, plural, one {# content type} other {# content types}} changed',
                },
                { count: changed.length }
              )}
            </Typography>
          ) : null}

          <Button
            disabled={changed.length === 0 || isSaving}
            loading={isSaving}
            onClick={async () => {
              setIsSaving(true);
              // One request per changed type: the endpoint takes one, and a type whose
              // configuration the server refuses must not block saving the others.
              for (const uid of changed) {
                await save(draftFor(uid));
              }
              setIsSaving(false);
            }}
          >
            {formatMessage({ id: getTranslation('action.save'), defaultMessage: 'Save' })}
          </Button>
        </Flex>
      ) : null}
    </Flex>
  );
};

export { MonitoringSection };
