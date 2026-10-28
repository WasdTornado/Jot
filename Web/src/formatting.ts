import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';

export const formats = [
  { id: 'paragraph', label: '正文', shortcut: '⌘⌥0' },
  { id: 'heading1', label: '标题', shortcut: '⌘⌥1' },
  { id: 'heading2', label: '小标题', shortcut: '⌘⌥2' },
  { id: 'bold', label: '加粗', shortcut: '⌘B' },
  { id: 'italic', label: '斜体', shortcut: '⌘I' },
  { id: 'strike', label: '删除线', shortcut: '⌘⇧S' },
  { id: 'code', label: '行内代码', shortcut: '⌘E' },
  { id: 'bulletList', label: '无序列表', shortcut: '⌘⇧8' },
  { id: 'orderedList', label: '有序列表', shortcut: '⌘⇧7' },
  { id: 'blockquote', label: '引用', shortcut: '⌘⇧B' },
  { id: 'codeBlock', label: '代码块', shortcut: '⌘⌥C' },
  { id: 'clear', label: '清除格式', shortcut: '' },
] as const;
export type Format = typeof formats[number]['id'];
export function formatActive(editor: Editor, format: Format): boolean {
  if (format === 'clear') return false;
  if (format.startsWith('heading')) return editor.isActive('heading', { level: Number(format.at(-1)) });
  return editor.isActive(format);
}
export function applyFormat(editor: Editor, format: Format): boolean {
  if (editor.view.composing || !editor.isEditable) return false;
  const chain = editor.chain().focus().command(({ tr }) => { closeHistory(tr); return true; });
  switch (format) {
    case 'paragraph': return chain.setParagraph().run();
    case 'heading1': return chain.toggleHeading({ level: 1 }).run();
    case 'heading2': return chain.toggleHeading({ level: 2 }).run();
    case 'bold': return chain.toggleBold().run();
    case 'italic': return chain.toggleItalic().run();
    case 'strike': return chain.toggleStrike().run();
    case 'code': return chain.toggleCode().run();
    case 'bulletList': return chain.toggleBulletList().run();
    case 'orderedList': return chain.toggleOrderedList().run();
    case 'blockquote': return chain.toggleBlockquote().run();
    case 'codeBlock': return chain.toggleCodeBlock().run();
    case 'clear': return chain.unsetAllMarks().clearNodes().run();
  }
}
