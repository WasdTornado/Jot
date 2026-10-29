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
test('块状全选不写入正文，移动光标后恢复普通选区，替换和撤销保留内容',()=>{
 setup();editor.commands.setContent('<p>普通正文</p><ul data-type="taskList"><li data-type="taskItem"><p>待办</p></li></ul><blockquote><p>引用</p></blockquote>');
 const before=editor.getJSON();editor.view.dom.focus();selectAllNoteText(editor);
 expect(editor.view.dom.classList.contains('note-all-selected')).toBe(true);
 expect(editor.getJSON()).toEqual(before);
 editor.commands.setTextSelection({from:1,to:3});
 expect(editor.view.dom.classList.contains('note-all-selected')).toBe(false);
 selectAllNoteText(editor);editor.commands.insertContent('新内容');
 expect(editor.getText()).toBe('新内容');
 expect(editor.view.dom.classList.contains('note-all-selected')).toBe(false);
 editor.commands.undo();expect(editor.getJSON()).toEqual(before);
});
test('鼠标式跨块选区只铺满完整内容块，首尾部分文字与反向选择保持准确',()=>{
 setup();editor.commands.setContent('<p>首行正文</p><ul data-type="taskList"><li data-type="taskItem"><p>任务一</p></li><li data-type="taskItem"><p>任务二</p></li></ul><p>末行正文</p>');
 const before=editor.getJSON();
 const texts: number[]=[];editor.state.doc.descendants((node,pos)=>{if(node.isText)texts.push(pos);});
 for(const range of [{from:texts[0]+2,to:texts[3]+2},{from:texts[3]+2,to:texts[0]+2}]) {
   editor.commands.setTextSelection(range);
   expect([...editor.view.dom.querySelectorAll('.note-selected-block')].map(n=>n.querySelector('p')?.textContent)).toEqual(['任务一','任务二']);
   expect(editor.state.doc.textBetween(editor.state.selection.from,editor.state.selection.to,'|')).toBe('正文|任务一|任务二|末行');
   expect(editor.getJSON()).toEqual(before);
 }
 editor.commands.setTextSelection(texts[0]);expect(editor.view.dom.querySelector('.note-selected-block')).toBeNull();
});
