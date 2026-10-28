import type { JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { noteExtensions } from './editor';

class NoteMarkdownManager extends MarkdownManager {
  override renderNodeToMarkdown(node: JSONContent, parent?: JSONContent, index = 0, level = 0, meta: Record<string, unknown> = {}): string {
    const rendered = super.renderNodeToMarkdown(node, parent, index, level, meta);
    if (node.type !== 'paragraph') return rendered;
    // 仅保护段落正文的块语法；标题、列表和代码仍由节点序列化器处理。
    return rendered.split('\n').map(line => line
      .replace(/^( {0,3})(#{1,6})(?=\s|$)/, '$1\\$2')
      .replace(/^( {0,3})([-+])(?=\s|(?:\s*-){2,}\s*$)/, '$1\\$2')
      .replace(/^( {0,3})(\d{1,9})([.)])(?=\s|$)/, '$1$2\\$3')
      .replace(/^( {0,3})(=)(?==*\s*$)/, '$1\\$2')).join('\n');
  }
}
const manager = new NoteMarkdownManager({ extensions: noteExtensions(), indentation: { style: 'space', size: 2 } });
export function serializeMarkdown(document: JSONContent): string { return manager.serialize(document); }
export function parseMarkdown(source: string): JSONContent { return manager.parse(source); }
