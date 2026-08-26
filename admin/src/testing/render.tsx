/**
 * Test-only render helper for admin components.
 *
 * Strapi's design-system components need their provider for theming, and every user-facing string
 * goes through `formatMessage`, so both wrappers are required for a component to render at all.
 * `defaultMessage` is used directly rather than loading `en.json`: a test should fail because the
 * behaviour changed, not because a translation key was renamed.
 */
import { DesignSystemProvider } from '@strapi/design-system';
import { cleanup, render as rtlRender } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach } from 'vitest';

import type { ReactElement } from 'react';

// Testing Library only registers its own cleanup when a global `afterEach` exists, and this project
// does not enable vitest globals. Without this, every render stacks on the last one and queries fail
// with "found multiple elements" — which looks like a component bug and is not one.
afterEach(cleanup);

export const render = (ui: ReactElement) =>
  rtlRender(
    <DesignSystemProvider>
      <IntlProvider locale="en" messages={{}} onError={() => {}}>
        {ui}
      </IntlProvider>
    </DesignSystemProvider>
  );

/**
 * Strapi's `Checkbox` is a Radix button carrying `aria-checked`, not an `<input>`, so `.checked` is
 * undefined on it. Read the state the component actually exposes.
 */
export const isChecked = (element: HTMLElement): boolean =>
  element.getAttribute('aria-checked') === 'true';

export { screen, fireEvent, waitFor } from '@testing-library/react';
