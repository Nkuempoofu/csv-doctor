import { describe, it, expect } from 'vitest';
import { makeFile } from './helpers';

describe('analyzer setup', () => {
  it('makeFile creates a valid ParsedFile', () => {
    const f = makeFile(['A'], [['1'], ['2']]);
    expect(f.headers).toEqual(['A']);
    expect(f.rows.length).toBe(2);
  });
});
