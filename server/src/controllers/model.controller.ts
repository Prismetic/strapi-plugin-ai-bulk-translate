import { modelCreateSchema, modelUpdateSchema } from '../validation/model';
import { formatZodError } from '../validation/provider';

import type { Context } from 'koa';

const store = () => strapi.plugin('ai-bulk-translate').service('model-store');

const badRequest = (ctx: Context, message: string) => {
  ctx.status = 400;
  ctx.body = { error: { message } };
};

const modelController = {
  async find(ctx: Context) {
    ctx.body = { data: await store().findAll() };
  },

  async create(ctx: Context) {
    const parsed = modelCreateSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      return badRequest(ctx, formatZodError(parsed.error));
    }

    try {
      ctx.status = 201;
      ctx.body = { data: await store().create(parsed.data) };
    } catch (error) {
      // The store's refusals — no key, disabled connection — are messages for the operator, so
      // they are passed through rather than flattened into a generic failure.
      badRequest(ctx, error instanceof Error ? error.message : 'Could not register model');
    }
  },

  async update(ctx: Context) {
    const parsed = modelUpdateSchema.safeParse(ctx.request.body);

    if (!parsed.success) {
      return badRequest(ctx, formatZodError(parsed.error));
    }

    try {
      ctx.body = { data: await store().update(Number(ctx.params.id), parsed.data) };
    } catch (error) {
      badRequest(ctx, error instanceof Error ? error.message : 'Could not update model');
    }
  },

  async delete(ctx: Context) {
    await store().delete(Number(ctx.params.id));
    ctx.status = 204;
  },

  /** Separate from `update` because it mutates every other row, not just this one. */
  async setDefault(ctx: Context) {
    try {
      ctx.body = { data: await store().setDefault(Number(ctx.params.id)) };
    } catch (error) {
      badRequest(ctx, error instanceof Error ? error.message : 'Could not set the default model');
    }
  },
};

export default modelController;
