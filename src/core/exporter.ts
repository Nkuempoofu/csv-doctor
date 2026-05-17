/**
 * Export — turn cleaned rows into a downloadable CSV file.
 *
 * We use Papa Parse's `unparse()` (it handles all the quoting/escaping
 * edge cases correctly) and trigger a browser download via Blob URL.
 */

import Papa from 'papaparse';
import type { ParsedFile, Row } from '../types';

export function exportCsv(
  file: ParsedFile,
  rows: Row[],
  filename: string,
  delimiter: string = file.delimiter,
  headers: string[] = file.headers
): void {
  const csv = Papa.unparse(
    {
      fields: headers,
      data: rows,
    },
    {
      delimiter,
      quotes: false, // only quote when necessary (default Papa behaviour)
      newline: '\r\n',
    }
  );

  // Add UTF-8 BOM so Excel opens it correctly on Windows.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 250);
}

/** Build a sensible default filename: original-cleaned.csv */
export function suggestFilename(originalName: string): string {
  const base = originalName.replace(/\.(csv|tsv|txt)$/i, '');
  return `${base}-cleaned.csv`;
}

/** Pure: convert rows → array of {header: value} objects for JSON export. */
export function buildJsonObjects(
  rows: Row[],
  headers: string[]
): Record<string, string>[] {
  return rows.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

export function suggestJsonFilename(originalName: string): string {
  const base = originalName.replace(/\.(csv|tsv|txt)$/i, '');
  return `${base}-cleaned.json`;
}

export function suggestXlsxFilename(originalName: string): string {
  const base = originalName.replace(/\.(csv|tsv|txt)$/i, '');
  return `${base}-cleaned.xlsx`;
}

export function exportJson(
  file: ParsedFile,
  rows: Row[],
  filename: string,
  headers: string[] = file.headers
): void {
  const json = JSON.stringify(buildJsonObjects(rows, headers), null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 250);
}
