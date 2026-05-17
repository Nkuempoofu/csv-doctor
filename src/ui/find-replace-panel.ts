// src/ui/find-replace-panel.ts
/**
 * Find & Replace panel.
 *
 * Renders a collapsible panel with a rule builder (column selector, find/replace
 * inputs, checkboxes) and a list of active rules.  All state lives in main.ts —
 * the panel is purely presentational and fires callbacks.
 */

import type { FindReplaceRule } from '../types';

export interface FindReplacePanelCallbacks {
  onAddRule:    (rule: Omit<FindReplaceRule, 'id'>) => void;
  onRemoveRule: (id: string) => void;
  onApply:      () => void;
}

export function renderFindReplacePanel(
  headers:   string[],
  rules:     FindReplaceRule[],
  isOpen:    boolean,
  onToggle:  () => void,
  cb:        FindReplacePanelCallbacks
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'find-replace-panel';

  const headerOptions = ['', ...headers]
    .map(h => `<option value="${h}">${h === '' ? 'All columns' : h}</option>`)
    .join('');

  section.innerHTML = `
    <div class="find-replace-header">
      <button class="find-replace-toggle btn btn-ghost" id="fr-toggle" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          <line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
        Find &amp; Replace
        ${rules.length > 0 ? `<span class="fr-badge">${rules.length}</span>` : ''}
      </button>
    </div>
    ${isOpen ? `
    <div class="find-replace-body">
      <div class="fr-builder">
        <select class="fr-select" id="fr-column">${headerOptions}</select>
        <input class="fr-input" id="fr-find"    type="text" placeholder="Find…"        />
        <input class="fr-input" id="fr-replace" type="text" placeholder="Replace with…"/>
        <label class="fr-checkbox-label">
          <input type="checkbox" id="fr-case"> Case-sensitive
        </label>
        <label class="fr-checkbox-label">
          <input type="checkbox" id="fr-whole"> Whole cell
        </label>
        <button class="btn btn-ghost fr-add-btn" id="fr-add" type="button">+ Add Rule</button>
      </div>
      ${rules.length > 0 ? `
      <ul class="fr-rules-list">
        ${rules.map(r => `
          <li class="fr-rule" data-id="${r.id}">
            <span class="fr-rule-col">${r.column || 'All'}</span>
            <span class="fr-rule-find">${escHtml(r.find)}</span>
            <span class="fr-rule-arrow">→</span>
            <span class="fr-rule-replace">${escHtml(r.replace)}</span>
            <span class="fr-rule-flags">${r.caseSensitive ? 'Cs' : ''}${r.wholeCell ? ' ⊡' : ''}</span>
            <button class="fr-rule-remove btn btn-ghost" data-id="${r.id}" type="button">✕</button>
          </li>`).join('')}
      </ul>
      <button class="btn btn-primary fr-apply-btn" id="fr-apply" type="button">
        Apply ${rules.length} rule${rules.length === 1 ? '' : 's'}
      </button>` : ''}
    </div>` : ''}
  `;

  // Wire events after DOM is available
  setTimeout(() => {
    document.getElementById('fr-toggle')?.addEventListener('click', onToggle);

    document.getElementById('fr-add')?.addEventListener('click', () => {
      const find    = (document.getElementById('fr-find')    as HTMLInputElement)?.value ?? '';
      if (!find) return;
      const rule: Omit<FindReplaceRule, 'id'> = {
        column:        (document.getElementById('fr-column') as HTMLSelectElement)?.value ?? '',
        find,
        replace:       (document.getElementById('fr-replace') as HTMLInputElement)?.value ?? '',
        caseSensitive: (document.getElementById('fr-case')   as HTMLInputElement)?.checked ?? false,
        wholeCell:     (document.getElementById('fr-whole')  as HTMLInputElement)?.checked ?? false,
      };
      cb.onAddRule(rule);
    });

    document.getElementById('fr-apply')?.addEventListener('click', cb.onApply);

    document.querySelectorAll<HTMLButtonElement>('.fr-rule-remove').forEach(btn => {
      btn.addEventListener('click', () => cb.onRemoveRule(btn.dataset.id!));
    });
  }, 0);

  return section;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
