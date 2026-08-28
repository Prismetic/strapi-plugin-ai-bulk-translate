// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { tabForPath } from './PluginHeader';

describe('tabForPath', () => {
  it('reads the settings tab from the plugin root', () => {
    expect(tabForPath('/plugins/ai-bulk-translate')).toBe('settings');
  });

  it('reads the jobs tab from the jobs route', () => {
    expect(tabForPath('/plugins/ai-bulk-translate/jobs')).toBe('jobs');
  });

  /** A trailing slash is the same page, and Strapi's own links are not consistent about it. */
  it('ignores a trailing slash', () => {
    expect(tabForPath('/plugins/ai-bulk-translate/jobs/')).toBe('jobs');
    expect(tabForPath('/plugins/ai-bulk-translate/')).toBe('settings');
  });

  /** Anything unrecognised is the settings tab, which is the route that always exists. */
  it('falls back to settings for anything else', () => {
    expect(tabForPath('/plugins/ai-bulk-translate/something-else')).toBe('settings');
  });
});
