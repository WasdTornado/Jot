import type { NoteSnapshot } from './types';
import { renderDocumentPreview } from './documentPreview';
import { confirmRestore, type NoteSurfaces } from './surfaces';
export interface HistoryEntry { id: string; snapshot: NoteSnapshot }
export function showHistory(entries: HistoryEntry[], restore: (id: string) => Promise<void>, onClose: () => void, surfaces: NoteSurfaces, name: string): void {
  const preview = document.querySelector<HTMLElement>('#history-preview')!;
  const action = document.querySelector<HTMLButtonElement>('#restore-history')!;
  const cancel = document.querySelector<HTMLButtonElement>('#close-history')!;
  const message = document.querySelector<HTMLElement>('#history-message')!;
  const previous = document.querySelector<HTMLButtonElement>('#history-previous')!;
  const next = document.querySelector<HTMLButtonElement>('#history-next')!;
  let selected = 0;
  document.querySelector('#history-title')!.textContent = `历史版本 · ${name}`;
  message.textContent = entries.length ? '恢复前会备份当前页。也可以只复制需要的文字。' : '还没有历史备份。正文修改后会自动备份旧版，最多每分钟一次。';
  const select = (): void => {
    action.disabled = !entries.length; previous.disabled = selected === 0; next.disabled = selected >= entries.length - 1;
    document.querySelector('#history-date')!.textContent = entries[selected] ? new Date(entries[selected].snapshot.updatedAt).toLocaleString('zh-CN') : '暂无历史版本';
    preview.replaceChildren();
    if (entries[selected]) renderDocumentPreview(preview, entries[selected].snapshot.document);
  };
  previous.onclick = () => { if (selected > 0) { selected--; select(); } };
  next.onclick = () => { if (selected < entries.length - 1) { selected++; select(); } };
  const close = (): void => { surfaces.show('notes'); onClose(); };
  cancel.onclick = close;
  action.onclick = () => {
    const entry = entries[selected]; if (!entry) return;
    void confirmRestore('恢复这个版本？', `仅替换「${name}」这一页，其他六页保持不变。\n恢复前会自动备份当前内容，之后仍可找回。`, '恢复此版本', () => restore(entry.id))
      .then(restored => { if (restored) { surfaces.close(false); onClose(); } });
  };
  select(); surfaces.show('history-panel', 'notes'); surfaces.onBack = close;
}
