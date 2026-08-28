import { describe, expect, it } from 'vitest';

import { badgeVariantFor } from './jobBadge';

const progress = (over: Partial<{ translated: number; skipped: number; failed: number }> = {}) => ({
  translated: 0,
  skipped: 0,
  failed: 0,
  ...over,
});

describe('badgeVariantFor', () => {
  /** Green claims everything worked, so it has to mean exactly that. */
  it('is green only when every item was translated', () => {
    expect(badgeVariantFor('completed', progress({ translated: 3 }))).toBe('success');
  });

  it('is yellow for a completed run that skipped anything', () => {
    expect(badgeVariantFor('completed', progress({ translated: 2, skipped: 1 }))).toBe('warning');
  });

  it('is yellow for a completed run that translated nothing at all', () => {
    expect(badgeVariantFor('completed', progress({ skipped: 3 }))).toBe('warning');
  });

  /**
   * A run is called completed as soon as anything translated, so a partial failure wears that
   * label. Green would claim more than happened.
   */
  it('is red for a completed run that failed anything', () => {
    expect(badgeVariantFor('completed', progress({ translated: 4, failed: 2 }))).toBe('danger');
  });

  /** A failure is what somebody has to act on, so it outranks a skip in the same run. */
  it('prefers red over yellow when a run both failed and skipped', () => {
    expect(badgeVariantFor('completed', progress({ translated: 1, skipped: 1, failed: 1 }))).toBe(
      'danger'
    );
  });

  it('is red for a run that failed outright', () => {
    expect(badgeVariantFor('failed', progress({ failed: 2 }))).toBe('danger');
  });

  /** Matches the per-item skipped badge, so a run and its contents agree about the same fact. */
  it('is yellow for a run recorded as skipped', () => {
    expect(badgeVariantFor('skipped', progress({ skipped: 1 }))).toBe('warning');
  });

  it('leaves a run with no outcome yet uncoloured by its progress', () => {
    expect(badgeVariantFor('queued', progress())).toBe('secondary');
    expect(badgeVariantFor('processing', progress({ translated: 1, skipped: 1 }))).toBe(
      'alternative'
    );
  });
});
