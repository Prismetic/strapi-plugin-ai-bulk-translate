import { describe, expect, it } from 'vitest';

import { normalizeBaseUrl, PROVIDER_CATALOG, isProviderType } from './provider-catalog';

describe('normalizeBaseUrl', () => {
  it('returns null for empty or whitespace input', () => {
    expect(normalizeBaseUrl('openai', undefined)).toBeNull();
    expect(normalizeBaseUrl('openai', null)).toBeNull();
    expect(normalizeBaseUrl('openai', '   ')).toBeNull();
  });

  it('strips trailing slashes so adapters do not build double slashes', () => {
    expect(normalizeBaseUrl('openai', 'https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1'
    );
    expect(normalizeBaseUrl('openai', 'https://api.example.com/v1///')).toBe(
      'https://api.example.com/v1'
    );
  });

  it('leaves non-Azure providers otherwise untouched', () => {
    expect(normalizeBaseUrl('openai-compatible', 'http://localhost:11434/v1')).toBe(
      'http://localhost:11434/v1'
    );
    expect(normalizeBaseUrl('anthropic', 'https://proxy.internal/anthropic')).toBe(
      'https://proxy.internal/anthropic'
    );
  });

  // Regression guard for a live failure: @ai-sdk/azure only appends /v1 when it recognises the
  // host as Azure OpenAI. Against *.services.ai.azure.com it appends nothing and the request
  // 404s. Verified against a real resource.
  it('appends /v1 for Azure when the base URL lacks it', () => {
    expect(normalizeBaseUrl('azure', 'https://r.services.ai.azure.com/openai')).toBe(
      'https://r.services.ai.azure.com/openai/v1'
    );
  });

  it('appends /v1 for Azure after stripping a trailing slash', () => {
    expect(normalizeBaseUrl('azure', 'https://r.services.ai.azure.com/openai/')).toBe(
      'https://r.services.ai.azure.com/openai/v1'
    );
  });

  it('does not double up when Azure already has a version segment', () => {
    expect(normalizeBaseUrl('azure', 'https://r.services.ai.azure.com/openai/v1')).toBe(
      'https://r.services.ai.azure.com/openai/v1'
    );
    expect(normalizeBaseUrl('azure', 'https://r.openai.azure.com/openai/v2')).toBe(
      'https://r.openai.azure.com/openai/v2'
    );
  });
});

describe('catalog', () => {
  it('keys every entry by its own type', () => {
    for (const [key, definition] of Object.entries(PROVIDER_CATALOG)) {
      expect(definition.type).toBe(key);
    }
  });

  it('requires a base URL wherever there is no sensible default endpoint', () => {
    expect(PROVIDER_CATALOG.azure.baseUrl.required).toBe(true);
    expect(PROVIDER_CATALOG['openai-compatible'].baseUrl.required).toBe(true);
    expect(PROVIDER_CATALOG.openai.baseUrl.required).toBe(false);
  });

  it('recognises only known provider types', () => {
    expect(isProviderType('azure')).toBe(true);
    expect(isProviderType('bedrock')).toBe(false);
    expect(isProviderType(42)).toBe(false);
  });
});
