// @vitest-environment jsdom
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { render } from '../testing/render';
import { PluginIcon } from './PluginIcon';

const svg = (container: HTMLElement) => container.querySelector('svg') as SVGSVGElement;

describe('PluginIcon', () => {
  it('renders at the size Strapi icons use', () => {
    const { container } = render(<PluginIcon />);

    expect(svg(container).getAttribute('width')).toBe('16');
    expect(svg(container).getAttribute('height')).toBe('16');
  });

  /**
   * The reason the artwork's hardcoded fill was removed. Inheriting the colour is what lets one
   * icon work in both themes and pick up the colour of the button it sits inside.
   */
  it('takes its colour from whatever it sits in', () => {
    const { container } = render(<PluginIcon />);

    expect(svg(container).getAttribute('fill')).toBe('currentColor');
    expect(container.innerHTML).not.toMatch(/#6C6556/i);
  });

  it('lets a caller override the size and colour', () => {
    const { container } = render(<PluginIcon width={32} height={32} fill="red" />);

    expect(svg(container).getAttribute('width')).toBe('32');
    expect(svg(container).getAttribute('fill')).toBe('red');
  });

  it('passes other props through, so it can be labelled or hidden from a screen reader', () => {
    const { container } = render(<PluginIcon aria-hidden="true" data-testid="mark" />);

    expect(svg(container).getAttribute('aria-hidden')).toBe('true');
    expect(svg(container).getAttribute('data-testid')).toBe('mark');
  });

  it('forwards a ref to the svg itself', () => {
    const ref = createRef<SVGSVGElement>();
    render(<PluginIcon ref={ref} />);

    expect(ref.current?.tagName.toLowerCase()).toBe('svg');
  });

  /**
   * This mark renders three times on one page — the menu entry, the edit-view button and the bulk
   * action. The artwork's clip paths carried document-wide ids, which would have been duplicated
   * once per instance. They were exact bounding boxes of what they clipped, so nothing was lost.
   */
  it('carries no ids, so three of them on a page cannot collide', () => {
    const { container } = render(
      <>
        <PluginIcon />
        <PluginIcon />
        <PluginIcon />
      </>
    );

    // Scoped to the icons: the design-system provider renders its own live region with an id.
    expect(container.querySelectorAll('svg[id], svg [id]')).toHaveLength(0);
    expect(container.innerHTML).not.toMatch(/clipPath|url\(#/);
  });

  it('draws the whole mark, globe and sparkles', () => {
    const { container } = render(<PluginIcon />);

    expect(container.querySelectorAll('path')).toHaveLength(4);
  });
});
