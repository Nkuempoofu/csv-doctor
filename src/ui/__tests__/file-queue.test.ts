// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderFileQueue } from '../file-queue';
import type { FileEntry } from '../../types';

function makeEntry(
  id: string,
  filename: string,
  status: FileEntry['status'] = 'pending',
): FileEntry {
  return {
    id,
    parsed: {
      filename,
      size: 1000,
      delimiter: ',',
      encoding: 'utf-8',
      headers: ['A'],
      rows:    [['1']],
      rawText: '',
    },
    issues:           [],
    result:           null,
    prevResult:       null,
    activeColumn:     null,
    filterSlots:      [{ column: '', value: '', mode: 'include' }],
    findReplaceRules: [],
    findReplaceOpen:  false,
    status,
  };
}

describe('renderFileQueue', () => {
  it('renders one list item per file', () => {
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv'), makeEntry('2', 'b.csv')],
      activeFileId: '1',
      onSelect:     vi.fn(),
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    expect(el.querySelectorAll('.fq-item').length).toBe(2);
  });

  it('marks only the active item with fq-item--active', () => {
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv'), makeEntry('2', 'b.csv')],
      activeFileId: '2',
      onSelect:     vi.fn(),
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    const items = Array.from(el.querySelectorAll('.fq-item'));
    expect(items[0].classList.contains('fq-item--active')).toBe(false);
    expect(items[1].classList.contains('fq-item--active')).toBe(true);
  });

  it('shows the correct status badge class for each status', () => {
    const statuses: FileEntry['status'][] = ['pending', 'cleaned', 'downloaded', 'error'];
    for (const status of statuses) {
      const el = renderFileQueue({
        files:        [makeEntry('1', 'a.csv', status)],
        activeFileId: '1',
        onSelect:     vi.fn(),
        onRemove:     vi.fn(),
        onAddFiles:   vi.fn(),
      });
      expect(el.querySelector(`.fq-status--${status}`)).not.toBeNull();
    }
  });

  it('displays the filename in the item', () => {
    const el = renderFileQueue({
      files:        [makeEntry('1', 'customers.csv')],
      activeFileId: '1',
      onSelect:     vi.fn(),
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    expect(el.querySelector('.fq-name')!.textContent).toContain('customers.csv');
  });

  it('calls onSelect with the file id when a non-active item is clicked', () => {
    const onSelect = vi.fn();
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv'), makeEntry('2', 'b.csv')],
      activeFileId: '1',
      onSelect,
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    (el.querySelectorAll('.fq-item')[1] as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith('2');
  });

  it('calls onRemove with the file id when the × button is clicked', () => {
    const onRemove = vi.fn();
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv'), makeEntry('2', 'b.csv')],
      activeFileId: '1',
      onSelect:     vi.fn(),
      onRemove,
      onAddFiles:   vi.fn(),
    });
    (el.querySelectorAll('.fq-remove')[0] as HTMLButtonElement).click();
    expect(onRemove).toHaveBeenCalledWith('1');
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('does not call onSelect when the × button is clicked', () => {
    const onSelect = vi.fn();
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv')],
      activeFileId: '1',
      onSelect,
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    (el.querySelector('.fq-remove') as HTMLButtonElement).click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders an "+ Add more files" button', () => {
    const el = renderFileQueue({
      files:        [makeEntry('1', 'a.csv')],
      activeFileId: '1',
      onSelect:     vi.fn(),
      onRemove:     vi.fn(),
      onAddFiles:   vi.fn(),
    });
    expect(el.querySelector('.fq-add-btn')).not.toBeNull();
  });
});
