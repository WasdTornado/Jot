import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { AllSelection, TextSelection, Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';

/** 仅装饰完整选中的块；首尾部分文字仍按真实选区显示，避免误导删除范围。 */
export const BlockSelectionAppearance = Extension.create({
  name: 'blockSelectionAppearance',
  addProseMirrorPlugins() {
    return [new Plugin({ props: {
      attributes: ({ selection }) => ({ class: selection.empty ? '' :
        selection instanceof AllSelection ? 'note-block-selection note-all-selected' :
        selection instanceof TextSelection ? 'note-block-selection' : '' }),
      decorations: ({ doc, selection }) => {
        if (selection.empty || !(selection instanceof AllSelection || selection instanceof TextSelection)) return null;
        const blocks: Decoration[] = [];
        doc.nodesBetween(selection.from, selection.to, (node, pos) => {
          if (!node.isBlock || ['bulletList', 'orderedList', 'taskList'].includes(node.type.name)) return;
          let start = pos + 1, end = pos + node.nodeSize - 1;
          if (!node.isTextblock) {
            start = Infinity; end = -Infinity;
            node.descendants((child, offset) => {
              if (child.isTextblock) { start = Math.min(start, pos + offset + 2); end = Math.max(end, pos + offset + child.nodeSize); return false; }
            });
          }
          if (selection.from <= start && selection.to >= end) {
            blocks.push(Decoration.node(pos, pos + node.nodeSize, { class: 'note-selected-block' }));
            return false;
          }
        });
        return DecorationSet.create(doc, blocks);
      },
    } })];
  },
});

/** 原生菜单和快捷键都选中完整文档，包含分隔线、列表等结构节点。 */
export function selectAllNoteText(editor?: Editor, active: Element | null = document.activeElement): boolean {
  if (active instanceof HTMLTextAreaElement || (active instanceof HTMLInputElement && /^(text|search|url|tel|password)$/.test(active.type))) {
    active.select(); return true;
  }
  if (!editor || editor.view.composing || !active || !editor.view.dom.contains(active)) return false;
  return editor.chain().command(({ tr }) => { closeHistory(tr); return true; }).selectAll().run();
}

/** 仅在行内代码末尾双空格时退出；代码内部空格、粘贴及输入法组词保持原行为。 */
export const InlineCodeExit = Extension.create({
  name: 'inlineCodeExit', priority: 1100,
  addProseMirrorPlugins() {
    return [new Plugin({ props: {
      handleTextInput: (view, from, to, text) => {
        const code = view.state.schema.marks.code;
        if (text !== ' ' || from !== to || view.composing || !view.editable || !code) return false;
        const $from = view.state.doc.resolve(from);
        if (!code.isInSet(view.state.storedMarks ?? $from.marks())) return false;
        const before = $from.nodeBefore;
        const after = $from.nodeAfter;
        if (!before?.isText || !code.isInSet(before.marks) || !before.text?.endsWith(' ')) return false;
        if (after && code.isInSet(after.marks)) return false;
        const tr = view.state.tr.removeMark(from - 1, from, code).insertText(' ', from, to);
        tr.removeMark(from, from + 1, code);
        tr.setStoredMarks((view.state.storedMarks ?? $from.marks()).filter(mark => mark.type !== code));
        view.dispatch(tr); return true;
      },
    } })];
  },
});
