import { Button, Modal } from '@strapi/design-system';
import { useQueryParams } from '@strapi/strapi/admin';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';

import { useLocales } from '../../hooks/useLocales';
import { useTranslatableContentTypes } from '../../hooks/useTranslatableContentTypes';
import { useTranslatePermission } from '../../hooks/useTranslatePermission';
import { getTranslation } from '../../utils/getTranslation';
import { canOfferTranslation, documentIdFromRoute } from '../../utils/translateAvailability';
import { PluginIcon } from '../PluginIcon';
import { TranslateModal } from './TranslateModal';

/**
 * **AI Translate** in the edit view, for localized collection types *and* single types.
 *
 * Injected into `editView.right-links` rather than registered as a document action, and that is a
 * deliberate correction. A `position: ['panel']` action is destructured by Strapi as
 * `[primary, secondary, ...rest]`; Publish and Save take both real buttons, so ours always landed in
 * the overflow menu and no configuration changed that. `addDocumentHeaderAction` is the other
 * documented route and was rejected on evidence: it renders an `IconButton`, so the label becomes a
 * tooltip rather than visible text, and at 5.27 — the peer floor, and the version the verification
 * host runs — an action without `type: 'icon'` renders nothing at all.
 *
 * The injection zone renders immediately below Publish and Save in the same panel, so the control is
 * where editors already look, says what it does, and needs no menu.
 *
 * The cost is that the zone hands over only `slug`. Everything else the dialog needs comes from the
 * route and the query string rather than from props — see below.
 */
interface InjectedProps {
  /** The content-type uid, the only prop `editView.right-links` passes. */
  slug?: string;
}

const TranslateEditViewButton = ({ slug }: InjectedProps) => {
  const { formatMessage } = useIntl();
  const { isTranslatable } = useTranslatableContentTypes();
  const { canTranslate } = useTranslatePermission();
  const { locales } = useLocales();
  const [{ query }] = useQueryParams<{ plugins?: { i18n?: { locale?: string } } }>();
  const params = useParams<{ collectionType?: string; slug?: string; id?: string }>();

  const [open, setOpen] = useState(false);

  const model = slug ?? params.slug ?? null;
  const isSingleType = params.collectionType === 'single-types';
  const documentId = documentIdFromRoute(params.id);

  /**
   * The Content Manager puts the locale being edited in the query string. When it is absent the
   * editor is looking at the default locale, which is read from the plugin's own `/locales` route
   * rather than from i18n's admin state — depending on another plugin's internals would break
   * without notice.
   */
  const sourceLocale =
    query.plugins?.i18n?.locale ?? locales.find((locale) => locale.isDefault)?.code ?? null;

  const documentIds = useMemo(() => (documentId ? [documentId] : []), [documentId]);

  if (
    !model ||
    !canOfferTranslation({
      canTranslate,
      translatable: isTranslatable(model),
      sourceLocale,
      isSingleType,
      documentId,
    })
  ) {
    return null;
  }

  return (
    <Modal.Root open={open} onOpenChange={setOpen}>
      <Modal.Trigger>
        <Button variant="secondary" startIcon={<PluginIcon />} fullWidth>
          {formatMessage({
            id: getTranslation('translate.action'),
            defaultMessage: 'AI Translate',
          })}
        </Button>
      </Modal.Trigger>
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            {formatMessage({
              id: getTranslation('translate.title'),
              defaultMessage: 'AI translate',
            })}
          </Modal.Title>
        </Modal.Header>
        {/* Mounted only while open, so a closed dialog holds no polling job or stale preview. */}
        {open ? (
          <TranslateModal
            contentType={model}
            documentIds={documentIds}
            sourceLocale={sourceLocale as string}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </Modal.Content>
    </Modal.Root>
  );
};

export { TranslateEditViewButton };
