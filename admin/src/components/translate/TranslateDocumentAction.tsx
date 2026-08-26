import { useMemo } from 'react';
import { useIntl } from 'react-intl';

import { PluginIcon } from '../PluginIcon';
import { getTranslation } from '../../utils/getTranslation';
import { TranslateModal } from './TranslateModal';

/**
 * Adds **Translate** to the edit view.
 *
 * Deliberately narrow in this slice: localized collection types only. Single types are the next
 * slice, and the point of keeping them out for now is that the translation service must prove it is
 * genuinely surface-agnostic before more surfaces are hung off it.
 *
 * The action hides itself rather than failing when it does not apply. A returned `null` removes it
 * from the menu, so an editor is never offered an action the server would reject.
 */
interface DocumentActionContext {
  collectionType?: string;
  model?: string;
  documentId?: string;
  document?: { locale?: string | null };
}

const TranslateDocumentAction = ({
  collectionType,
  model,
  documentId,
  document,
}: DocumentActionContext) => {
  const { formatMessage } = useIntl();
  const sourceLocale = document?.locale ?? null;

  /**
   * Stable across re-renders, so the polling progress view is not remounted — and its state reset —
   * every time the edit view re-renders while a job is running.
   */
  const content = useMemo(() => {
    if (!model || !documentId || !sourceLocale) {
      return null;
    }

    const Content = ({ onClose }: { onClose: () => void }) => (
      <TranslateModal
        contentType={model}
        documentIds={[documentId]}
        sourceLocale={sourceLocale}
        onClose={onClose}
      />
    );

    return Content;
  }, [model, documentId, sourceLocale]);

  // No locale on the document means internationalization is not enabled for this content type,
  // so there is nowhere to translate to.
  if (collectionType !== 'collection-types' || !documentId || !sourceLocale || !content) {
    return null;
  }

  return {
    label: formatMessage({ id: getTranslation('translate.action'), defaultMessage: 'Translate' }),
    icon: <PluginIcon />,
    position: ['panel' as const],
    dialog: {
      type: 'modal' as const,
      title: formatMessage({
        id: getTranslation('translate.title'),
        defaultMessage: 'AI translate',
      }),
      content,
    },
  };
};

export { TranslateDocumentAction };
