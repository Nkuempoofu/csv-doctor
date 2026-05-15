/**
 * Shared type definitions for CSV Doctor.
 *
 * The data model is intentionally simple: rows are arrays of cell strings,
 * keyed by header name. We never coerce types at parse time — keeping cells
 * as strings preserves the user's original data faithfully and lets the
 * analyzer reason about format inconsistencies without losing information.
 */

export type Cell = string;
export type Row = Cell[];

export interface ParsedFile {
  filename: string;
  size: number;          // bytes
  delimiter: string;     // detected delimiter (comma, tab, semicolon, pipe)
  encoding: string;      // declared encoding (we read as UTF-8)
  headers: string[];
  rows: Row[];
  rawText: string;       // original file content — used for re-export
}

/** A single issue category the analyzer can detect. */
export type IssueId =
  | 'empty-rows'
  | 'duplicate-rows'
  | 'whitespace'
  | 'mixed-case'
  | 'mixed-types'
  | 'mixed-dates'
  | 'mixed-booleans'
  | 'special-chars'
  | 'currency-numbers'
  | 'header-issues'
  | 'contact-formats'
  | 'sparse-columns';

export interface Issue {
  id: IssueId;
  label: string;             // user-facing name
  description: string;       // explanation of what this fixes
  severity: 'low' | 'medium' | 'high';
  count: number;             // how many rows/cells affected
  affectedColumns: string[]; // header names where issue appears
  enabled: boolean;          // user-toggleable
}

/** A single change applied during cleaning — used to build the "diff" view. */
export interface CellChange {
  rowIndex: number;
  colIndex: number;
  before: Cell;
  after: Cell;
  reason: IssueId;
}

export interface CleanResult {
  rows: Row[];
  removedRowIndices: number[];   // rows dropped (e.g., empty / duplicate)
  changes: CellChange[];         // cell-level edits applied
  appliedFixes: IssueId[];       // which issue categories were applied
  cleanedHeaders?: string[];     // present when header-issues or sparse-columns was applied
}

export interface AnalyzerState {
  parsed: ParsedFile | null;
  issues: Issue[];
}
