/**
 * Whether the edit view should offer AI Translate at all.
 *
 * The control hides itself rather than failing: an editor is never shown an action the server would
 * reject. Two of the inputs are deliberately three-valued — `canTranslate` and `translatable` are
 * null until RBAC and the content-type list resolve, and an unknown answer is treated as "no", so
 * the button never flashes into view and then disappears.
 *
 * The single-type exception is the one rule worth stating aloud. A single type's identifier is
 * resolved by the server, so an absent `documentId` is not a reason to withhold the action. For a
 * collection type the same absence does mean there is nothing to act on: the entry is still being
 * created and has never been saved.
 */
export const canOfferTranslation = ({
  canTranslate,
  translatable,
  sourceLocale,
  isSingleType,
  documentId,
}: {
  canTranslate: boolean | null;
  translatable: boolean | null;
  sourceLocale: string | null;
  isSingleType: boolean;
  documentId: string | null;
}): boolean => {
  if (canTranslate !== true || translatable !== true || sourceLocale === null) {
    return false;
  }

  return isSingleType || documentId !== null;
};
