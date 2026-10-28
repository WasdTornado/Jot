// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
import html from '../index.html?raw';
import { NoteSurfaces, confirmRestore } from '../src/surfaces';
import { previewArchive, type WorkspaceArchive } from '../src/archiveUI';
import { showHistory } from '../src/history';
import { pages } from '../src/pages';
beforeEach(() => {
  document.body.innerHTML = html;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open',''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
});
const archive: WorkspaceArchive = { format:'tot-notes-backup',version:1,createdAt:'2026-10-27T00:00:00Z',pageNames:{'page-1':'日常'},notes:pages.map(page=>({
  schemaVersion:1,pageID:page.id,revision:1,updatedAt:'2026-10-27T00:00:00Z',selection:{anchor:1,head:1},document:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'备份正文 <script>',marks:[{type:'bold'}]}]}]},
})) };
function click(selector: string) { document.querySelector<HTMLButtonElement>(selector)!.click(); }
test('备份逐页预览和返回不写入，最终确认才恢复；失败保留预览供重试', async () => {
  const surfaces = new NoteSurfaces(()=>{}); const restore = vi.fn(async()=>{throw Error('写入未成功');});
  const finished = previewArchive({token:'qa',archive},restore,surfaces,pages.map(page=>({pageID:page.id,snapshot:null})),{});
  click('[data-page-id="page-1"]');
  expect(document.querySelector('#archive-document strong')?.textContent).toBe('备份正文 <script>');
  expect(document.querySelector('#archive-document script')).toBeNull();
  expect(document.querySelector<HTMLElement>('#archive-confirm')!.hidden).toBe(true);
  surfaces.back(); click('#archive-confirm');
  expect(restore).not.toHaveBeenCalled(); expect(document.activeElement?.id).toBe('confirm-cancel');
  click('#confirm-cancel'); await Promise.resolve(); expect(restore).not.toHaveBeenCalled();
  click('#archive-confirm'); click('#confirm-accept');
  await vi.waitFor(()=>expect(document.querySelector('#confirm-error')?.textContent).toBe('写入未成功'));
  expect(document.querySelector('#confirm-dialog')?.hasAttribute('open')).toBe(true);
  expect(surfaces.current).toBe('archive-panel'); click('#confirm-cancel'); await Promise.resolve();
  click('#archive-cancel'); await finished; expect(surfaces.current).toBe('backup-panel');
});
test('历史只读预览保留格式，确认框说明单页范围并支持取消', async () => {
  const surfaces = new NoteSurfaces(()=>{}), restore = vi.fn(async()=>{}), close = vi.fn();
  showHistory([{id:'backup-1',snapshot:archive.notes[2]}],restore,close,surfaces,'日常');
  expect(document.querySelector('#history-preview strong')?.textContent).toBe('备份正文 <script>');
  click('#restore-history'); expect(document.querySelector('#confirm-description')?.textContent).toContain('其他六页保持不变');
  click('#confirm-cancel'); await Promise.resolve(); expect(restore).not.toHaveBeenCalled();
  surfaces.back(); expect(close).toHaveBeenCalledOnce(); expect(surfaces.current).toBe('notes');
});

test('备份比较忽略 JSON 对象字段顺序但识别正文差异', async () => {
  const surfaces = new NoteSurfaces(()=>{});
  const current = archive.notes.map(snapshot => ({pageID:snapshot.pageID,snapshot:{...snapshot,document:{content:[{content:[{marks:[{type:'bold'}],text:'备份正文 <script>',type:'text'}],type:'paragraph'}],type:'doc'}}}));
  current[1].snapshot.document.content[0].content[0].text = '不同正文';
  const finished = previewArchive({token:'qa',archive},vi.fn(async()=>{}),surfaces,current,archive.pageNames);
  expect(document.querySelector('[data-page-id="page-1"] small')?.textContent).toBe('内容相同');
  expect(document.querySelector('[data-page-id="page-3"] small')?.textContent).toBe('内容不同');
  click('#archive-cancel'); await finished;
});


test('恢复确认的 Tab 焦点只在取消和确认间循环', async () => {
  const finished = confirmRestore('恢复？','范围说明','恢复',vi.fn(async()=>{}));
  const dialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;
  dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  expect(document.activeElement?.id).toBe('confirm-accept');
  dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  expect(document.activeElement?.id).toBe('confirm-cancel');
  dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
  expect(document.activeElement?.id).toBe('confirm-accept');
  click('#confirm-cancel'); expect(await finished).toBe(false);
});
