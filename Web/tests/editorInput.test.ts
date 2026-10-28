// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import type { Editor } from '@tiptap/core';
import { createNoteEditor } from '../src/editor';
import { selectAllNoteText } from '../src/editorInput';
let editor: Editor;
afterEach(()=>editor?.destroy());
function setup() {const host=document.createElement('div');document.body.replaceChildren(host);editor=createNoteEditor(host,()=>{});return editor;}
test('原生全选包含首尾分隔线、引用、待办；删除一次清空，撤销还原结构',()=>{
 setup();editor.commands.setContent('<hr><blockquote><p>引用</p></blockquote><ul data-type="taskList"><li data-type="taskItem"><p>待办</p></li></ul><hr>');
 const before=editor.getJSON();editor.view.dom.focus();
 expect(selectAllNoteText(editor)).toBe(true);expect(editor.state.selection.from).toBe(0);expect(editor.state.selection.to).toBe(editor.state.doc.content.size);
 editor.commands.deleteSelection();expect(editor.getJSON()).toEqual({type:'doc',content:[{type:'paragraph'}]});
 editor.commands.undo();expect(editor.getJSON()).toEqual(before);
});
test('搜索和页名输入框全选只影响自身，其他控件不误选正文',()=>{
 setup();editor.commands.insertContent('保留正文');const selection=editor.state.selection.toJSON();
 const input=document.createElement('input');input.type='search';input.value='查找内容';document.body.append(input);input.focus();
 expect(selectAllNoteText(editor)).toBe(true);expect(input.selectionStart).toBe(0);expect(input.selectionEnd).toBe(4);expect(editor.state.selection.toJSON()).toEqual(selection);
 const button=document.createElement('button');document.body.append(button);button.focus();expect(selectAllNoteText(editor)).toBe(false);
});
test('首行为待办时可勾选、全篇删除并撤销恢复所有格式',()=>{
 setup();editor.commands.setContent('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>任务一</p></li><li data-type="taskItem" data-checked="true"><p>任务二</p></li></ul><blockquote><p>引用</p></blockquote><p>末行正文</p>');
 const checkbox=editor.view.dom.querySelector<HTMLInputElement>('input[type=checkbox]')!;
 checkbox.click();
 expect(editor.state.doc.firstChild?.firstChild?.attrs.checked).toBe(true);
 const before=editor.getJSON();editor.view.dom.focus();
 expect(selectAllNoteText(editor)).toBe(true);
 expect(editor.state.selection.toJSON()).toEqual({type:'all'});
 editor.commands.deleteSelection();expect(editor.getJSON()).toEqual({type:'doc',content:[{type:'paragraph'}]});
 editor.commands.undo();expect(editor.getJSON()).toEqual(before);
});
