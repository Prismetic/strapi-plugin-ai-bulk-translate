import { describe, expect, it, vi } from 'vitest';

import { publishMonitor } from './monitor-middleware';

const article = {
  contentType: 'api::article.article',
  enabled: true,
  locales: [{ code: 'ar', overwriteContent: false, overwriteManualEdits: false }],
};

const strapiStub = ({
  monitored = { 'api::article.article': article },
  defaultLocale = 'en' as string | undefined,
  start = vi.fn(),
  monitoredFn,
}: {
  monitored?: Record<string, unknown>;
  defaultLocale?: string;
  start?: ReturnType<typeof vi.fn>;
  monitoredFn?: ReturnType<typeof vi.fn>;
} = {}) => {
  const readMonitored = monitoredFn ?? vi.fn().mockResolvedValue(monitored);
  const error = vi.fn();

  const strapi = {
    log: { error, info: vi.fn() },
    plugin: (name: string) => {
      if (name === 'i18n') {
        return { service: () => ({ getDefaultLocale: async () => defaultLocale }) };
      }

      return {
        service: (service: string) =>
          service === 'monitor-config' ? { monitored: readMonitored } : { start },
      };
    },
  };

  return { strapi, start, readMonitored, error };
};

const publish = (over: Record<string, unknown> = {}) => ({
  action: 'publish',
  uid: 'api::article.article',
  params: { documentId: 'abc123', locale: 'en' },
  ...over,
});

describe('publishMonitor', () => {
  it('starts a run when a monitored default locale is published', async () => {
    const { strapi, start } = strapiStub();
    const next = vi.fn().mockResolvedValue({ documentId: 'abc123' });

    await publishMonitor(strapi as never)(publish(), next);

    expect(start).toHaveBeenCalledWith({
      contentType: 'api::article.article',
      documentId: 'abc123',
      sourceLocale: 'en',
      targetLocales: ['ar'],
    });
  });

  /**
   * The cheap path, and the one that matters most: this middleware sees every find and every
   * update in the host. Anything that is not a publish must not read the configuration at all.
   */
  it('does not even look at the configuration for other actions', async () => {
    const { strapi, readMonitored, start } = strapiStub();
    const next = vi.fn().mockResolvedValue([]);

    for (const action of ['findMany', 'findOne', 'update', 'create', 'delete', 'unpublish']) {
      await publishMonitor(strapi as never)({ ...publish(), action }, next);
    }

    expect(readMonitored).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(6);
  });

  it('starts nothing for a content type nobody monitors', async () => {
    const { strapi, start } = strapiStub();

    await publishMonitor(strapi as never)(publish({ uid: 'api::page.page' }), vi.fn());

    expect(start).not.toHaveBeenCalled();
  });

  it('stops before asking i18n anything when nothing is monitored at all', async () => {
    const getDefaultLocale = vi.fn();
    const { strapi, start } = strapiStub({ monitored: {} });
    (strapi as { plugin: unknown }).plugin = (name: string) =>
      name === 'i18n'
        ? { service: () => ({ getDefaultLocale }) }
        : { service: () => ({ monitored: async () => ({}), start }) };

    await publishMonitor(strapi as never)(publish(), vi.fn());

    expect(getDefaultLocale).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('passes through whatever publish returned, untouched', async () => {
    const { strapi } = strapiStub();
    const published = { documentId: 'abc123', locale: 'en' };

    const result = await publishMonitor(strapi as never)(
      publish(),
      vi.fn().mockResolvedValue(published)
    );

    expect(result).toBe(published);
  });

  /** Publishing must not fail because the plugin could not read its own configuration. */
  it('never lets its own failure escape into the publish', async () => {
    const { strapi, error } = strapiStub({
      monitoredFn: vi.fn().mockRejectedValue(new Error('store unavailable')),
    });
    const published = { documentId: 'abc123' };

    const result = await publishMonitor(strapi as never)(
      publish(),
      vi.fn().mockResolvedValue(published)
    );

    expect(result).toBe(published);
    expect(error).toHaveBeenCalled();
  });

  /** A publish that failed is not a publish, and must not translate anything. */
  it('does not run when the publish itself throws', async () => {
    const { strapi, start } = strapiStub();
    const next = vi.fn().mockRejectedValue(new Error('validation failed'));

    await expect(publishMonitor(strapi as never)(publish(), next)).rejects.toThrow(
      'validation failed'
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('decides only after the publish has actually happened', async () => {
    const order: string[] = [];
    const { strapi, start } = strapiStub({
      start: vi.fn(() => {
        order.push('translate');
      }),
    });

    await publishMonitor(strapi as never)(
      publish(),
      vi.fn().mockImplementation(async () => {
        order.push('publish');

        return {};
      })
    );

    expect(order).toEqual(['publish', 'translate']);
    expect(start).toHaveBeenCalled();
  });
});
