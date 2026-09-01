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
   * The reason the clip ids are generated rather than taken from the artwork. This mark renders
   * three times on one page — the menu entry, the edit-view button and the bulk action — and the
   * artwork ships fixed ids, so three copies would put duplicates in the document and every
   * `url(#…)` would resolve to whichever came first.
   */
  it('gives every instance its own clip ids', () => {
    const { container } = render(
      <>
        <PluginIcon />
        <PluginIcon />
        <PluginIcon />
      </>
    );

    const ids = [...container.querySelectorAll('clipPath[id]')].map((node) => node.id);

    expect(ids.length).toBe(9);
    expect(new Set(ids).size).toBe(9);
  });

  it('points every clip at an id that exists in the same instance', () => {
    const { container } = render(<PluginIcon />);

    const defined = new Set([...container.querySelectorAll('clipPath[id]')].map((n) => n.id));
    const referenced = [...container.querySelectorAll('[clip-path]')].map((node) =>
      (node.getAttribute('clip-path') ?? '').replace(/^url\(#|\)$/g, '')
    );

    expect(referenced.length).toBeGreaterThan(0);
    for (const reference of referenced) {
      expect(defined.has(reference)).toBe(true);
    }
  });

  it('draws the whole mark, globe and sparkles', () => {
    const { container } = render(<PluginIcon />);

    expect(container.querySelectorAll('path')).toHaveLength(6);
  });
});
