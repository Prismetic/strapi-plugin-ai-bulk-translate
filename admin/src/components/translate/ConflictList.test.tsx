// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { fireEvent, isChecked, render, screen } from '../../testing/render';
import { ConflictList } from './ConflictList';

import type { Conflict } from '../../utils/outcome';

const conflicts: Conflict[] = [
  { documentId: 'a', title: 'Accommodation', locales: ['de'] },
  { documentId: 'b', title: 'Dining', locales: ['de', 'fr'] },
];

const noop = () => {};

describe('ConflictList', () => {
  it('renders nothing when there are no conflicts', () => {
    render(
      <ConflictList
        conflicts={[]}
        authorised={[]}
        onToggle={noop}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );

    // Asserted on what the component contributes, not on an empty container: the design-system
    // provider renders a node of its own, so the container is never bare.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/left alone unless you tick them/)).toBeNull();
  });

  it('gives every conflicting entry its own checkbox, unchecked by default', () => {
    render(
      <ConflictList
        conflicts={conflicts}
        authorised={[]}
        onToggle={noop}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );

    const boxes = screen.getAllByRole('checkbox');

    expect(boxes).toHaveLength(2);
    expect(boxes.some(isChecked)).toBe(false);
  });

  it('names the entry and the specific locales that would be overwritten', () => {
    render(
      <ConflictList
        conflicts={conflicts}
        authorised={[]}
        onToggle={noop}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );

    expect(screen.getByText('Overwrite Accommodation in de')).toBeTruthy();
    expect(screen.getByText('Overwrite Dining in de, fr')).toBeTruthy();
  });

  it('shows an entry as checked only when it is authorised', () => {
    render(
      <ConflictList
        conflicts={conflicts}
        authorised={['b']}
        onToggle={noop}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );

    const [first, second] = screen.getAllByRole('checkbox');

    expect(isChecked(first)).toBe(false);
    expect(isChecked(second)).toBe(true);
  });

  it('reports which entry was toggled', () => {
    const onToggle = vi.fn();

    render(
      <ConflictList
        conflicts={conflicts}
        authorised={[]}
        onToggle={onToggle}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );

    fireEvent.click(screen.getAllByRole('checkbox')[1]);

    expect(onToggle).toHaveBeenCalledWith('b');
  });

  it('offers select-all while anything is still unticked', () => {
    const onSelectAll = vi.fn();

    render(
      <ConflictList
        conflicts={conflicts}
        authorised={['a']}
        onToggle={noop}
        onSelectAll={onSelectAll}
        onClearAll={noop}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));

    expect(onSelectAll).toHaveBeenCalled();
  });

  /**
   * Once everything is ticked the same control has to become the way back out. Leaving it as
   * "select all" would make a full refresh a one-way door.
   */
  it('turns into clear-all once every entry is authorised', () => {
    const onClearAll = vi.fn();

    render(
      <ConflictList
        conflicts={conflicts}
        authorised={['a', 'b']}
        onToggle={noop}
        onSelectAll={noop}
        onClearAll={onClearAll}
      />
    );

    expect(screen.queryByRole('button', { name: 'Select all' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(onClearAll).toHaveBeenCalled();
  });

  it('says plainly that untouched entries are left alone', () => {
    render(
      <ConflictList
        conflicts={conflicts}
        authorised={[]}
        onToggle={noop}
        onSelectAll={noop}
        onClearAll={noop}
      />
    );

    expect(screen.getByText(/left alone unless you tick them/)).toBeTruthy();
  });
});
