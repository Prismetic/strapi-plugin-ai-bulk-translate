import {
  Alert,
  Button,
  Field,
  Flex,
  NumberInput,
  Textarea,
  Typography,
} from '@strapi/design-system';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { getTranslation } from '../../utils/getTranslation';
import { useSettings, type TranslationSettings } from '../../hooks/useSettings';
import { useSettingsPermission } from '../../hooks/useSettingsPermission';

const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;

/**
 * The prompt and temperature every translation request is made with.
 *
 * The temperature bound stated in the hint is the same one the server enforces. The browser does
 * not clamp: typing 5 and saving produces a refusal the operator can see, rather than a silent
 * correction to 2 that leaves them believing the run used 5.
 */
const TranslationSection = () => {
  const { formatMessage } = useIntl();
  const { settings, defaults, isLoading, error, dismissError, save, restoreDefaults } =
    useSettings();
  const { canManage } = useSettingsPermission();

  const [draft, setDraft] = useState<TranslationSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // The server is the source of truth: the draft is re-seeded whenever it answers, so a refusal
  // leaves the fields showing what is actually stored rather than the rejected input.
  useEffect(() => {
    if (settings) {
      setDraft(settings);
    }
  }, [settings]);

  if (isLoading || !draft || !settings || !defaults) {
    return (
      <Typography variant="pi" textColor="neutral600">
        {formatMessage({ id: getTranslation('loading'), defaultMessage: 'Loading…' })}
      </Typography>
    );
  }

  const isDirty =
    draft.systemPrompt !== settings.systemPrompt || draft.temperature !== settings.temperature;

  const isAtDefaults =
    settings.systemPrompt === defaults.systemPrompt &&
    settings.temperature === defaults.temperature;

  const run = async (action: () => Promise<boolean>) => {
    setIsSaving(true);
    await action();
    setIsSaving(false);
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={4}>
      {error ? (
        <Alert
          variant="danger"
          onClose={dismissError}
          title={formatMessage({
            id: getTranslation('translation.error.title'),
            defaultMessage: 'Could not save',
          })}
        >
          {error}
        </Alert>
      ) : null}

      <Typography variant="pi" textColor="neutral600">
        {formatMessage({
          id: getTranslation('translation.intro'),
          defaultMessage:
            'These steer every translation request. Changes apply to the next run; runs already in progress are unaffected.',
        })}
      </Typography>

      <Field.Root
        hint={formatMessage({
          id: getTranslation('translation.systemPrompt.hint'),
          defaultMessage:
            'Sent as the system message on every request. Use it for house tone and rules the model should always follow.',
        })}
      >
        <Field.Label>
          {formatMessage({
            id: getTranslation('translation.systemPrompt'),
            defaultMessage: 'System prompt',
          })}
        </Field.Label>
        <Textarea
          rows={8}
          disabled={!canManage}
          value={draft.systemPrompt}
          onChange={(e: { target: { value: string } }) =>
            setDraft({ ...draft, systemPrompt: e.target.value })
          }
        />
        <Field.Hint />
      </Field.Root>

      <Field.Root
        hint={formatMessage(
          {
            id: getTranslation('translation.temperature.hint'),
            defaultMessage:
              'Between {min} and {max}. Low values keep translations faithful; higher values make the model freer, which for translation usually means less accurate.',
          },
          { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX }
        )}
      >
        <Field.Label>
          {formatMessage({
            id: getTranslation('translation.temperature'),
            defaultMessage: 'Temperature',
          })}
        </Field.Label>
        <NumberInput
          step={0.1}
          disabled={!canManage}
          value={draft.temperature}
          onValueChange={(value: number | undefined) =>
            setDraft({ ...draft, temperature: value ?? 0 })
          }
        />
        <Field.Hint />
      </Field.Root>

      {canManage ? (
        <Flex gap={2} justifyContent="flex-end">
          <Button
            variant="tertiary"
            disabled={isAtDefaults || isSaving}
            onClick={() => run(restoreDefaults)}
          >
            {formatMessage({
              id: getTranslation('translation.restoreDefaults'),
              defaultMessage: 'Restore defaults',
            })}
          </Button>
          <Button
            loading={isSaving}
            disabled={!isDirty}
            onClick={() => run(() => save(draft))}
          >
            {formatMessage({ id: getTranslation('action.save'), defaultMessage: 'Save' })}
          </Button>
        </Flex>
      ) : null}
    </Flex>
  );
};

export { TranslationSection };
