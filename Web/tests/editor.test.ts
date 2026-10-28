// @vitest-environment jsdom
import { afterEach, expect, test } from 'vitest';
import type { Editor, JSONContent } from '@tiptap/core';
import { createNoteEditor, insertTask, toggleCurrentTask } from '../src/editor';

let editor: Editor;
afterEach(() => editor?.destroy());

function setup(): Editor {
  const host = document.createElement('div'); document.body.replaceChildren(host);
  editor = createNoteEditor(host, () => {}); return editor;
}
function json(): JSONContent { return editor.getJSON() as JSONContent; }
function key(name: string): void {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true });
  editor.view.someProp('handleKeyDown', handler => handler(editor.view, event));
}
function type(text: string): void {
  for (const ch of text) {
    const { from, to } = editor.state.selection;
    let handled = false;
    editor.view.someProp('handleTextInput', handler => { handled = handler(editor.view, from, to, ch, () => editor.state.tr.insertText(ch)) || handled; return handled; });
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch));
  }
}

test.each(['[] ', '[ ] ', '- [ ] '])('输入 %s 直接创建任务，允许撤销', prefix => {
  setup(); type(prefix);
  expect(json().content?.[0].type).toBe('taskList');
  expect(editor.commands.undo()).toBe(true);
  if (prefix.startsWith('-')) {
    // 撤销任务转换后恢复此前已形成的普通列表。
    expect(json().content?.[0].type).toBe('bulletList');
    expect(editor.getText().trim()).toBe('[ ]');
  } else expect(editor.getText()).toBe(prefix);
});
test('待办续写、退出空项与完成状态可撤销', () => {
  setup(); type('[] 今天整理会议记录');
  expect(toggleCurrentTask(editor)).toBe(true);
  expect(json().content?.[0].content?.[0].attrs?.checked).toBe(true);
  editor.commands.undo();
  expect(json().content?.[0].content?.[0].attrs?.checked).toBe(false);
  key('Enter');
  expect(json().content?.[0].content).toHaveLength(2);
  key('Enter');
  expect(json().content?.at(-1)?.type).toBe('paragraph');
});
test('子待办缩进反缩进与当前条目内换行', () => {
  setup(); type('[] 父任务'); key('Enter'); type('子任务');
  expect(editor.commands.sinkListItem('taskItem')).toBe(true);
  expect(json().content?.[0].content?.[0].content?.[1].type).toBe('taskList');
  expect(editor.commands.liftListItem('taskItem')).toBe(true);
  editor.commands.setHardBreak();
  expect(json().content?.[0].content?.[1].content?.[0].content?.at(-1)?.type).toBe('hardBreak');
});
test('代码块及输入法组合期间不转换待办', async () => {
  setup(); editor.commands.setCodeBlock(); type('[] ');
  expect(json().content?.[0].type).toBe('codeBlock');
  editor.commands.clearContent();
  editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  type('[] ');
  expect(json().content?.[0].type).toBe('paragraph');
  editor.view.dom.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 30));
});
test('任务行提供布局样式与中文可访问名称', () => {
  setup(); type('[] 写测试');
  const checkbox = editor.view.dom.querySelector('li[data-type="taskItem"] input[type="checkbox"]');
  expect(checkbox).not.toBeNull();
  expect(checkbox?.getAttribute('aria-label')).toContain('待办');
});

test('插入待办保留子层级，新增同级空项且可撤销', () => {
  setup(); type('[] 父项'); key('Enter'); type('子项');
  editor.commands.sinkListItem('taskItem');
  const original = editor.getJSON();
  expect(insertTask(editor)).toBe(true);
  type('第二个子项');
  const children = json().content![0].content![0].content![1].content!;
  expect(children).toHaveLength(2);
  expect(children[0].content![0].content![0].text).toBe('子项');
  expect(children[1].content![0].content![0].text).toBe('第二个子项');
  expect(json().content).toHaveLength(1);
  editor.commands.undo();
  expect(editor.getJSON()).toEqual(original);
});

test('普通段落插入待办保留文字，空待办插入不会退出列表', () => {
  setup(); type('已有正文'); insertTask(editor);
  expect(json().content![0].type).toBe('taskList');
  expect(json().content![0].content![0].content![0].content![0].text).toBe('已有正文');
  insertTask(editor); insertTask(editor);
  expect(json().content![0].content).toHaveLength(3);
  expect(editor.isActive('taskItem')).toBe(true);
  expect(editor.state.selection.$from.parent.textContent).toBe('');
});

test('行内代码末尾连续两个空格退出样式，保留分隔空格和普通续写', () => {
  setup(); editor.commands.setContent('<p><code>hello</code></p>'); editor.commands.setTextSelection(6);
  type('  正文');
  expect(json().content?.[0].content).toEqual([
    { type: 'text', marks: [{ type: 'code' }], text: 'hello' },
    { type: 'text', text: '  正文' },
  ]);
});

test('行内代码内部和末尾单空格保持原格式', () => {
  setup(); editor.commands.setContent('<p><code>hello world</code></p>'); editor.commands.setTextSelection(6);
  type('  '); expect(json().content?.[0].content?.[0].text).toBe('hello   world');
  expect(json().content?.[0].content?.[0].marks?.[0].type).toBe('code');
  editor.commands.setTextSelection(14); type(' '); expect(editor.isActive('code')).toBe(true);
});
test('行内代码双空格退出可撤销，普通段落和代码块不受影响', () => {
  setup(); editor.commands.setContent('<p><code>hello</code></p>');editor.commands.setTextSelection(6);
  type(' ');const before=editor.getJSON();type(' 普通');editor.commands.undo();expect(editor.getJSON()).toEqual(before);
  editor.commands.setContent('<pre><code>hello</code></pre>');editor.commands.setTextSelection(6);type('  more');
  expect(json().content?.[0].type).toBe('codeBlock');expect(editor.getText()).toBe('hello  more');
  editor.commands.setContent('<p>hello</p>');editor.commands.setTextSelection(6);type('  more');expect(editor.getText()).toBe('hello  more');
});
test('输入法组词期间不通过空格退出行内代码', () => {
  setup();editor.commands.setContent('<p><code>hello </code></p>');editor.commands.setTextSelection(7);
  editor.view.dom.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));type(' ');
  expect(editor.isActive('code')).toBe(true);
});
