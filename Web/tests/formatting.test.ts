// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import type { Editor, JSONContent } from '@tiptap/core';
import { createNoteEditor } from '../src/editor';
import { applyFormat, formatActive } from '../src/formatting';

let editor: Editor;
afterEach(() => editor?.destroy());
test('格式菜单对原选区加粗、显示状态，并可清除格式及撤销', () => {
  editor = createNoteEditor(document.createElement('div'), () => {});
  editor.commands.insertContent('第一段正文'); editor.commands.setTextSelection({ from: 1, to: 4 });
  expect(applyFormat(editor, 'bold')).toBe(true);
  expect(formatActive(editor, 'bold')).toBe(true);
  expect((editor.getJSON() as JSONContent).content![0].content![0].marks).toEqual([{ type: 'bold' }]);
  applyFormat(editor, 'clear');
  expect(formatActive(editor, 'bold')).toBe(false);
  expect(editor.getText()).toBe('第一段正文');
  editor.commands.undo(); expect(formatActive(editor, 'bold')).toBe(true);
});
test('输入法组合期间格式命令不改写文档', () => {
  editor = createNoteEditor(document.createElement('div'), () => {});
  editor.commands.insertContent('中文'); const before = editor.getJSON();
  editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  expect(applyFormat(editor, 'heading1')).toBe(false);
  expect(editor.getJSON()).toEqual(before);
});
