import type { ParsedFile } from '../../types';

export function makeFile(headers: string[], rows: string[][]): ParsedFile {
  return {
    filename: 'test.csv',
    size: 0,
    delimiter: ',',
    encoding: 'UTF-8',
    headers,
    rows,
    rawText: '',
  };
}
