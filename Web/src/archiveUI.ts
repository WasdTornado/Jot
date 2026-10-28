import { getSchema } from '@tiptap/core';
import { noteExtensions } from './editor';
import type { NoteSnapshot } from './types';
import { describeNote } from './notePresentation';
import { pages } from './pages';
import { renderDocumentPreview } from './documentPreview';
import { confirmRestore, type NoteSurfaces } from './surfaces';
export interface WorkspaceArchive { format: string; version: number; createdAt: string; pageNames: Record<string, string>; notes: NoteSnapshot[] }
export interface ArchivePreview { token: string; archive: WorkspaceArchive }
export function validateArchiveDocuments(archive: WorkspaceArchive): void {
  // 原生检查存储格式后，再用实际编辑器结构校验，确认全部内容可加载才允许替换。
  const schema = getSchema(noteExtensions());
  try { for (const note of archive.notes) schema.nodeFromJSON(note.document).check(); }
  catch { throw Error('备份包含无法编辑的格式，当前便签保持不变'); }
}
export interface CurrentArchivePage { pageID: string; snapshot?: NoteSnapshot | null; error?: string }
export function previewArchive(preview: ArchivePreview, restore: () => Promise<void>, surfaces: NoteSurfaces, current: CurrentArchivePage[], names: Record<string,string>): Promise<void> {
  const confirm = document.querySelector<HTMLButtonElement>('#archive-confirm')!;
  const cancel = document.querySelector<HTMLButtonElement>('#archive-cancel')!;
  const reselect = document.querySelector<HTMLButtonElement>('#archive-reselect')!;
  const message = document.querySelector('#archive-message')!;
  const list = document.querySelector<HTMLElement>('#archive-pages')!;
  const content = document.querySelector<HTMLElement>('#archive-document')!;
  const title = document.querySelector('#archive-title')!;
  document.querySelector('#archive-description')!.textContent = `完整备份 · ${new Date(preview.archive.createdAt).toLocaleString('zh-CN')}\n七页正文、格式与页名`;
  let detail = false;
  const overview = (): void => {
    detail = false; title.textContent = '预览完整备份'; list.hidden = false; content.hidden = true; confirm.hidden = false;
    reselect.textContent = '返回备份与恢复'; message.textContent = '恢复会替换全部七页。自动备份当前内容后才开始恢复。';
  };
  const schema = getSchema(noteExtensions());
  list.replaceChildren();
  for (const page of pages) {
    const note = preview.archive.notes.find(note => note.pageID === page.id)!;
    const existing = current.find(item => item.pageID === page.id);
    const name = preview.archive.pageNames[page.id] || page.name;
    const row = document.createElement('button'); row.type = 'button'; row.className = 'archive-row'; row.dataset.pageId = page.id;
    const dot = document.createElement('i'); dot.style.setProperty('--dot', page.color);
    const label = document.createElement('span'); label.textContent = name;
    const summary = document.createElement('small');
    const empty = !describeNote(note.document).hasContent;
    const sameDocument = existing?.snapshot ? schema.nodeFromJSON(existing.snapshot.document).eq(schema.nodeFromJSON(note.document)) : empty;
    const sameName = (names[page.id] || page.name) === name;
    summary.textContent = !existing || existing.error ? '无法比较' : !sameName ? '页名不同' : !sameDocument ? '内容不同' : empty ? '空白页' : '内容相同';
    const arrow = document.createElementNS('http://www.w3.org/2000/svg','svg'); const use = document.createElementNS('http://www.w3.org/2000/svg','use'); use.setAttribute('href','#i-next'); arrow.append(use);
    row.append(dot,label,summary,arrow);
    row.onclick = () => { detail = true; title.textContent = `备份中的「${name}」`; list.hidden = true; content.hidden = false; confirm.hidden = true; renderDocumentPreview(content,note.document); reselect.textContent = '返回七页概览'; message.textContent = '只读预览，不会改变当前便签。'; content.focus(); };
    list.append(row);
  }
  overview(); surfaces.show('archive-panel','backup-panel');
  return new Promise(resolve => {
    const close = (): void => { surfaces.show('backup-panel','notes'); resolve(); };
    const back = (): void => { if (detail) overview(); else close(); };
    cancel.onclick = back; reselect.onclick = back; surfaces.onBack = back;
    confirm.onclick = () => {
      void confirmRestore('替换全部七页？','当前七页正文和页名将被备份中的内容替换。\n恢复前会自动备份当前内容，之后仍可找回。','备份当前并恢复',restore)
        .then(restored => { if (restored) { surfaces.close(false); resolve(); } });
    };
  });
}
