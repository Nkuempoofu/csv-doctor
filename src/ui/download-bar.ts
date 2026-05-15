// src/ui/download-bar.ts
/**
 * Download bar — persistent action bar rendered below the analysis panel.
 * Shows export row count, a download button, and a "Revert to original" link.
 */

export function renderDownloadBar(
  filteredCount: number,
  hasResult: boolean,
  hasFilters: boolean,
  onDownload: () => void,
  onRevert: () => void
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'download-bar';

  let noteText: string;
  let downloadDisabled: boolean;

  if (!hasResult) {
    noteText = 'Apply fixes before downloading';
    downloadDisabled = true;
  } else if (filteredCount === 0) {
    noteText = 'No rows to export';
    downloadDisabled = true;
  } else if (hasFilters) {
    noteText = `Exporting ${filteredCount.toLocaleString()} filtered row${filteredCount === 1 ? '' : 's'}`;
    downloadDisabled = false;
  } else {
    noteText = `Exporting ${filteredCount.toLocaleString()} row${filteredCount === 1 ? '' : 's'}`;
    downloadDisabled = false;
  }

  section.innerHTML = `
    <span class="download-bar-note">${noteText}</span>
    <div class="download-bar-actions">
      ${hasResult
        ? `<button class="btn btn-ghost" id="dl-bar-revert" type="button">Revert to original</button>`
        : ''}
      <button
        class="btn btn-primary"
        id="dl-bar-download"
        type="button"
        ${downloadDisabled ? 'disabled' : ''}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download cleaned CSV
      </button>
    </div>
  `;

  setTimeout(() => {
    document.getElementById('dl-bar-download')?.addEventListener('click', onDownload);
    document.getElementById('dl-bar-revert')?.addEventListener('click', onRevert);
  }, 0);

  return section;
}
