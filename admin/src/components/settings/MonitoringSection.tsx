import { Box, Button, Checkbox, Divider, Flex, Typography } from '@strapi/design-system';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { useLocales } from '../../hooks/useLocales';
import { useMonitorConfig, type MonitorConfig } from '../../hooks/useMonitorConfig';
import { useSettingsPermission } from '../../hooks/useSettingsPermission';
import { useTranslatableContentTypes } from '../../hooks/useTranslatableContentTypes';
import { getTranslation } from '../../utils/getTranslation';
import { localeIn, patchLocale, toggleLocale } from '../../utils/monitorPolicy';

const blank = (contentType: string): MonitorConfig => ({
  contentType,
  enabled: false,
  locales: [],
});

const shortType = (uid: string): string => uid.split('.').pop() ?? uid;

/**
 * Which content types translate themselves when their default locale is published.
 *
 * Nothing here fires a translation — this says what *should* happen, and the publish hook is a
 * later slice. Configuring it is deliberately an administrator's job: the choice commits the
 * organisation to spending on every publish, which is not an editor's decision to make.
 *
 * The default locale is never offered as a target, for the same reason the translation dialog does
 * not offer it: it is the source of truth, and monitoring must not become a way around that.
 */
const MonitoringSection = () => {
  const { formatMessage } = useIntl();
  const { canManage } = useSettingsPermission();
  const { translatable } = useTranslatableContentTypes();
  const { locales } = useLocales();
  const { configs, isLoading, error, save } = useMonitorConfig();

  const [drafts, setDrafts] = useState<Record<string, MonitorConfig>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(configs);
  }, [configs]);

  const targets = locales.filter((locale) => !locale.isDefault);

  const draftFor = (uid: string): MonitorConfig => drafts[uid] ?? configs[uid] ?? blank(uid);

  const update = (uid: string, next: MonitorConfig) =>
    setDrafts((current) => ({ ...current, [uid]: next }));

  const isDirty = (uid: string) =>
    JSON.stringify(draftFor(uid)) !== JSON.stringify(configs[uid] ?? blank(uid));

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

  return (
    <Flex direction="column" alignItems="stretch" gap={5}>
      <Typography variant="pi" textColor="neutral600">
        {formatMessage({
          id: getTranslation('monitoring.intro'),
          defaultMessage:
            'Publishing the default locale of a monitored entry translates that entry automatically. Only the entry published is translated.',
        })}
      </Typography>

      {error ? <Typography textColor="danger600">{error}</Typography> : null}

      {(translatable ?? []).map((contentType) => {
        const draft = draftFor(contentType.uid);

        return (
          <Box key={contentType.uid} padding={4} background="neutral0" hasRadius>
            <Flex direction="column" alignItems="stretch" gap={3}>
              <Checkbox
                checked={draft.enabled}
                disabled={!canManage}
                onCheckedChange={(checked: boolean) =>
                  update(contentType.uid, { ...draft, enabled: Boolean(checked) })
                }
              >
                <Typography fontWeight="bold">{shortType(contentType.uid)}</Typography>
              </Checkbox>

              {draft.enabled ? (
                <Box paddingLeft={6}>
                  <Flex direction="column" alignItems="stretch" gap={3}>
                    <Divider />
                    <Typography variant="pi" textColor="neutral600">
                      {formatMessage({
                        id: getTranslation('monitoring.targets'),
                        defaultMessage: 'Translate into',
                      })}
                    </Typography>

                    {targets.map((locale) => {
                      const monitored = localeIn(draft.locales, locale.code);

                      return (
                        <Flex
                          key={locale.code}
                          direction="column"
                          alignItems="flex-start"
                          gap={2}
                          paddingBottom={2}
                        >
                          <Checkbox
                            checked={Boolean(monitored)}
                            disabled={!canManage}
                            onCheckedChange={() =>
                              update(contentType.uid, {
                                ...draft,
                                locales: toggleLocale(draft.locales, locale.code),
                              })
                            }
                          >
                            {locale.name} ({locale.code})
                          </Checkbox>

                          {monitored ? (
                            <Box paddingLeft={6}>
                              <Flex direction="column" alignItems="flex-start" gap={2}>
                                <Checkbox
                                  checked={monitored.overwriteContent}
                                  disabled={!canManage}
                                  onCheckedChange={(checked: boolean) =>
                                    update(contentType.uid, {
                                      ...draft,
                                      locales: patchLocale(draft.locales, locale.code, {
                                        overwriteContent: Boolean(checked),
                                      }),
                                    })
                                  }
                                >
                                  {formatMessage({
                                    id: getTranslation('monitoring.overwriteContent'),
                                    defaultMessage: 'Overwrite content',
                                  })}
                                </Checkbox>

                                {/* Nested, not merely adjacent: overwriting a human's edits is a
                                    stronger act than overwriting our own output, and cannot be
                                    reached without choosing the weaker one first. */}
                                <Box paddingLeft={6}>
                                  <Checkbox
                                    checked={monitored.overwriteManualEdits}
                                    disabled={!canManage || !monitored.overwriteContent}
                                    onCheckedChange={(checked: boolean) =>
                                      update(contentType.uid, {
                                        ...draft,
                                        locales: patchLocale(draft.locales, locale.code, {
                                          overwriteManualEdits: Boolean(checked),
                                        }),
                                      })
                                    }
                                  >
                                    {formatMessage({
                                      id: getTranslation('monitoring.overwriteManualEdits'),
                                      defaultMessage: 'Overwrite manual edits',
                                    })}
                                  </Checkbox>
                                </Box>
                              </Flex>
                            </Box>
                          ) : null}
                        </Flex>
                      );
                    })}
                  </Flex>
                </Box>
              ) : null}

              {canManage ? (
                <Flex justifyContent="flex-end">
                  <Button
                    size="S"
                    disabled={!isDirty(contentType.uid) || saving === contentType.uid}
                    loading={saving === contentType.uid}
                    onClick={async () => {
                      setSaving(contentType.uid);
                      await save(draft);
                      setSaving(null);
                    }}
                  >
                    {formatMessage({
                      id: getTranslation('action.save'),
                      defaultMessage: 'Save',
                    })}
                  </Button>
                </Flex>
              ) : null}
            </Flex>
          </Box>
        );
      })}
    </Flex>
  );
};

export { MonitoringSection };
