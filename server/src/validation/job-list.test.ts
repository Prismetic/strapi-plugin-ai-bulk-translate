import { describe, expect, it } from 'vitest';

import { NEEDS_ATTENTION, jobListQuerySchema } from './job-list';

const parse = (query: unknown) => jobListQuerySchema.parse(query);

describe('jobListQuerySchema', () => {
  it('defaults to the runs a person might act on', () => {
    expect(parse({}).status).toEqual(NEEDS_ATTENTION);
  });

  it('defaults to the first page', () => {
    expect(parse({})).toMatchObject({ page: 1, pageSize: 20 });
  });

  /** Koa gives an array when a parameter repeats, and a string when it does not. */
  it('accepts a repeated status parameter', () => {
    expect(parse({ status: ['queued', 'failed'] }).status).toEqual(['queued', 'failed']);
  });

  it('accepts a single status as a bare string', () => {
    expect(parse({ status: 'completed' }).status).toEqual(['completed']);
  });

  it('accepts a comma-separated list, which is how a filtered URL reads', () => {
    expect(parse({ status: 'queued,processing,failed' }).status).toEqual(NEEDS_ATTENTION);
  });

  it('refuses a status that is not a job status', () => {
    expect(() => parse({ status: 'nearly-done' })).toThrow();
  });

  it('refuses an empty status list rather than silently showing everything', () => {
    expect(() => parse({ status: '' })).toThrow();
  });

  it('coerces numeric strings, since query parameters are always strings', () => {
    expect(parse({ page: '3', pageSize: '50' })).toMatchObject({ page: 3, pageSize: 50 });
  });

  /** A page size nobody asked for is a way to pull the whole table in one request. */
  it('caps the page size', () => {
    expect(() => parse({ pageSize: '5000' })).toThrow();
  });

  it('refuses a page below the first', () => {
    expect(() => parse({ page: '0' })).toThrow();
  });
});
