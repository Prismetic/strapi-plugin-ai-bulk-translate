import { useMemo } from 'react';
import { useIntl } from 'react-intl';

import { useTranslatableContentTypes } from '../../hooks/useTranslatableContentTypes';
import { useTranslatePermission } from '../../hooks/useTranslatePermission';
import { getTranslation } from '../../utils/getTranslation';
import { PluginIcon } from '../PluginIcon';
import { TranslateModal } from './TranslateModal';

/**
 * Adds **AI translate** to the Content Manager list view, for the current selection.
 *
 * Collection types only, and not by choice — single types have no list view at all. Their surface is
 * the edit-view action, which covers both kinds.
 *
 * Only identifiers leave the browser. The selected rows carry the fields the list layout happens to
 * show, which is not the document: nested components and dynamic zones are absent. Sending them
 * would be both incomplete and a claim the server has no reason to trust, so the server loads each
 * document itself.
 */
interface BulkActionContext {
  /** The rows currently ticked in the list view. */
  documents?: { documentId: string; locale?: string | null }[];
  model?: string;
  collectionType?: string;
}

const TranslateBulkAction = ({ documents, model, collectionType }: BulkActionContext) => {
  const { formatMessage } = useIntl();
  const { isTranslatable } = useTranslatableContentTypes();
  const { canTranslate } = useTranslatePermission();

  const selected = documents ?? [];
  const documentIds = useMemo(() => selected.map((entry) => entry.documentId), [selected]);

  /**
   * Taken from the rows themselves rather than parsed out of the URL. The list view only ever shows
   * one locale at a time, so every row carries the same one, and reading it here cannot drift from
   * what the editor is actually looking at.
   */
  const sourceLocale = selected[0]?.locale ?? null;

  /**
   * Stable across re-renders, so the polling progress view is not remounted — and its state reset —
   * while a run is in flight.
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
        origin="bulk"
        onClose={onClose}
      />
    );

    return Content;
  }, [model, documentIds, sourceLocale]);

  // `isTranslatable` is null until the content-type list loads. Hiding the action until it is known
  // beats flashing one that may not apply.
  if (
    !canTranslate ||
    collectionType !== 'collection-types' ||
    !isTranslatable(model) ||
    documentIds.length === 0 ||
    !sourceLocale ||
    !content
  ) {
    return null;
  }

  return {
    label: formatMessage({
      id: getTranslation('translate.bulk.action'),
      defaultMessage: 'AI translate',
    }),
    icon: <PluginIcon />,
    dialog: {
      type: 'modal' as const,
      title: formatMessage(
        {
          id: getTranslation('translate.bulk.title'),
          defaultMessage: 'Translate {count, plural, one {# entry} other {# entries}}',
        },
        { count: documentIds.length }
      ),
      content,
    },
  };
};

export { TranslateBulkAction };
