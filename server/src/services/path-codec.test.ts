import { describe, expect, it } from 'vitest';

import { readPath, reinject, writePath } from './path-codec';

describe('readPath', () => {
  it('reads a top-level key', () => {
    expect(readPath({ Name: 'Turtle Bay' }, 'Name')).toBe('Turtle Bay');
  });

  it('reads through nested objects and array indices', () => {
    const doc = { Sections: [{ Heading: 'One' }, { Heading: 'Two' }] };

    expect(readPath(doc, 'Sections.1.Heading')).toBe('Two');
  });

  it('returns undefined for a path that does not exist rather than throwing', () => {
    expect(readPath({ Name: 'x' }, 'Missing.deeply.0.nested')).toBeUndefined();
  });
});

describe('writePath', () => {
  it('writes a top-level key', () => {
    const doc: Record<string, unknown> = { Name: 'Turtle Bay' };
    writePath(doc, 'Name', 'Bahía Turtle');

    expect(doc.Name).toBe('Bahía Turtle');
  });

  it('writes through nested objects and array indices', () => {
    const doc = { Sections: [{ Heading: 'One' }, { Heading: 'Two' }] };
    writePath(doc, 'Sections.1.Heading', 'Dos');

    expect(doc.Sections[1].Heading).toBe('Dos');
    expect(doc.Sections[0].Heading).toBe('One');
  });

  /**
   * A translated value must never invent structure. If the path is gone the write is dropped:
   * the document changed under us, and guessing at a shape would corrupt it.
   */
  it('drops a write whose parent path is missing', () => {
    const doc: Record<string, unknown> = { Name: 'x' };
    writePath(doc, 'Sections.0.Heading', 'nope');

    expect(doc).toEqual({ Name: 'x' });
  });
});

describe('reinject', () => {
  it('returns a clone with the translated values applied', () => {
    const source = { Name: 'Turtle Bay', Path: '/turtle-bay' };
    const result = reinject(source, { Name: 'Bahía Turtle' });

    expect(result).toEqual({ Name: 'Bahía Turtle', Path: '/turtle-bay' });
  });

  it('does not mutate the source document', () => {
    const source = { Name: 'Turtle Bay', Nested: { Heading: 'One' } };
    const result = reinject(source, { Name: 'Bahía Turtle', 'Nested.Heading': 'Uno' });

    expect(source).toEqual({ Name: 'Turtle Bay', Nested: { Heading: 'One' } });
    expect(result.Nested).toEqual({ Heading: 'Uno' });
  });

  it('leaves untouched paths exactly as they were, including media and relations', () => {
    const source = {
      Name: 'Turtle Bay',
      Cover: { id: 7, url: '/uploads/cove.jpg' },
      Author: { id: 3 },
    };
    const result = reinject(source, { Name: 'Bahía Turtle' });

    expect(result.Cover).toEqual({ id: 7, url: '/uploads/cove.jpg' });
    expect(result.Author).toEqual({ id: 3 });
  });

  it('ignores a translated path that no longer exists in the document', () => {
    const result = reinject({ Name: 'Turtle Bay' }, { Name: 'Bahía Turtle', Gone: 'ignored' });

    expect(result).toEqual({ Name: 'Bahía Turtle' });
  });
});
