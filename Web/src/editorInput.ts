import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';

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
