import type { JSONContent } from '@tiptap/core';

export function describeNote(document: JSONContent | null | undefined): { title: string; hasContent: boolean } {
  if (!document) return { title: '', hasContent: false };
  const lines: string[] = [];
  const text = (node: JSONContent): string => node.type === 'hardBreak' ? '\n' : (node.text ?? '') + (node.content ?? []).map(text).join('');
  const visit = (node: JSONContent): void => {
    if (['paragraph', 'heading', 'codeBlock'].includes(node.type ?? '')) lines.push(text(node));
    else node.content?.forEach(visit);
  };
  visit(document);
  const title = lines.join('\n').split('\n').map(line => line.trim()).find(Boolean) ?? '';
  const empty = document.content?.every(node => node.type === 'paragraph' && !text(node).trim());
  return { title: Array.from(title).slice(0, 48).join(''), hasContent: !empty };
}
export function exportName(title: string, fallback: string): string {
  const clean = title.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '-').replace(/^[.\s-]+|[.\s-]+$/g, '');
  let name = '';
  for (const character of Array.from(clean || fallback).slice(0, 60)) {
    if (new TextEncoder().encode(name + character).length > 210) break;
    name += character;
  }
  return `${name}.md`;
}
