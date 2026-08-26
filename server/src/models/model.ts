/**
 * Raw database model for registered language models.
 *
 * A row is a named model *as a specific connection knows it* — `gpt-5.4-mini` on the OpenAI
 * connection is a different row from the same identifier on an Azure deployment, because the
 * credentials and endpoint differ.
 *
 * `providerId` is a plain integer rather than an ORM relation. Raw models are registered outside
 * the content-type layer, and the one cascade that matters here — disabling or deleting a
 * connection must disable its models — is a rule with its own message and default-clearing
 * behaviour, not something a database cascade could express. See `model-store`.
 */
export const MODEL_UID = 'plugin::ai-bulk-translate.model';

export const modelModel = {
  uid: MODEL_UID,
  tableName: 'ai_bulk_translate_models',
  singularName: 'model',
  attributes: {
    id: { type: 'increments' },
    providerId: { type: 'integer', column: { notNullable: true } },
    /** The identifier the provider expects, e.g. `gpt-5.4-mini` or an Azure deployment name. */
    modelId: { type: 'string', column: { notNullable: true } },
    label: { type: 'string', column: { notNullable: true } },
    enabled: { type: 'boolean', default: true },
    /** At most one row across the whole install is true. Enforced in `model-store`. */
    isDefault: { type: 'boolean', default: false },
    createdAt: { type: 'datetime', default: () => new Date() },
    updatedAt: { type: 'datetime', default: () => new Date() },
  },
};
