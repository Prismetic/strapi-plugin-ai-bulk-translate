/**
 * The set of provider types this plugin can talk to, and what each one needs configured.
 *
 * The settings form renders from this catalog, so adding a provider later is one entry here
 * plus its `@ai-sdk/*` dependency — no UI changes.
 */
export type ProviderType = 'openai' | 'azure' | 'anthropic' | 'google' | 'openai-compatible';

export interface CredentialField {
  name: string;
  label: string;
  required: boolean;
  placeholder?: string;
  hint?: string;
}

export interface ProviderDefinition {
  type: ProviderType;
  label: string;
  /** npm package providing the AI SDK adapter. Imported dynamically — it is ESM-only. */
  package: string;
  /** Whether an API key is required. Local gateways such as Ollama often need none. */
  requiresApiKey: boolean;
  /** Extra non-secret fields stored in the connection's `config` column. */
  fields: CredentialField[];
  baseUrl: {
    required: boolean;
    hint: string;
  };
}

export const PROVIDER_CATALOG: Record<ProviderType, ProviderDefinition> = {
  openai: {
    type: 'openai',
    label: 'OpenAI',
    package: '@ai-sdk/openai',
    requiresApiKey: true,
    fields: [],
    baseUrl: {
      required: false,
      hint: 'Leave empty for api.openai.com. Set it to point at a proxy.',
    },
  },
  azure: {
    type: 'azure',
    label: 'Azure OpenAI',
    package: '@ai-sdk/azure',
    requiresApiKey: true,
    fields: [],
    baseUrl: {
      required: true,
      hint: 'e.g. https://<resource>.services.ai.azure.com/openai/v1 — the /v1 segment is added automatically if you omit it.',
    },
  },
  anthropic: {
    type: 'anthropic',
    label: 'Anthropic',
    package: '@ai-sdk/anthropic',
    requiresApiKey: true,
    fields: [],
    baseUrl: { required: false, hint: 'Leave empty for api.anthropic.com.' },
  },
  google: {
    type: 'google',
    label: 'Google Gemini',
    package: '@ai-sdk/google',
    requiresApiKey: true,
    fields: [],
    baseUrl: { required: false, hint: 'Leave empty for the default Generative Language endpoint.' },
  },
  'openai-compatible': {
    type: 'openai-compatible',
    label: 'OpenAI-compatible',
    package: '@ai-sdk/openai-compatible',
    requiresApiKey: false,
    fields: [
      {
        name: 'name',
        label: 'Provider name',
        required: false,
        placeholder: 'ollama',
        hint: 'Used only for logging and error messages.',
      },
    ],
    baseUrl: {
      required: true,
      hint: 'Full base URL including any version segment, e.g. http://localhost:11434/v1 for Ollama.',
    },
  },
};

export const PROVIDER_TYPES = Object.keys(PROVIDER_CATALOG) as ProviderType[];

export const isProviderType = (value: unknown): value is ProviderType =>
  typeof value === 'string' && value in PROVIDER_CATALOG;

/**
 * Normalises a stored base URL into the form the AI SDK adapter expects.
 *
 * Azure needs care. `@ai-sdk/azure` appends `/v1{path}` only when it recognises the host as an
 * Azure OpenAI one; against the newer AI Foundry domain (`*.services.ai.azure.com`) it treats the
 * URL as a custom gateway and appends nothing, producing `/openai/chat/completions` — a 404. This
 * was observed against a live resource, not inferred. So for Azure the `/v1` segment is ensured
 * here, which is correct for both the classic and Foundry domains.
 *
 * Trailing slashes are always stripped: the adapters concatenate paths directly, so a stored
 * `.../openai/` would produce a double slash.
 */
export const normalizeBaseUrl = (
  type: ProviderType,
  rawBaseUrl: string | null | undefined
): string | null => {
  const trimmed = (rawBaseUrl ?? '').trim().replace(/\/+$/, '');

  if (trimmed === '') {
    return null;
  }

  if (type !== 'azure') {
    return trimmed;
  }

  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
};
