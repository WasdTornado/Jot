// @vitest-environment jsdom
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import type { Editor, JSONContent } from '@tiptap/core';
import html from '../index.html?raw';
import type { NoteSnapshot } from '../src/types';

// jsdom 没有排版引擎，补齐滚动选区所需接口；实际视觉位置由原生窗口验收。
beforeAll(() => {
  Range.prototype.getClientRects = () => Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

const editors = vi.hoisted(() => ({ current: undefined as Editor | undefined, all: [] as Editor[] }));
vi.mock('../src/editor', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/editor')>();
  return { ...actual, createNoteEditor: (...args: Parameters<typeof actual.createNoteEditor>) => {
    editors.current = actual.createNoteEditor(...args); editors.all.push(editors.current); return editors.current;
  } };
});
afterEach(async () => {
  // 先完成真实保存流程，避免上一条用例的延迟写盘进入下一条用例。
  const notes = window.webkit?.messageHandlers.notes;
  if (notes && window.totNotes) {
    await new Promise<void>(resolve => {
      const postMessage = notes.postMessage;
      notes.postMessage = value => {
        const message = value as Record<string, unknown>;
        if (message.type === 'flushResult' && message.requestID === 'test-cleanup') resolve();
        else postMessage(value);
      };
      window.totNotes.receive({ type: 'requestFlush', requestID: 'test-cleanup' });
    });
  }
  editors.all.forEach(editor => editor.destroy()); editors.all = []; editors.current = undefined;
  delete window.webkit; vi.resetModules();
});

async function openNote(snapshot: NoteSnapshot | null = null, intercept?: (message: Record<string, unknown>) => boolean): Promise<Editor> {
  document.body.innerHTML = html;
  window.webkit = { messageHandlers: { notes: { postMessage: value => {
    const message = value as Record<string, unknown>;
    if (intercept?.(message)) return;
    queueMicrotask(() => window.totNotes.receive({
      type: 'result', requestID: message.requestID, ok: true,
      payload: message.type === 'ready' ? { snapshot, recovered: false } : message.payload,
    }));
  } } } };
  await import('../src/main');
  await vi.waitFor(() => expect(editors.current?.isEditable).toBe(true));
  return editors.current!;
}

test('空白页输入待办快捷语法后隐藏提示，清空后恢复提示', async () => {
  const editor = await openNote();
  const hint = document.querySelector<HTMLElement>('#hint')!;
  expect(hint.hidden).toBe(false);
  for (const ch of '[] ') {
    const { from, to } = editor.state.selection;
    let handled = false;
    editor.view.someProp('handleTextInput', handler => {
      handled = handler(editor.view, from, to, ch, () => editor.state.tr.insertText(ch)) || handled;
      return handled;
    });
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch));
  }
  expect(editor.view.dom.querySelector('input[type="checkbox"]')).not.toBeNull();
  expect(hint.hidden).toBe(true);
  editor.commands.insertContent('今天整理会议记录');
  expect(hint.hidden).toBe(true);
  editor.commands.clearContent();
  expect(hint.hidden).toBe(false);
});

test('启动加载完成前不选中默认页，加载后只标记实际打开的页', async () => {
  document.body.innerHTML = html;
  const sent: Record<string, unknown>[] = [];
  window.webkit = { messageHandlers: { notes: { postMessage: value => {
    const message = value as Record<string, unknown>; sent.push(message);
    if (message.type !== 'ready') queueMicrotask(() => window.totNotes.receive({
      type: 'result', requestID: message.requestID, ok: true, payload: message.payload,
    }));
  } } } };
  await import('../src/main');
  const initialSelection = document.querySelectorAll('[aria-current="page"]').length;
  const ready = sent.find(message => message.type === 'ready')!;
  window.totNotes.receive({ type: 'load', requestID: ready.requestID, ok: true, payload: {
    snapshot: null, recovered: false,
    settings: { pageID: 'page-5', fontSize: 15, pinned: false, theme: 'system', reduceTransparency: false },
  } });
  await vi.waitFor(() => expect(editors.current?.isEditable).toBe(true));
  expect(initialSelection).toBe(0);
  const selected = document.querySelectorAll<HTMLButtonElement>('[aria-current="page"]');
  expect(selected).toHaveLength(1); expect(selected[0].dataset.page).toBe('page-5');
});

test('重新打开已保存的空待办时不叠加空白提示', async () => {
  await openNote({
    schemaVersion: 1, pageID: 'page-1', revision: 1, updatedAt: '2026-10-20T00:00:00Z',
    document: { type: 'doc', content: [{ type: 'taskList', content: [
      { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] },
    ] }] }, selection: { anchor: 3, head: 3 },
  });
  expect(document.querySelector('#editor input[type="checkbox"]')).not.toBeNull();
  expect(document.querySelector<HTMLElement>('#hint')!.hidden).toBe(true);
});

test('导出面板打开期间忽略重复请求，关闭后可再次导出', async () => {
  const exports: Record<string, unknown>[] = [];
  const editor = await openNote(null, message => {
    if (message.type !== 'exportMarkdown') return false;
    exports.push(message); return true;
  });
  await vi.waitFor(() => expect(editor.isFocused).toBe(true));
  const button = document.querySelector<HTMLButtonElement>('#export')!;
  window.totNotes.receive({ type: 'requestExport' });
  window.totNotes.receive({ type: 'requestExport' });
  await vi.waitFor(() => expect(exports.length).toBeGreaterThan(0));
  expect(exports).toHaveLength(1); expect(button.disabled).toBe(true);
  expect(editor.isFocused).toBe(false);
  window.totNotes.receive({ type: 'exportResult', requestID: exports[0].requestID, ok: true });
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  await vi.waitFor(() => expect(editor.isFocused).toBe(true));
  window.totNotes.receive({ type: 'requestExport' });
  await vi.waitFor(() => expect(exports).toHaveLength(2));
  window.totNotes.receive({ type: 'exportResult', requestID: exports[1].requestID, ok: false, error: '导出失败' });
  await vi.waitFor(() => expect(button.disabled).toBe(false));
  expect(document.querySelector('#error-summary')?.textContent).toBe('导出失败');
});

test('设置保存失败不会被正文保存掩盖，重试会重新提交设置', async () => {
  let rejectSettings = true;
  const sent: Record<string, unknown>[] = [];
  const editor = await openNote(null, message => {
    sent.push(message);
    if (message.type !== 'setSettings' || !rejectSettings) return false;
    queueMicrotask(() => window.totNotes.receive({ type: 'settingsResult', requestID: message.requestID, ok: false, error: '设置写入失败' }));
    return true;
  });
  document.querySelector<HTMLButtonElement>('[data-font="18"]')!.click();
  await vi.waitFor(() => expect(document.querySelector('#status')?.textContent).toContain('设置'));
  editor.commands.insertContent('正文仍要写盘');
  window.totNotes.receive({ type: 'requestFlush', requestID: 'settings-failed-close' });
  await vi.waitFor(() => expect(sent.some(message => message.requestID === 'settings-failed-close')).toBe(true));
  expect(sent.find(message => message.requestID === 'settings-failed-close')?.ok).toBe(false);
  expect(document.querySelector('#status')?.textContent).toContain('设置');
  const retry = document.querySelector<HTMLButtonElement>('#retry')!;
  expect(retry.hidden).toBe(false);
  rejectSettings = false; retry.click();
  await vi.waitFor(() => expect(sent.filter(message => message.type === 'setSettings')).toHaveLength(2));
  expect(sent.filter(message => message.type === 'setSettings')[1].payload).toMatchObject({ fontSize: 18 });
  await vi.waitFor(() => expect(retry.hidden).toBe(true));
});

test('已有待办中使用插入待办按钮新增空项，保留已有正文与勾选状态', async () => {
  const editor = await openNote();
  editor.commands.setContent({ type: 'doc', content: [{ type: 'taskList', content: [
    { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '已完成的原待办' }] }] },
  ] }] });
  editor.commands.setTextSelection(5);
  document.querySelector<HTMLButtonElement>('#insert-task')!.click();
  const list = (editor.getJSON() as JSONContent).content![0];
  expect(list.type).toBe('taskList');
  expect(list.content).toHaveLength(2);
  expect(list.content![0].attrs?.checked).toBe(true);
  expect(list.content![0].content![0].content![0].text).toBe('已完成的原待办');
  expect(list.content![1].attrs?.checked).toBe(false);
  expect(editor.state.selection.$from.parent.textContent).toBe('');
  editor.commands.insertContent('新的待办');
  expect((editor.getJSON() as JSONContent).content![0].content![1].content![0].content![0].text).toBe('新的待办');
});

test('文档加载失败后允许正常退出，保持只读且不发送空白保存', async () => {
  document.body.innerHTML = html;
  const sent: Record<string, unknown>[] = [];
  window.webkit = { messageHandlers: { notes: { postMessage: value => {
    const message = value as Record<string, unknown>; sent.push(message);
    if (message.type === 'editorReady') queueMicrotask(() => window.totNotes.receive({ type: 'editorReadyResult', requestID: message.requestID, ok: true }));
    if (message.type === 'save') queueMicrotask(() => window.totNotes.receive({ type: 'saveResult', requestID: message.requestID, ok: true, payload: message.payload }));
  } } } };
  await import('../src/main');
  const ready = sent.find(message => message.type === 'ready')!;
  window.totNotes.receive({ type: 'load', requestID: ready.requestID, ok: false, error: '文档损坏' });
  await vi.waitFor(() => expect(document.querySelector('#error-summary')?.textContent).toBe('文档损坏'));
  expect(editors.current).toBeUndefined();
  window.totNotes.receive({ type: 'requestFlush', requestID: 'close-read-only' });
  await vi.waitFor(() => expect(sent.find(message => message.type === 'flushResult')?.ok).toBe(true));
  expect(sent.some(message => message.type === 'save')).toBe(false);
  const retry = document.querySelector<HTMLButtonElement>('#retry')!;
  expect(retry.hidden).toBe(false); expect(retry.textContent).toBe('重新加载');
  retry.click();
  const reloaded = sent.filter(message => message.type === 'ready').at(-1)!;
  window.totNotes.receive({ type: 'load', requestID: reloaded.requestID, ok: true, payload: { snapshot: null, recovered: false } });
  await vi.waitFor(() => expect(editors.current?.isEditable).toBe(true));
  window.totNotes.receive({ type: 'requestFlush', requestID: 'close-after-reload' });
  await vi.waitFor(() => expect(sent.find(message => message.requestID === 'close-after-reload')?.ok).toBe(true));
});

test('初始损坏页后切到健康页，仍启用导出并通知原生等待最新写盘', async () => {
  document.body.innerHTML = html;
  const sent: Record<string, unknown>[] = [];
  window.webkit = { messageHandlers: { notes: { postMessage: value => {
    const message = value as Record<string, unknown>; sent.push(message);
    if (message.type === 'loadPage') queueMicrotask(() => window.totNotes.receive({ type: 'load', requestID: message.requestID, ok: true, payload: { snapshot: null, recovered: false } }));
    if (['save', 'setSettings', 'editorReady'].includes(String(message.type))) queueMicrotask(() => window.totNotes.receive({ type: 'result', requestID: message.requestID, ok: true, payload: message.payload }));
  } } } };
  await import('../src/main');
  const ready = sent.find(message => message.type === 'ready')!;
  window.totNotes.receive({ type: 'load', requestID: ready.requestID, ok: false, error: '当前页损坏' });
  await vi.waitFor(() => expect(document.querySelector('#error-summary')?.textContent).toBe('当前页损坏'));
  document.querySelector<HTMLButtonElement>('[data-page="page-2"]')!.click();
  await vi.waitFor(() => expect(editors.current?.isEditable).toBe(true));
  expect(sent.some(message => message.type === 'editorReady')).toBe(true);
  expect(document.querySelector<HTMLButtonElement>('#export')!.disabled).toBe(false);
  editors.current!.commands.insertContent('立即退出也要保存');
  window.totNotes.receive({ type: 'requestFlush', requestID: 'quit-after-recovery' });
  await vi.waitFor(() => expect(sent.find(message => message.requestID === 'quit-after-recovery')?.ok).toBe(true));
  expect(sent.find(message => message.type === 'save')?.payload).toMatchObject({ pageID: 'page-2' });
});

test('立即保存不弹导出面板，全部导出保留七页顺序和当前最新内容', async () => {
  const sent: Record<string, unknown>[] = [];
  const editor = await openNote(null, message => {
    sent.push(message);
    if (message.type !== 'listPages') return false;
    queueMicrotask(() => window.totNotes.receive({ type: 'result', requestID: message.requestID, ok: true,
      payload: Array.from({ length: 7 }, (_, index) => ({ pageID: `page-${index + 1}`, snapshot: null })) }));
    return true;
  });
  editor.commands.insertContent('项目/会议记录');
  window.totNotes.receive({ type: 'requestSave' });
  await vi.waitFor(() => expect(sent.some(message => message.type === 'save')).toBe(true));
  expect(sent.some(message => message.type === 'exportMarkdown')).toBe(false);
  document.querySelector<HTMLButtonElement>('#export-all')!.click();
  await vi.waitFor(() => expect(sent.some(message => message.type === 'exportAll')).toBe(true));
  const payload = sent.find(message => message.type === 'exportAll')!.payload as { files: { name: string; text: string }[] };
  expect(payload.files).toHaveLength(7);
  expect(payload.files[0]).toEqual({ name: '01-灵感.md', text: '' });
  expect(payload.files[2]).toMatchObject({ name: '03-项目-会议记录.md', text: expect.stringContaining('项目/会议记录') });
});

test('标题快捷键不触发切页，页面内容标记与选中状态独立', async () => {
  const sent: Record<string, unknown>[] = [];
  const editor = await openNote(null, message => { sent.push(message); return false; });
  const tab = document.querySelector<HTMLButtonElement>('[data-page="page-1"]')!;
  expect(tab.getAttribute('aria-current')).toBe('page'); expect(tab.classList.contains('has-content')).toBe(false);
  editor.commands.insertContent('当前页首行');
  expect(tab.querySelector('.tip-copy')?.textContent).toContain('当前页首行'); expect(tab.classList.contains('has-content')).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', metaKey: true, altKey: true, bubbles: true }));
  expect(sent.some(message => message.type === 'loadPage')).toBe(false);
});

test('快捷键冲突保持旧显示并反馈原因', async () => {
  await openNote(null, message => {
    if (message.type !== 'recordHotKey' && message.type !== 'setHotKey') return false;
    queueMicrotask(() => window.totNotes.receive({ type: 'result', requestID: message.requestID,
      ok: message.type === 'recordHotKey', payload: { keyCode: 0, modifiers: 256, label: '⌘A' }, error: '快捷键已被占用' }));
    return true;
  });
  document.querySelector<HTMLButtonElement>('#hotkey-button')!.click();
  await vi.waitFor(() => expect(document.querySelector('#hotkey-message')?.textContent).toBe('快捷键已被占用'));
  expect(document.querySelector('#hotkey-label')?.textContent).toBe('⌃⌥空格');
  expect(document.querySelector<HTMLButtonElement>('#hotkey-button')!.disabled).toBe(false);
});

test('快捷键录制等待期间正文只读，取消后恢复编辑且内容不变', async () => {
  let pending: Record<string, unknown> | undefined;
  const editor = await openNote(null, message => {
    if (message.type !== 'recordHotKey') return false;
    pending = message; return true;
  });
  editor.commands.insertContent('不能被录制按键替换');
  document.querySelector<HTMLButtonElement>('#hotkey-button')!.click();
  await vi.waitFor(() => expect(pending).toBeDefined());
  expect(editor.isEditable).toBe(false);
  window.totNotes.receive({ type: 'hotKeyRecording' });
  expect(document.querySelector('#hotkey-message')?.textContent).toContain('按下新组合键');
  window.totNotes.receive({ type: 'result', requestID: pending!.requestID, ok: true, payload: null });
  await vi.waitFor(() => expect(editor.isEditable).toBe(true));
  expect(editor.getText()).toBe('不能被录制按键替换');
});


test('追加命令保留选区，模态窗口打开时拒绝追加和抢焦点', async () => {
  const editor = await openNote(); editor.commands.insertContent('原文不能覆盖'); editor.commands.selectAll();
  window.totNotes.receive({ type: 'requestAppend' }); editor.commands.insertContent('追加文字');
  expect(editor.getText()).toBe('原文不能覆盖\n\n追加文字');
  const dialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;
  dialog.setAttribute('open', '');
  const before = editor.getJSON(), selection = editor.state.selection.toJSON();
  window.totNotes.receive({ type: 'requestAppend' }); window.totNotes.receive({ type: 'focusEditor' });
  expect(editor.getJSON()).toEqual(before); expect(editor.state.selection.toJSON()).toEqual(selection);
  dialog.removeAttribute('open');
});

test('搜索支持七页切换并选择准确的匹配位置', async () => {
  const snapshot: NoteSnapshot = { schemaVersion: 1, pageID: 'page-2', revision: 1, updatedAt: '2026-10-26T00:00:00Z',
    document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '另一页会议记录' }] }] }, selection: { anchor: 1, head: 1 } };
  await openNote(null, message => {
    if (!['listPages', 'loadPage'].includes(String(message.type))) return false;
    queueMicrotask(() => window.totNotes.receive({ type: 'result', requestID: message.requestID, ok: true,
      payload: message.type === 'listPages' ? [{ pageID: 'page-2', snapshot }] : { snapshot, recovered: false } })); return true;
  });
  window.totNotes.receive({ type: 'requestSearch' });
  const input = document.querySelector<HTMLInputElement>('#search-input')!; input.value = '会议';
  const scope = document.querySelector<HTMLSelectElement>('#search-scope')!; scope.value = 'all'; scope.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(document.querySelector('#search-results button')?.textContent).toContain('另一页会议记录'));
  document.querySelector<HTMLButtonElement>('#search-results button')!.click();
  await vi.waitFor(() => expect(document.querySelector('[aria-current="page"]')?.getAttribute('data-page')).toBe('page-2'));
  const editor = editors.current!; const { from, to } = editor.state.selection;
  expect(editor.state.doc.textBetween(from, to)).toBe('会议');
  expect(document.querySelector<HTMLElement>('#search-panel')!.hidden).toBe(true);
});


test('操作错误在后续保存成功后仍保留，详情可以确认关闭', async () => {
  const editor = await openNote(null, message => {
    if (message.type !== 'exportMarkdown') return false;
    queueMicrotask(() => window.totNotes.receive({ type: 'result', requestID: message.requestID, ok: false, error: '测试导出路径不可写' })); return true;
  });
  document.querySelector<HTMLButtonElement>('#export')!.click();
  await vi.waitFor(() => expect(document.querySelector('#error-summary')?.textContent).toBe('测试导出路径不可写'));
  editor.commands.insertContent('仍可编辑');
  window.totNotes.receive({ type: 'requestSave' });
  await vi.waitFor(() => expect(document.querySelector('#retry')?.textContent).toBe('重试操作'));
  expect(document.querySelector('#error-summary')?.textContent).toBe('测试导出路径不可写');
  const dialog = document.querySelector<HTMLDialogElement>('#error-dialog')!;
  dialog.showModal = () => dialog.setAttribute('open', ''); dialog.close = () => dialog.removeAttribute('open');
  document.querySelector<HTMLButtonElement>('#error-details-button')!.click();
  expect(document.querySelector('#error-description')?.textContent).toBe('测试导出路径不可写');
  document.querySelector<HTMLButtonElement>('#error-close')!.click();
  await vi.waitFor(() => expect(document.querySelector('#status')?.textContent).toBe('已保存'));
});

test('文字样式面板连续应用于原选区，选择段落类型后回到正文', async () => {
  const editor = await openNote(); editor.commands.insertContent('保留这个选区');
  editor.commands.setTextSelection({ from: 1, to: 5 });
  document.querySelector<HTMLButtonElement>('#format-button')!.click();
  document.querySelector<HTMLButtonElement>('[data-format="bold"]')!.click();
  expect(document.querySelector<HTMLElement>('#format')!.hidden).toBe(false);
  document.querySelector<HTMLButtonElement>('[data-format="italic"]')!.click();
  expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('保留这个');
  expect(editor.isActive('bold')).toBe(true); expect(editor.isActive('italic')).toBe(true);
  document.querySelector<HTMLButtonElement>('[data-format="heading1"]')!.click();
  expect(document.querySelector<HTMLElement>('#format')!.hidden).toBe(true);
  expect(editor.isActive('heading', { level: 1 })).toBe(true);
});

test('设置与搜索返回后保留原选区和正文，清理可在原页撤销', async () => {
  const editor = await openNote(); editor.commands.insertContent('返回时保留这里'); editor.commands.setTextSelection({from:2,to:5});
  const selection = editor.state.selection.toJSON(); const before = editor.getJSON();
  document.querySelector<HTMLButtonElement>('#notes-button')!.click(); document.querySelector<HTMLButtonElement>('#settings-button')!.click();
  expect(document.querySelector<HTMLElement>('#editor')!.inert).toBe(true);
  document.querySelector<HTMLButtonElement>('#settings [data-back]')!.click();
  expect(document.querySelector<HTMLElement>('#notes')!.hidden).toBe(false);
  document.querySelector<HTMLButtonElement>('#notes-button')!.click();
  document.querySelector<HTMLButtonElement>('#search-button')!.click(); document.querySelector<HTMLButtonElement>('#search-close')!.click();
  expect(editor.getJSON()).toEqual(before); expect(editor.state.selection.toJSON()).toEqual(selection);
  expect(document.querySelector<HTMLElement>('#editor')!.inert).toBe(false);
  editor.commands.setContent({type:'doc',content:[{type:'taskList',content:[
    {type:'taskItem',attrs:{checked:true},content:[{type:'paragraph',content:[{type:'text',text:'完成项'}]}]},
    {type:'taskItem',attrs:{checked:false},content:[{type:'paragraph',content:[{type:'text',text:'待处理'}]}]},
  ]}]});
  document.querySelector<HTMLButtonElement>('#completed-summary')!.click();
  expect(document.querySelector<HTMLElement>('#completed-panel')!.hidden).toBe(false);
  document.querySelector<HTMLButtonElement>('#clear-completed')!.click();
  await vi.waitFor(()=>expect(document.querySelector<HTMLElement>('#undo-toast')!.hidden).toBe(false));
  expect(editor.getText()).not.toContain('完成项');
  document.querySelector<HTMLButtonElement>('#undo-clear')!.click(); expect(editor.getText()).toContain('完成项');
});

test('空白页插入入口在同一行开始待办并隐藏提示', async () => {
  const editor = await openNote();
  const button = document.querySelector<HTMLButtonElement>('#empty-insert-task');
  expect(button).not.toBeNull(); button!.click(); editor.commands.insertContent('同一行继续写');
  expect(editor.getJSON().content).toHaveLength(1);
  expect(editor.getJSON().content![0].type).toBe('taskList');
  expect(editor.state.doc.firstChild?.childCount).toBe(1);
  expect(editor.state.doc.firstChild?.firstChild?.firstChild?.textContent).toBe('同一行继续写');
  expect(document.querySelector<HTMLElement>('#hint')!.hidden).toBe(true);
});

test('取消备份文件选择后结束等待提示并保留备份页', async () => {
  await openNote(null, message => {
    if (message.type !== 'chooseArchive') return false;
    queueMicrotask(() => window.totNotes.receive({type:'result',requestID:message.requestID,ok:true,payload:null})); return true;
  });
  document.querySelector<HTMLButtonElement>('#backup-button')!.click();
  document.querySelector<HTMLButtonElement>('#backup-import')!.click();
  await vi.waitFor(() => expect(document.querySelector('#backup-message')?.textContent).toBe(''));
  expect(document.querySelector<HTMLElement>('#backup-panel')!.hidden).toBe(false);
});

test('新建正文菜单与快捷键一致，在当前块后插入而非跳到整页末尾', async () => {
  const editor = await openNote();
  editor.commands.setContent('<blockquote><p>当前引用</p></blockquote><p>后面的内容</p>');
  editor.commands.setTextSelection(4);
  document.querySelector<HTMLButtonElement>('#append-button')!.click();
  editor.commands.insertContent('菜单新建正文');
  expect(editor.getJSON().content?.map(node=>node.type)).toEqual(['blockquote','paragraph','paragraph']);
  expect(editor.getJSON().content?.[1]).toEqual({type:'paragraph',content:[{type:'text',text:'菜单新建正文'}]});
});


test('查找和切页只响应约定组合，不吞掉带额外修饰键的操作', async () => {
  const sent: Record<string, unknown>[] = [];
  await openNote(null, message => { sent.push(message); return false; });
  for (const modifiers of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }]) {
    const event = new KeyboardEvent('keydown', { key: 'f', metaKey: true, ...modifiers, bubbles: true, cancelable: true });
    document.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  }
  for (const modifiers of [{ shiftKey: true }, { ctrlKey: true }]) {
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', metaKey: true, altKey: true, ...modifiers, bubbles: true, cancelable: true });
    document.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  }
  expect(sent.some(message => message.type === 'loadPage')).toBe(false);
  const find = new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(find); expect(find.defaultPrevented).toBe(true);
  expect(document.querySelector<HTMLElement>('#search-panel')!.hidden).toBe(false);
});
