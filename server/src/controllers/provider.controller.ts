import { PROVIDER_CATALOG } from '../config/provider-catalog';
import {
  formatZodError,
  providerCreateSchema,
  providerUpdateSchema,
  testConnectionSchema,
} from '../validation/provider';

import type { Context } from 'koa';

const store = () => strapi.plugin('ai-bulk-translate').service('provider-store');
const registry = () => strapi.plugin('ai-bulk-translate').service('provider-registry');
const crypto = () => strapi.plugin('ai-bulk-translate').service('crypto');

const badRequest = (ctx: Context, message: string) => {
  ctx.status = 400;
  ctx.body = { error: { message } };
};

const providerController = {
  /** The catalog drives the settings form, so the browser needs it to render fields. */
  async catalog(ctx: Context) {
    ctx.body = {
      providers: Object.values(PROVIDER_CATALOG),
      encryptionAvailable: crypto().isAvailable(),
    };
  },

  async find(ctx: Context) {
    ctx.body = { data: await store().findAll() };
  },

  async create(ctx: Context) {
    const parsed = providerCreateSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      return badRequest(ctx, formatZodError(parsed.error));
    }

    if (!crypto().isAvailable() && parsed.data.apiKey) {
      return badRequest(
        ctx,
        'This Strapi project has no admin encryption key configured, so API keys cannot be stored ' +
          'safely. Set ENCRYPTION_KEY and wire it through config/admin as secrets.encryptionKey.'
      );
    }

    try {
      ctx.status = 201;
      ctx.body = { data: await store().create(parsed.data) };
    } catch (error) {
      badRequest(ctx, error instanceof Error ? error.message : 'Could not create provider');
    }
  },

  async update(ctx: Context) {
    const parsed = providerUpdateSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      return badRequest(ctx, formatZodError(parsed.error));
    }

    if (!crypto().isAvailable() && parsed.data.apiKey) {
      return badRequest(ctx, 'No admin encryption key configured; API keys cannot be stored.');
    }

    try {
      ctx.body = { data: await store().update(Number(ctx.params.id), parsed.data) };
    } catch (error) {
      badRequest(ctx, error instanceof Error ? error.message : 'Could not update provider');
    }
  },

  async delete(ctx: Context) {
    await store().delete(Number(ctx.params.id));
    ctx.status = 204;
  },

  /** Makes a real minimal model call. See provider-registry.testConnection for why. */
  async test(ctx: Context) {
    const parsed = testConnectionSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      return badRequest(ctx, formatZodError(parsed.error));
    }

    const row = await store().findRaw(Number(ctx.params.id));

    if (!row) {
      ctx.status = 404;
      ctx.body = { error: { message: 'Provider not found' } };
      return;
    }

    ctx.body = await registry().testConnection(row, parsed.data.modelId);
  },
};

export default providerController;
