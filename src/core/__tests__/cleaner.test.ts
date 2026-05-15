import { describe, it, expect } from 'vitest';
import { makeFile } from './helpers';

describe('cleaner setup', () => {
  it('makeFile creates a valid ParsedFile', () => {
    const f = makeFile(['A'], [['1']]);
    expect(f.rows[0][0]).toBe('1');
  });
});
