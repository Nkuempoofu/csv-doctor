/**
 * Issues panel — sidebar of detected diagnoses with toggle switches.
 * Emits an `onChange` callback whenever the user enables/disables a fix.
 */

import type { Issue } from '../types';
import { escapeHtml } from '../lib/format';

interface PanelCallbacks {
  onToggle: (issueId: Issue['id'], enabled: boolean) => void;
  onApplyAll: () => void;
  onClean: () => void;
}

const SEVERITY_LABEL = {
  low:    'Cosmetic',
  medium: 'Notable',
  high:   'Important',
} as const;

export function createIssuesPanel(issues: Issue[], cb: PanelCallbacks): HTMLElement {
  const panel = document.createElement('aside');
  panel.className = 'issues';

  if (issues.length === 0) {
    panel.innerHTML = `
      <div class="issues-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <h3>No issues detected</h3>
        <p>Your CSV looks pristine. You can still re-export it or upload another file.</p>
      </div>
    `;
    return panel;
  }

  const list = issues.map((issue) => `
    <li class="issue issue--${issue.severity}" data-id="${issue.id}">
      <div class="issue-row">
        <label class="issue-toggle">
          <input type="checkbox" data-id="${issue.id}" ${issue.enabled ? 'checked' : ''} />
          <span class="issue-toggle-track" aria-hidden="true"><span class="issue-toggle-thumb"></span></span>
        </label>
        <div class="issue-text">
          <div class="issue-head">
            <span class="issue-label">${escapeHtml(issue.label)}</span>
            <span class="issue-count">${issue.count}</span>
          </div>
          <p class="issue-desc">${escapeHtml(issue.description)}</p>
          ${issue.affectedColumns.length > 0
            ? `<div class="issue-cols">${issue.affectedColumns.map((c) => `<span class="issue-col-pill">${escapeHtml(c)}</span>`).join('')}</div>`
            : ''}
        </div>
        <span class="issue-severity">${SEVERITY_LABEL[issue.severity]}</span>
      </div>
    </li>
  `).join('');

  panel.innerHTML = `
    <header class="issues-head">
      <div>
        <h3 class="issues-title">Diagnosis</h3>
        <p class="issues-sub">${issues.length} issue${issues.length === 1 ? '' : 's'} found · toggle to choose what to fix</p>
      </div>
      <button class="issues-all-btn" type="button" id="issues-all-btn">Apply all</button>
    </header>
    <ul class="issues-list">${list}</ul>
    <footer class="issues-foot">
      <button class="issues-clean-btn" type="button" id="issues-clean-btn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Apply selected fixes
      </button>
    </footer>
  `;

  /* Wire up toggles */
  panel.querySelectorAll<HTMLInputElement>('.issue-toggle input').forEach((cb_input) => {
    cb_input.addEventListener('change', () => {
      cb.onToggle(cb_input.dataset.id as Issue['id'], cb_input.checked);
    });
  });

  panel.querySelector<HTMLButtonElement>('#issues-all-btn')!
    .addEventListener('click', cb.onApplyAll);

  panel.querySelector<HTMLButtonElement>('#issues-clean-btn')!
    .addEventListener('click', cb.onClean);

  return panel;
}
