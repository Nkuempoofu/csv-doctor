/**
 * File queue sidebar — lists all loaded files in batch mode.
 * Purely presentational: no business logic, all events via callbacks.
 */

import type { FileEntry } from '../types';
import { escapeHtml, truncate } from '../lib/format';

const STATUS_LABELS: Record<FileEntry['status'], string> = {
  pending:    'Pending',
  cleaned:    'Cleaned',
  downloaded: 'Downloaded',
  error:      'Error',
};

export interface FileQueueProps {
  files:        FileEntry[];
  activeFileId: string | null;
  onSelect:     (id: string) => void;
  onRemove:     (id: string) => void;
  onAddFiles:   (files: FileList) => void;
}

export function renderFileQueue(props: FileQueueProps): HTMLElement {
  const { files, activeFileId, onSelect, onRemove, onAddFiles } = props;

  const aside = document.createElement('aside');
  aside.className = 'file-queue';
  aside.setAttribute('aria-label', 'File queue');

  // ── File list ──
  const list = document.createElement('ul');
  list.className = 'fq-list';
  list.setAttribute('aria-label', 'Loaded files');

  for (const file of files) {
    const li = document.createElement('li');
    li.className = `fq-item${file.id === activeFileId ? ' fq-item--active' : ''}`;
    li.dataset.id = file.id;
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(file.id);
      }
    });

    const name      = file.parsed.filename;
    const truncated = truncate(name, 22);

    li.innerHTML = `
      <svg class="fq-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
      <span class="fq-name" title="${escapeHtml(name)}">${escapeHtml(truncated)}</span>
      <span class="fq-status fq-status--${file.status}">${STATUS_LABELS[file.status]}</span>
      <button class="fq-remove" type="button"
              aria-label="Remove ${escapeHtml(name)}">×</button>
    `;

    // Click on the item (not the remove button) → select
    li.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.fq-remove')) return;
      onSelect(file.id);
    });

    // Remove button
    li.querySelector<HTMLButtonElement>('.fq-remove')!
      .addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove(file.id);
      });

    list.appendChild(li);
  }

  // ── Hidden file input ──
  const input = document.createElement('input');
  input.type     = 'file';
  input.accept   = '.csv,.tsv,.txt,text/csv';
  input.multiple = true;
  input.hidden   = true;
  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      onAddFiles(input.files);
      input.value = ''; // allow re-adding the same file
    }
  });

  // ── Add button ──
  const addBtn = document.createElement('button');
  addBtn.className   = 'fq-add-btn';
  addBtn.type        = 'button';
  addBtn.textContent = '+ Add more files';
  addBtn.addEventListener('click', () => input.click());

  aside.appendChild(list);
  aside.appendChild(addBtn);
  aside.appendChild(input);

  return aside;
}
