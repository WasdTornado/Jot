import { InlineCodeExit, selectAllNoteText } from './editorInput';
import { setupSlashMenu } from './slashMenu';
import { insertPlainParagraphAfterBlock } from './dailyEditing';
import { Editor, Extension, InputRule } from '@tiptap/core';
import { CompletedFold } from './completedFold';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { closeHistory } from '@tiptap/pm/history';

const NoteTaskItem = TaskItem.extend({
  addNodeView() {
    const create = this.parent?.();
    if (!create) return null;
    return props => {
      const view = create(props);
      // WebKit 从不可编辑的复选框开始全选时，会只显示末尾光标。
      // 让正文成为 DOM 的起点；复选框仍由 CSS 排在视觉上的左侧。
      if (view.dom instanceof HTMLElement && view.contentDOM) {
        const label = view.dom.querySelector(':scope > label');
        if (label) view.dom.append(label);
      }
      return view;
    };
  },
  addInputRules() {
    return [new InputRule({
      find: /^\s*\[( |x)?\]\s$/,
      handler: ({ chain, range, match }) => {
        if (this.editor.isActive('taskItem')) return null;
        chain().deleteRange(range).toggleList('taskList', 'taskItem')
          .updateAttributes('taskItem', { checked: match[1] === 'x' }).run();
      },
    })];
  },
});

export function noteExtensions() {
  return [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false }, trailingNode: false }),
    InlineCodeExit, CompletedFold, TaskList, NoteTaskItem.configure({ nested: true, HTMLAttributes: { 'data-type': 'taskItem' },
      a11y: { checkboxLabel: (node, checked) => `${checked ? '已完成' : '未完成'}待办：${node.textContent || '空白'}` } })];
}

export function toggleCurrentTask(editor: Editor): boolean {
  if (!editor.isActive('taskItem')) return false;
  return editor.commands.updateAttributes('taskItem', { checked: !editor.getAttributes('taskItem').checked });
}

export function insertTask(editor: Editor): boolean {
  if (editor.view.composing) return false;
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name !== 'taskItem') continue;
    // 在当前条目后新增同级待办，保留原有正文、勾选状态和子待办。
    const position = $from.after(depth);
    return editor.chain().command(({ tr }) => {
      // 菜单插入作为独立撤销步骤，避免把此前的缩进等操作一并撤销。
      closeHistory(tr); return true;
    }).insertContentAt(position, {
      type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }],
    }, { updateSelection: false }).setTextSelection(position + 2).focus().run();
  }
  return editor.chain().focus().toggleTaskList().run();
}

export function createNoteEditor(element: HTMLElement, onChange: () => void): Editor {
  const editor = new Editor({
    element, extensions: [...noteExtensions(), Extension.create({
      name: 'noteKeys', priority: 1000,
      addKeyboardShortcuts() { return {
        'Mod-a': () => selectAllNoteText(this.editor, this.editor.view.dom),
        'Mod-Enter': () => insertPlainParagraphAfterBlock(this.editor),
        'Shift-Enter': () => insertPlainParagraphAfterBlock(this.editor),
        'Mod-Shift-Enter': () => !this.editor.view.composing && this.editor.isEditable && toggleCurrentTask(this.editor),
      }; },
    })],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: { attributes: { role: 'textbox', 'aria-label': '便签正文', 'aria-multiline': 'true', spellcheck: 'false' } },
    onUpdate: onChange,
  });
  setupSlashMenu(editor); return editor;
}
