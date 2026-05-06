/**
 * CSV parsing. Wraps Papa Parse to normalise the result into our internal
 * ParsedFile shape, with delimiter auto-detection and a forgiving config
 * that handles common real-world CSV quirks (BOM, irregular quoting, etc.).
 */

import Papa from 'papaparse';
import type { ParsedFile, Row } from '../types';

interface ParseOptions {
  filename: string;
  size: number;
}

/**
 * Parse a CSV string into structured rows.
 *
 * @param text Raw file text (already decoded as UTF-8).
 * @param opts Filename + size for metadata.
 */
export function parseCsv(text: string, opts: ParseOptions): ParsedFile {
  const trimmedBom = text.replace(/^﻿/, ''); // strip BOM if present

  const result = Papa.parse<string[]>(trimmedBom, {
    skipEmptyLines: false,    // we want to detect them as an issue
    delimiter: '',            // empty = auto-detect
    transform: (v) => v,      // never coerce types — strings only
  });

  // Pull out the detected delimiter so we can show it in the UI.
  const delimiter = result.meta.delimiter || ',';

  const allRows = (result.data as string[][]).filter(
    // Some parsers emit [""] for a final newline — drop those one-cell empties.
    (r) => !(r.length === 1 && r[0] === '')
  );

  if (allRows.length === 0) {
    throw new Error('The file is empty or could not be parsed.');
  }

  const [headers, ...rows] = allRows;

  // Pad short rows with empty strings so all rows have the same length as headers.
  const normalised: Row[] = rows.map((r) => {
    const padded = [...r];
    while (padded.length < headers.length) padded.push('');
    if (padded.length > headers.length) padded.length = headers.length;
    return padded;
  });

  return {
    filename: opts.filename,
    size:     opts.size,
    delimiter,
    encoding: 'utf-8',
    headers:  headers.map((h) => h ?? ''),
    rows:     normalised,
    rawText:  text,
  };
}

/** Read a File object as text using the FileReader API. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file, 'utf-8');
  });
}
