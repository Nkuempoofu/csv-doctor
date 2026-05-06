/**
 * Upload zone — drag-drop + file picker + "Try with sample" button.
 * Pure DOM, no framework. Returns an HTMLElement that the main entry attaches.
 */

import { SAMPLE_CSV } from '../lib/sample';
import { bytes } from '../lib/format';

interface UploadCallbacks {
  onFile: (text: string, name: string, size: number) => void;
  onError: (message: string) => void;
}

export function createUploadZone(cb: UploadCallbacks): HTMLElement {
  const wrap = document.createElement('section');
  wrap.className = 'upload';
  wrap.innerHTML = `
    <div class="upload-card" id="upload-card" role="button" tabindex="0" aria-label="Drag and drop a CSV file here, or click to browse">
      <div class="upload-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <h2 class="upload-title">Drop a CSV here</h2>
      <p class="upload-hint">or <span class="upload-link">click to browse</span> &nbsp;·&nbsp; supports .csv .tsv .txt &nbsp;·&nbsp; up to ~50&nbsp;MB</p>
      <input type="file" id="upload-input" accept=".csv,.tsv,.txt,text/csv" hidden />

      <div class="upload-divider"><span>or</span></div>

      <button class="upload-sample-btn" id="upload-sample" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        Try with a deliberately-messy sample
      </button>

      <p class="upload-privacy">
        <span class="upload-privacy-dot"></span>
        Files are processed entirely in your browser, nothing is uploaded.
      </p>
    </div>
  `;

  const card = wrap.querySelector<HTMLDivElement>('#upload-card')!;
  const input = wrap.querySelector<HTMLInputElement>('#upload-input')!;
  const sample = wrap.querySelector<HTMLButtonElement>('#upload-sample')!;

  function handleFile(file: File) {
    const ok = /\.(csv|tsv|txt)$/i.test(file.name) || file.type === 'text/csv';
    if (!ok) {
      cb.onError(`"${file.name}" doesn't look like a CSV / TSV file.`);
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      cb.onError(`File is ${bytes(file.size)}, too large for in-browser processing. Please try one under 50 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload  = () => cb.onFile(reader.result as string, file.name, file.size);
    reader.onerror = () => cb.onError('Could not read the file.');
    reader.readAsText(file, 'utf-8');
  }

  /* Click to browse */
  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#upload-sample')) return;
    input.click();
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) handleFile(f);
    input.value = ''; // allow re-uploading the same file
  });

  /* Drag-and-drop */
  ['dragenter', 'dragover'].forEach((ev) => {
    card.addEventListener(ev, (e) => {
      e.preventDefault();
      card.classList.add('upload-card--hover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    card.addEventListener(ev, (e) => {
      e.preventDefault();
      card.classList.remove('upload-card--hover');
    });
  });
  card.addEventListener('drop', (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  /* Try the sample */
  sample.addEventListener('click', () => {
    cb.onFile(SAMPLE_CSV, 'sample-messy-customers.csv', SAMPLE_CSV.length);
  });

  return wrap;
}
