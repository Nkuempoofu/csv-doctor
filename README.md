# 🩺 CSV Doctor

> Diagnose and heal messy CSVs in your browser. Drag-drop a file, auto-detect issues, toggle the fixes you want, export pristine data. **Files never leave your browser.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg)](https://vitejs.dev/)
[![No framework](https://img.shields.io/badge/No-framework-10b981.svg)]()

---

## What it does

Drop in a CSV with the kind of mess you actually deal with — empty rows, duplicates, dates in five different formats, "Yes" / "Y" / "1" all meaning the same thing, weird `â€™` artifacts from a bad encoding round-trip — and CSV Doctor finds them all in seconds, lets you toggle which to fix, and exports a clean version.

### Issues detected

| Issue | What it spots |
|---|---|
| 🗑 **Empty rows** | Rows where every cell is blank |
| 📑 **Duplicate rows** | Exact-match duplicates of earlier rows |
| ⎵ **Whitespace** | Leading, trailing, or doubled-up whitespace in cells |
| 🔠 **Inconsistent capitalisation** | Same value in different casings (e.g. "London" + "LONDON") |
| 🔢 **Mixed data types** | Columns mixing numeric / text / blank-equivalents like "N/A" |
| 📅 **Mixed date formats** | Same column using ISO + US + European date formats |
| ✓ **Mixed booleans** | Same column using "Yes/No" + "True/False" + "1/0" |
| 𝒜 **Encoding artifacts** | Mojibake like `â€™` from UTF-8 / cp1252 round-trips |
| 💰 **Currency / number formatting** | Values like `$1,200.00` or `€ 850` that should be plain numbers |
| 🏷 **Header formatting** | Headers with extra whitespace, duplicates, or mixed naming conventions |
| 📞 **Phone / email formats** | Phone numbers in 3+ different formats; invalid email addresses |
| 🕳 **Sparse columns** | Columns that are ≥ 80% empty — candidates for removal |

### In-table analysis

Once a file is loaded, an **Analysis toolbar** appears above the preview table:

- **Filter any column** — low-cardinality columns (≤ 15 unique values) show a dropdown; all others get a text search. Active filters show a *Showing X of Y rows* pill.
- **Click any column header** to select it — a sticky **aggregation footer** appears with Sum, Avg, Count, Min, and Max computed over the currently filtered rows.
- **Download respects filters** — if filters are active, only the matching rows are exported.

### Why it's different

| | Free tools | Paid SaaS | OpenRefine | **CSV Doctor** |
|---|---|---|---|---|
| **Auto-detection** | ❌ Manual | ✅ | ✅ | ✅ |
| **Privacy (no upload)** | Mixed | ❌ Server | ✅ Local app | ✅ **Browser** |
| **Pretty UI** | ❌ | ✅ | ❌ | ✅ |
| **Free + open source** | ✅ | ❌ | ✅ | ✅ |
| **Zero install** | ✅ | ✅ | ❌ | ✅ |
| **Works offline** | ✅ | ❌ | ✅ | ✅ (after first load) |

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite 5** | Instant HMR, tiny output |
| Language | **TypeScript 5** | Strict mode for the data-handling logic |
| Framework | **None** — vanilla DOM | Zero runtime, ~80 KB total bundle |
| CSV parser | **Papa Parse 5** | The de-facto best CSV library in JS |
| Styling | **Plain CSS** with custom properties | No Tailwind needed |

## Project structure

```
csv-doctor/
├── index.html
├── src/
│   ├── main.ts                # entry, state, top-level rendering
│   ├── styles.css             # full design system in one file
│   ├── types.ts               # shared type definitions
│   ├── core/
│   │   ├── parser.ts          # Papa Parse wrapper → ParsedFile
│   │   ├── analyzer.ts        # 8 detectors → list of Issues
│   │   ├── cleaner.ts         # apply selected fixes → CleanResult
│   │   └── exporter.ts        # CleanResult → downloadable CSV
│   ├── ui/
│   │   ├── upload.ts          # drag-drop zone + file picker
│   │   ├── issues-panel.ts    # sidebar with toggleable diagnoses
│   │   ├── preview-table.ts   # data table with diff highlighting
│   │   └── stats.ts           # KPI cards (rows, cols, file size)
│   └── lib/
│       ├── format.ts          # bytes / compact / escapeHtml helpers
│       └── sample.ts          # deliberately-messy demo CSV
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── LICENSE
└── .gitignore
```

## Architecture in one diagram

```
        ┌───────────┐
        │  upload   │  drag-drop / file picker / "Try sample"
        └─────┬─────┘
              │ raw text
              ▼
        ┌───────────┐
        │  parser   │  Papa Parse → { headers, rows, delimiter, … }
        └─────┬─────┘
              │ ParsedFile
              ▼
        ┌───────────┐
        │ analyzer  │  8 detectors → Issue[]
        └─────┬─────┘
              │ Issue[]
              ▼   ┌─────────────────┐
              ├──>│ issues-panel UI │  ← user toggles
              │   └─────────────────┘
              │
              │ user clicks "Apply selected fixes"
              ▼
        ┌───────────┐
        │  cleaner  │  rules engine → { rows, removed, changes }
        └─────┬─────┘
              │ CleanResult
              ▼   ┌─────────────────┐
              ├──>│ preview-table   │  before/after with diff colours
              │   └─────────────────┘
              │
              │ user clicks "Download cleaned"
              ▼
        ┌───────────┐
        │ exporter  │  Papa unparse + Blob → download
        └───────────┘
```

## Getting started

```bash
git clone https://github.com/Nkuempoofu/csv-doctor.git
cd csv-doctor
npm install
npm run dev
```

Opens `http://localhost:5174/`.

## Build & deploy

```bash
npm run build      # outputs ./dist (~80 KB gzipped)
npm run preview    # local preview of the production build
```

The `dist` folder is fully static. Drop it on Vercel / Netlify / GitHub Pages / Cloudflare Pages — whatever you like.

## Privacy

This is genuinely private — there is **no server**. CSV files are read into memory via `FileReader`, processed on-thread with vanilla JS, and the cleaned output is created as a `Blob` and downloaded. Nothing ever crosses a network boundary.

## Roadmap

- [ ] **Excel `.xlsx` support** via SheetJS (lazy-loaded chunk)
- [ ] **Custom rules** — let users define their own find/replace rules
- [ ] **Column-by-column type coercion** UI (parse this column as date / number / boolean)
- [ ] **Multi-condition filters** — AND/OR filter logic across columns
- [ ] **PWA install** — full offline support
- [ ] **i18n** — Spanish / French / German / Zulu

## License

MIT — see [LICENSE](./LICENSE).

## Author

**Nkululeko Mpofu** — Data Analyst & Software Developer
[Portfolio](https://nkululeko-mpofu.dev/) · [LinkedIn](https://www.linkedin.com/in/nkululeko-mpofu) · [GitHub](https://github.com/Nkuempoofu)

Built as part of an open-source portfolio demonstrating browser-only data tooling, vanilla TypeScript patterns, and privacy-first design.
