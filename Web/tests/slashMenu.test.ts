// @vitest-environment jsdom
import {afterEach,beforeAll,expect,test} from 'vitest';
import {createNoteEditor} from '../src/editor';
import type {Editor} from '@tiptap/core';
let editor: Editor;
beforeAll(()=>{ Range.prototype.getClientRects=()=>Object.assign([],{item:()=>null}); Range.prototype.getBoundingClientRect=()=>new DOMRect(); });
afterEach(()=>{editor?.destroy();document.body.replaceChildren();});
function open(text:string) { const host=document.createElement('div');document.body.append(host);editor=createNoteEditor(host,()=>{});editor.commands.insertContent(text); }
function key(value:string) { const event=new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}); editor.view.dom.dispatchEvent(event);return event; }
test('/ 唤起全部格式并搜索待办，应用后删除命令且同一行输入',()=>{
 open('/todo');
 expect(document.querySelector('[role=listbox]')).not.toBeNull();
 key('Enter');editor.commands.insertContent('今天整理记录');
 expect(editor.isActive('taskList')).toBe(true);expect(editor.state.doc.childCount).toBe(1);expect(editor.state.doc.firstChild?.childCount).toBe(1);expect(editor.state.doc.firstChild?.firstChild?.firstChild?.textContent).toBe('今天整理记录');
 expect(document.querySelector('[role=listbox]')).toBeNull();
});
test('Esc 关闭后保留原文，路径与代码块中的 / 不触发',()=>{
 open('/');key('Escape');expect(editor.getText()).toBe('/');expect(document.querySelector('[role=listbox]')).toBeNull();
 editor.commands.setContent('<p>https://example.com/</p>');editor.commands.setTextSelection(editor.state.doc.content.size-1);
 expect(document.querySelector('[role=listbox]')).toBeNull();
 editor.commands.setContent('<pre><code>/todo</code></pre>');editor.commands.setTextSelection(6);
 expect(document.querySelector('[role=listbox]')).toBeNull();
});
test('方向键选择标题，撤销恢复 / 命令；输入法期间不应用',()=>{
 open('/');key('ArrowDown');key('Enter');expect(editor.isActive('heading',{level:1})).toBe(true);
 editor.commands.undo();expect(editor.getText()).toBe('/');
 editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
 const before=editor.getJSON();key('Enter');expect(editor.getJSON()).toEqual(before);
});

test('现有格式全部可查找；文字样式应用到随后输入，未匹配时不吞掉正文',()=>{
 open('/');expect(document.querySelectorAll('[role=option]')).toHaveLength(13);
 editor.commands.insertContent('bold');key('Enter');editor.commands.insertContent('重要');
 expect(editor.isActive('bold')).toBe(true);expect(editor.state.doc.textContent).toBe('重要');
 editor.commands.setContent('<p>/不存在的格式</p>');editor.commands.setTextSelection(editor.state.doc.content.size-1);
 const before=editor.getJSON();key('Enter');expect(editor.getJSON()).toEqual(before);key('Escape');expect(editor.getJSON()).toEqual(before);
});
