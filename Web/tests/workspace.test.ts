// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { TextSelection } from '@tiptap/pm/state';
import { NoteWorkspace } from '../src/workspace';
import type { NoteSnapshot } from '../src/types';
let workspace: NoteWorkspace;
afterEach(() => workspace?.dispose());
function setup(failSave = false) {
  const files = new Map<string, NoteSnapshot>();
  const host = document.createElement('div'); document.body.replaceChildren(host);
  workspace = new NoteWorkspace(host, async id => ({ snapshot: files.get(id) ?? null, recovered: false }), async note => {
    if (failSave) throw Error('只读目录'); files.set(note.pageID, structuredClone(note));
    return { pageID: note.pageID, revision: note.revision, ignored: false };
  });
  return files;
}
test('切页先确认旧页写盘，独立恢复内容、光标和撤销历史', async () => {
  const files = setup(); await workspace.activate('page-1');
  const first = workspace.active!.editor; first.commands.insertContent('第一页中文');
  const caret = first.state.selection.anchor;
  await workspace.activate('page-2');
  expect(files.get('page-1')?.document.content?.[0].content?.[0].text).toBe('第一页中文');
  workspace.active!.editor.commands.insertContent('第二页');
  await workspace.activate('page-1');
  expect(workspace.active!.editor).toBe(first); expect(first.state.selection.anchor).toBe(caret);
  first.commands.undo(); expect(first.getText()).toBe('');
  await workspace.activate('page-2'); expect(workspace.active!.editor.getText()).toBe('第二页');
});
test('保存失败时拒绝切页，保留可编辑正文，不加载目标页', async () => {
  setup(true); await workspace.activate('page-1');
  workspace.active!.editor.commands.insertContent('还没有保存');
  await expect(workspace.activate('page-2')).rejects.toThrow('只读目录');
  expect(workspace.active!.pageID).toBe('page-1'); expect(workspace.active!.editor.isEditable).toBe(true);
  expect(workspace.active!.editor.getText()).toBe('还没有保存');
});
test('切页等待组合输入结束，保存最终中文后才加载另一页', async () => {
  const files = setup(); await workspace.activate('page-1');
  const session = workspace.active!; session.coordinator.compositionStarted();
  session.editor.commands.insertContent('中文');
  let done = false; const switching = workspace.activate('page-2').then(() => { done = true; });
  await Promise.resolve(); expect(done).toBe(false); expect(files.size).toBe(0);
  session.editor.commands.insertContent('选词完成'); session.coordinator.compositionEnded(); await switching;
  expect(files.get('page-1')?.document.content?.[0].content?.[0].text).toBe('中文选词完成');
  expect(workspace.active!.pageID).toBe('page-2');
});
test('新页加载损坏时仍保留旧页及其正文', async () => {
  setup(); await workspace.activate('page-1'); workspace.active!.editor.commands.insertContent('保留');
  await vi.waitFor(() => expect(workspace.active!.editor.isFocused).toBe(true));
  await expect(workspace.activate('page-3', { snapshot: { pageID: 'page-3', revision: 1, document: { type: 'doc', content: [{ type: 'unknownBrokenNode' }] }, selection: { anchor: 1, head: 1 } } as NoteSnapshot, recovered: false })).rejects.toThrow();
  expect(workspace.active!.pageID).toBe('page-1'); expect(workspace.active!.editor.isEditable).toBe(true);
  await vi.waitFor(() => expect(workspace.active!.editor.isFocused).toBe(true));
});
test('滚动位置随当前页保存，重新加载后恢复', async () => {
  const files = setup(); await workspace.activate('page-1');
  const container = workspace.active!.host.parentElement!;
  container.scrollTop = 84; container.dispatchEvent(new Event('scroll')); await workspace.flush();
  expect(files.get('page-1')?.selection.scrollTop).toBe(84);
  workspace.dispose();
  workspace = new NoteWorkspace(container, async id => ({ snapshot: files.get(id) ?? null, recovered: false }), async note => ({ pageID: note.pageID, revision: note.revision, ignored: false }));
  await workspace.activate('page-1'); expect(container.scrollTop).toBe(84);
});

test('保存期间连续切页最终打开最后点击的页，不丢掉后续请求', async () => {
  const host = document.createElement('div'); document.body.replaceChildren(host);
  let finishSave!: () => void;
  let saving = false;
  const files = new Map<string, NoteSnapshot>();
  workspace = new NoteWorkspace(host, async () => ({ snapshot: null, recovered: false }), async note => {
    if (!saving) {
      saving = true; await new Promise<void>(resolve => { finishSave = resolve; });
    }
    files.set(note.pageID, note);
    return { pageID: note.pageID, revision: note.revision, ignored: false };
  });
  await workspace.activate('page-1'); workspace.active!.editor.commands.insertContent('不能丢失的正文');
  const first = workspace.activate('page-2');
  await vi.waitFor(() => expect(saving).toBe(true));
  const last = workspace.activate('page-3');
  finishSave(); await Promise.all([first, last]);
  expect(workspace.active!.pageID).toBe('page-3');
  expect(files.get('page-1')?.document.content?.[0].content?.[0].text).toBe('不能丢失的正文');
});

test('重新加载便签保留反向选区方向', async () => {
  const files = setup(); await workspace.activate('page-1');
  const editor = workspace.active!.editor;
  editor.commands.insertContent('反向选区测试');
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 5, 2)));
  await workspace.flush();
  const saved = files.get('page-1')!;
  workspace.dispose(); setup();
  await workspace.activate('page-1', { snapshot: saved, recovered: false });
  expect(workspace.active!.editor.state.selection.anchor).toBe(5);
  expect(workspace.active!.editor.state.selection.head).toBe(2);
});

test('连续切页遇到保存失败时全部停止，重试可选择新的目标', async () => {
  const host = document.createElement('div'); document.body.replaceChildren(host);
  let failing = true;
  workspace = new NoteWorkspace(host, async () => ({ snapshot: null, recovered: false }), async note => {
    if (failing) throw Error('写盘失败');
    return { pageID: note.pageID, revision: note.revision, ignored: false };
  });
  await workspace.activate('page-1'); workspace.active!.editor.commands.insertContent('失败后仍保留');
  const requests = await Promise.allSettled([workspace.activate('page-2'), workspace.activate('page-3')]);
  expect(requests.map(result => result.status)).toEqual(['rejected', 'rejected']);
  expect(workspace.active!.pageID).toBe('page-1');
  expect(workspace.active!.editor.isEditable).toBe(true);
  expect(workspace.active!.editor.getText()).toBe('失败后仍保留');
  failing = false; await workspace.activate('page-4');
  expect(workspace.active!.pageID).toBe('page-4');
});

test('恢复先保存当前内容，再替换为新版本；失败保持当前编辑器', async () => {
  const files = setup(); await workspace.activate('page-1');
  workspace.active!.editor.commands.insertContent('当前内容');
  const previous = workspace.active!;
  await expect(workspace.restoreActive(async () => { throw Error('恢复失败'); })).rejects.toThrow('恢复失败');
  expect(workspace.active).toBe(previous); expect(previous.editor.isEditable).toBe(true);
  await workspace.restoreActive(async (pageID, revision) => {
    expect(files.get(pageID)?.revision).toBe(revision);
    expect(files.get(pageID)?.document.content?.[0].content?.[0].text).toBe('当前内容');
    return { ...files.get(pageID)!, revision: revision + 1, document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '历史内容' }] }] } };
  });
  expect(previous.editor.isDestroyed).toBe(true);
  expect(workspace.active!.editor.getText()).toBe('历史内容');
  expect(workspace.active!.revision).toBeGreaterThan(previous.revision);
});

test('整套恢复先保存当前页，清掉旧页缓存；失败时原编辑器仍可用', async () => {
  const files = setup(); await workspace.activate('page-1'); workspace.active!.editor.commands.insertContent('当前页');
  await workspace.activate('page-2'); workspace.active!.editor.commands.insertContent('第二页');
  const old = workspace.active!;
  await expect(workspace.replaceAll(async () => { throw Error('准备失败'); })).rejects.toThrow('准备失败');
  expect(workspace.active).toBe(old); expect(old.editor.isEditable).toBe(true);
  await workspace.replaceAll(async () => {
    expect(files.get('page-2')?.document.content?.[0].content?.[0].text).toBe('第二页');
    return Array.from({ length: 7 }, (_, i) => ({ schemaVersion: 1 as const, pageID: `page-${i + 1}`, revision: 100,
      updatedAt: new Date().toISOString(), document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `恢复页${i + 1}` }] }] }, selection: { anchor: 1, head: 1 } }));
  });
  expect(old.editor.isDestroyed).toBe(true); expect(workspace.active!.editor.getText()).toBe('恢复页2');
  await workspace.activate('page-1'); expect(workspace.active!.editor.getText()).toBe('恢复页1');
});
