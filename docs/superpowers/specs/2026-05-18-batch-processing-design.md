# Batch Processing — Design Spec

**Date:** 2026-05-18
**Status:** Approved

---

## Goal

Allow users to load multiple CSV files into CSV Doctor and process them one at a time without re-uploading. Each file retains its own state (issues, cleaned result, filters, find-replace rules) so the user can jump freely between files.

## Approach

**Auto-appearing queue sidebar.** Single-file use is unchanged — the sidebar is hidden when only one file is loaded. When a second file is added, a slim left sidebar slides in automatically, listing all queued files. The main content area continues to work exactly as it does today, operating on whichever file is currently active.

---

## Data Model

### New types in `src/types.ts`

```typescript
export type FileStatus = 'pending' | 'cleaned' | 'downloaded' | 'error';

export interface FileEntry {
  id: string;                  // unique key — Date.now() + Math.random() string
  parsed: ParsedFile;
  issues: Issue[];
  result: CleanResult | null;  // null = not yet cleaned
  prevResult: CleanResult | null;
  filters: FilterSlot[];
  activeColumn: string | null;
  findReplaceRules: FindReplaceRule[];
  findReplaceOpen: boolean;
  status: FileStatus;
  errorMessage?: string;       // present when status === 'error'
}
```

### Restructured `AppState` in `src/main.ts`

```typescript
interface AppState {
  files: FileEntry[];
  activeFileId: string | null;
}
```

A helper `activeFile(): FileEntry | null` computes `state.files.find(f => f.id === state.activeFileId) ?? null`.

Every handler that currently reads `state.parsed`, `state.result`, etc. reads from `activeFile()` instead. The parser, analyzer, cleaner, and exporter are **completely unchanged**.

---

## UI

### Queue sidebar (`src/ui/file-queue.ts` — new file)

Purely presentational. Receives props and emits callbacks; contains no business logic.

```
Props:
  files:        FileEntry[]
  activeFileId: string | null
  onSelect:     (id: string) => void
  onRemove:     (id: string) => void
  onAdd:        () => void          // opens file picker

Renders:
  <aside class="file-queue">
    <ul>  one <li> per FileEntry  </ul>
    <button class="fq-add-btn">+ Add more files</button>
  </aside>
```

Each list item shows:
- File icon + truncated filename
- Status badge (colour-coded)
- Remove (×) button

Active item has a left accent bar. Sidebar width: 220px.

### Status badges

| Status      | Colour      | Meaning                                      |
|-------------|-------------|----------------------------------------------|
| `pending`   | Grey        | Analyzed, not yet cleaned                    |
| `cleaned`   | Green       | `result` is present                          |
| `downloaded`| Muted blue  | At least one download has been triggered     |
| `error`     | Red ⚠       | File failed to parse                         |

### Layout

When `files.length >= 2`: the app's top-level layout switches to `display: flex; flex-direction: row`. The sidebar is 220px wide; the main content fills the remainder. A short CSS transition slides the sidebar in.

When `files.length <= 1`: the sidebar is hidden (`display: none`). No layout change from today.

---

## Interactions

### Adding files

- **First file** — via the existing upload drop zone. Behaviour identical to today. Sidebar stays hidden.
- **Second+ file** — dropped anywhere on the page or via the "+ Add more files" button. Parsed and analyzed immediately. Added to the queue as `pending`. Currently active file stays active (no unwanted navigation).
- Duplicate filenames are allowed (each gets a unique `id`).

### Switching files

- Click a sidebar item → save current state into the active `FileEntry` → set `activeFileId` to the clicked item → re-render.
- No prompt or warning — state is fully preserved per file.

### Removing files

| Scenario | Behaviour |
|---|---|
| Remove active file (not the only one) | Activate nearest neighbour (next, else previous), then remove |
| Remove inactive file | Remove it; active file unaffected |
| Remove the only remaining file | Clear `files` and `activeFileId`; return to upload screen |

### Status transitions

| Event | Status change |
|---|---|
| File added successfully | `pending` |
| "Apply selected fixes" clicked | `cleaned` |
| Any download button clicked | `downloaded` |
| "Undo" clicked | stays `cleaned` |
| "Revert to original" clicked | back to `pending` |
| File fails to parse | `error` |

### Parse errors

Failed files are added to the sidebar with an `error` badge. Clicking them shows a brief error message in the main content area instead of the normal UI. They do not block the rest of the queue.

---

## Files Changed

| File | Change |
|---|---|
| `src/types.ts` | Add `FileStatus`, `FileEntry` |
| `src/main.ts` | Restructure `AppState`; add `activeFile()` helper; update all handlers |
| `src/ui/file-queue.ts` | **New** — queue sidebar component |
| `src/styles.css` | Sidebar styles, status badge styles, flex layout |

The following files are **not changed**: `parser.ts`, `analyzer.ts`, `cleaner.ts`, `exporter.ts`, `report.ts`, `find-replace.ts`, `levenshtein.ts`.

---

## Out of Scope

- "Configure once, apply to all" batch mode (v2)
- ZIP download of all cleaned files (v2)
- Keyboard navigation between queue items (v2)
- File size / count limits (browser RAM handles this naturally)
