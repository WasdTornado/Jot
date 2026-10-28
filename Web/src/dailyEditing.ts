import type { Editor, JSONContent } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { TextSelection } from '@tiptap/pm/state';

/** 从当前顶层块退出，新正文不继承引用、列表或文字样式，也不覆盖选区。 */
export function insertPlainParagraphAfterBlock(editor: Editor): boolean {
  if (!editor.isEditable || editor.view.composing) return false;
  const {$to} = editor.state.selection;
  const position = $to.depth > 0 ? $to.after(1) : $to.pos;
  const tr = closeHistory(editor.state.tr);
  tr.insert(position, editor.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, position + 1)).setStoredMarks([]);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

export function fullyCompleted(node: JSONContent): boolean {
  const unfinished = (child: JSONContent): boolean => (child.type === 'taskItem' && !child.attrs?.checked) || !!child.content?.some(unfinished);
  return node.type === 'taskItem' && node.attrs?.checked === true && !node.content?.some(unfinished);
}
export function completedSummary(doc: JSONContent): { total: number; removable: number } {
  let total = 0, removable = 0;
  const visit = (node: JSONContent): void => {
    if (node.type === 'taskItem' && node.attrs?.checked) { total++; if (fullyCompleted(node)) removable++; }
    node.content?.forEach(visit);
  };
  visit(doc); return { total, removable };
}
export function clearCompleted(editor: Editor): boolean {
  if (!editor.isEditable || editor.view.composing) return false;
  const clean = (node: JSONContent): JSONContent | undefined => {
    if (fullyCompleted(node)) return undefined;
    const children = node.content?.map(clean).filter((child): child is JSONContent => !!child);
    if (node.type === 'taskList' && !children?.length) return undefined;
    return children ? { ...node, content: children } : node;
  };
  const doc = clean(editor.getJSON())!;
  if (!doc.content?.length) doc.content = [{ type: 'paragraph' }];
  return editor.chain().command(({ tr }) => { closeHistory(tr); return true; }).setContent(doc).run();
}
