// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import type { Editor, JSONContent } from '@tiptap/core';
import { createNoteEditor } from '../src/editor';
import { insertPlainParagraphAfterBlock, clearCompleted, completedSummary } from '../src/dailyEditing';
let editor: Editor;
afterEach(() => editor?.destroy());
test('新建正文保留选区文字，撤销只撤销本次插入', () => {
  editor = createNoteEditor(document.createElement('div'), () => {});
  editor.commands.insertContent('原来的重要正文'); editor.commands.setTextSelection({ from: 1, to: 5 });
  expect(insertPlainParagraphAfterBlock(editor)).toBe(true);
  editor.commands.insertContent('追加内容');
  expect(editor.getText()).toBe('原来的重要正文\n\n追加内容');
  expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  editor.commands.undo(); expect(editor.getText()).toBe('原来的重要正文');
});

test('清理已完成保留未完成子项及正文，一次撤销还原完整结构', () => {
  editor = createNoteEditor(document.createElement('div'), () => {});
  const item = (text: string, checked: boolean, children: JSONContent[] = []) => ({ type: 'taskItem', attrs: { checked }, content: [
    { type: 'paragraph', content: [{ type: 'text', text }] }, ...children,
  ] });
  editor.commands.setContent({ type: 'doc', content: [{ type: 'taskList', content: [
    item('完成但子项未完成', true, [{ type: 'taskList', content: [item('仍需跟进', false)] }]),
    item('可清理', true), item('保留', false),
  ] }] });
  const before = editor.getJSON();
  expect(completedSummary(before)).toEqual({ total: 2, removable: 1 });
  expect(clearCompleted(editor)).toBe(true);
  expect(editor.getText()).toContain('仍需跟进'); expect(editor.getText()).toContain('完成但子项未完成');
  expect(editor.getText()).not.toContain('可清理');
  editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
});


test('折叠不改变正文，光标移入完成项时重新显示，全部清理后仍能撤销', async () => {
  const { setCompletedFold } = await import('../src/completedFold');
  editor = createNoteEditor(document.createElement('div'), () => {});
  editor.commands.setContent({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '完成' }] }] }] },
  ] });
  editor.commands.setTextSelection(1); const before = editor.getJSON();
  setCompletedFold(editor, true);
  expect(editor.view.dom.querySelector('.completed-folded')).not.toBeNull();
  expect(editor.getJSON()).toEqual(before);
  editor.commands.setTextSelection(7);
  expect(editor.view.dom.querySelector('.completed-folded')).toBeNull();
  clearCompleted(editor); expect(editor.getText()).toBe('正文');
  editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
});

test('⌘Enter 在引用后新建无格式正文，保留引用并支持一次撤销', () => {
  editor = createNoteEditor(document.createElement('div'), () => {});
  editor.commands.setContent('<blockquote><p><strong>引用内容</strong></p></blockquote><p>后续内容</p>');
  editor.commands.setTextSelection(4);
  const before = editor.getJSON();
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));
  expect(editor.state.selection.$from.depth).toBe(1);
  expect(editor.state.selection.$from.parent.type.name).toBe('paragraph');
  editor.commands.insertContent('普通正文');
  expect(editor.getJSON().content?.map(node=>node.type)).toEqual(['blockquote','paragraph','paragraph']);
  expect(editor.getJSON().content?.[1]).toEqual({type:'paragraph',content:[{type:'text',text:'普通正文'}]});
  editor.commands.undo(); expect(editor.getJSON()).toEqual(before);
});

// jsdom 默认平台将 Mod 映射为 Control；macOS 的 Command 另外在原生窗口验收。
const press = (editor: Editor, modifiers: KeyboardEventInit = {}) => editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter',bubbles:true,cancelable:true,...modifiers}));
test.each([
 '<h1><em>标题</em></h1>',
 '<pre><code>代码内容</code></pre>',
 '<ul><li><p>项目</p><ul><li><p>子项</p></li></ul></li></ul>',
 '<ol><li><p>编号</p></li></ol>',
 '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>待办</p></li></ul>',
 '<p><strong><em><s>格式正文</s></em></strong></p>',
])('⌘Enter 退出整个格式块并保留原内容：%s', html => {
 editor = createNoteEditor(document.createElement('div'), () => {});
 editor.commands.setContent(html);editor.commands.setTextSelection(editor.state.doc.content.size-2);
 const before = editor.getJSON();press(editor,{ctrlKey:true});editor.commands.insertContent('新正文');
 expect(editor.getJSON().content?.slice(0,-1)).toEqual(before.content);
 expect(editor.getJSON().content?.at(-1)).toEqual({type:'paragraph',content:[{type:'text',text:'新正文'}]});
});

test('Enter 继续引用；⌘⇧Enter 切换待办完成；⌘Enter 保留选区原文', () => {
 editor = createNoteEditor(document.createElement('div'), () => {});
 editor.commands.setContent('<blockquote><p>引用</p></blockquote>');editor.commands.setTextSelection(4);
 press(editor);editor.commands.insertContent('继续引用');expect(editor.state.selection.$from.node(1).type.name).toBe('blockquote');
 editor.commands.setContent('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>待办</p></li></ul>');
 editor.commands.setTextSelection({from:3,to:5});press(editor,{ctrlKey:true,shiftKey:true});
 expect(editor.getAttributes('taskItem').checked).toBe(true);press(editor,{ctrlKey:true});
 expect(editor.state.doc.firstChild?.textContent).toBe('待办');expect(editor.state.doc.lastChild?.type.name).toBe('paragraph');
});

test('组合输入和只读状态不新建段落，斜杠菜单不抢占 ⌘Enter', () => {
 editor = createNoteEditor(document.createElement('div'), () => {});
 editor.commands.insertContent('/');press(editor,{ctrlKey:true});
 expect(editor.state.doc.childCount).toBe(2);expect(editor.state.doc.firstChild?.textContent).toBe('/');
 const before=editor.getJSON();editor.setEditable(false);press(editor,{ctrlKey:true});expect(editor.getJSON()).toEqual(before);
 editor.setEditable(true);editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
 press(editor,{ctrlKey:true});expect(editor.getJSON()).toEqual(before);
});

test('Shift Enter 与 Mod Enter 一致，退出引用且清除文字样式', () => {
 editor = createNoteEditor(document.createElement('div'), () => {});
 editor.commands.setContent('<blockquote><p><strong>引用</strong></p></blockquote>');
 editor.commands.setTextSelection(4);press(editor,{shiftKey:true});editor.commands.insertContent('普通正文');
 expect(editor.getJSON().content?.[1]).toEqual({type:'paragraph',content:[{type:'text',text:'普通正文'}]});
});
