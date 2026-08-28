import { describe, expect, it } from 'vitest';

import { localeLabel } from './localeLabel';

describe('localeLabel', () => {
  /**
   * i18n stores a display name that usually already carries a parenthetical — "Arabic (ar)".
   * Appending the code to it produced "Arabic (ar) (ar)", which shipped.
   */
  it('shows the name the administrator configured', () => {
    expect(localeLabel({ code: 'ar', name: 'Arabic (ar)' })).toBe('Arabic (ar)');
  });

  /**
   * And the parenthetical is not always the code: `zh-CN` is named "Chinese (cn)" on the
   * verification host. Stripping what looks like a code would be wrong as often as it was right.
   */
  it('does not try to unpick the name', () => {
    expect(localeLabel({ code: 'zh-CN', name: 'Chinese (cn)' })).toBe('Chinese (cn)');
  });

  it('falls back to the code when there is no name', () => {
    expect(localeLabel({ code: 'fr' })).toBe('fr');
    expect(localeLabel({ code: 'fr', name: '' })).toBe('fr');
    expect(localeLabel({ code: 'fr', name: '   ' })).toBe('fr');
  });
});
