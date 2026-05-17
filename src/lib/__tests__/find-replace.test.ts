import { describe, it, expect } from 'vitest';
import { applyFindReplace } from '../find-replace';
import type { FindReplaceRule } from '../../types';

describe('applyFindReplace', () => {
  it('replaces a whole-cell match (case-insensitive)', () => {
    const rows    = [['Jhb'], ['Cape Town']];
    const headers = ['City'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: 'Jhb', replace: 'Johannesburg',
        caseSensitive: false, wholeCell: true },
    ];
    const { rows: result, changes } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('Johannesburg');
    expect(result[1][0]).toBe('Cape Town');
    expect(changes).toHaveLength(1);
  });

  it('replaces a substring match', () => {
    const rows    = [['Mr. Smith'], ['Dr. Jones']];
    const headers = ['Name'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: 'Mr. ', replace: 'Mr ',
        caseSensitive: false, wholeCell: false },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('Mr Smith');
    expect(result[1][0]).toBe('Dr. Jones');
  });

  it('respects case sensitivity', () => {
    const rows    = [['hello'], ['HELLO']];
    const headers = ['Greeting'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: 'hello', replace: 'hi',
        caseSensitive: true, wholeCell: false },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('hi');
    expect(result[1][0]).toBe('HELLO');
  });

  it('restricts replacement to the specified column', () => {
    const rows    = [['London', 'London']];
    const headers = ['City', 'Country'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: 'City', find: 'London', replace: 'NYC',
        caseSensitive: false, wholeCell: true },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('NYC');
    expect(result[0][1]).toBe('London');
  });

  it('applies rules in order (second rule sees output of first)', () => {
    const rows    = [['foo']];
    const headers = ['X'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: 'foo', replace: 'bar', caseSensitive: false, wholeCell: false },
      { id: '2', column: '', find: 'bar', replace: 'baz', caseSensitive: false, wholeCell: false },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('baz');
  });

  it('returns original rows and empty changes when rules array is empty', () => {
    const rows    = [['test']];
    const headers = ['Col'];
    const { rows: result, changes } = applyFindReplace(rows, headers, []);
    expect(result).toEqual(rows);
    expect(changes).toHaveLength(0);
  });

  it('skips rules with empty find string', () => {
    const rows    = [['test']];
    const headers = ['Col'];
    const rules: FindReplaceRule[] = [
      { id: '1', column: '', find: '', replace: 'NOPE', caseSensitive: false, wholeCell: false },
    ];
    const { rows: result } = applyFindReplace(rows, headers, rules);
    expect(result[0][0]).toBe('test');
  });
});
