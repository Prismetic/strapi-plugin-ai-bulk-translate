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

/**
 * The entry the edit view is showing, from the route's `:id` segment.
 *
 * `create` is a path segment, not an identifier: the Content Manager routes creation as
 * `/…/:slug/create`, which matches the same `:collectionType/:slug/:id` pattern as a saved entry.
 * Taking it at face value put the translate button on an entry that does not exist yet — there is
 * nothing to read a source locale from, and the run would have had nothing to translate.
 *
 * An absent segment is a single type, or a clone; both are handled by the caller rather than here.
 */
export const documentIdFromRoute = (id: string | undefined): string | null =>
  !id || id === 'create' ? null : id;
