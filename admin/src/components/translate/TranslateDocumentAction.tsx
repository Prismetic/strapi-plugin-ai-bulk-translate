import { useMemo } from 'react';
import { useIntl } from 'react-intl';

import { useTranslatableContentTypes } from '../../hooks/useTranslatableContentTypes';
import { useTranslatePermission } from '../../hooks/useTranslatePermission';
import { getTranslation } from '../../utils/getTranslation';
import { PluginIcon } from '../PluginIcon';
import { TranslateModal } from './TranslateModal';

/**
 * Adds **Translate** to the edit view, for localized collection types *and* single types.
 *
 * Single types are the whole reason this is worth a slice of its own: they have no list view, so the
 * edit view is their only surface, and they carry no identifier in their route. Both are handled
 * without the translation service knowing which kind it is dealing with — that service is
 * surface-agnostic, and this is what demonstrates it.
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
  const { isTranslatable } = useTranslatableContentTypes();
  const { canTranslate } = useTranslatePermission();

  const sourceLocale = document?.locale ?? null;
  const translatable = isTranslatable(model);

  /**
   * A single type's identifier is resolved by the server, so an absent one is not a reason to hide
   * the action — an empty list is the signal to resolve it. For a collection type it does mean
   * there is nothing to act on: the entry is still being created.
   */
  const isSingleType = collectionType === 'single-types';
  const documentIds = useMemo(() => (documentId ? [documentId] : []), [documentId]);

  /**
   * Stable across re-renders, so the polling progress view is not remounted — and its state reset —
   * every time the edit view re-renders while a job is running.
   */
  const content = useMemo(() => {
    if (!model || !sourceLocale) {
      return null;
    }

    const Content = ({ onClose }: { onClose: () => void }) => (
      <TranslateModal
        contentType={model}
        documentIds={documentIds}
        sourceLocale={sourceLocale}
        onClose={onClose}
      />
    );

    return Content;
  }, [model, documentIds, sourceLocale]);

  // `translatable` is null until the content-type list loads; hiding the action until it is known
  // is better than flashing one that might not apply. The permission is treated the same way:
  // absent until RBAC resolves, so the action never appears for a role that cannot use it.
  if (!canTranslate || !translatable || !sourceLocale || !content) {
    return null;
  }

  if (!isSingleType && documentIds.length === 0) {
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
