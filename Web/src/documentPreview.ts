import { getSchema, type JSONContent } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { noteExtensions } from './editor';

/** 直接用编辑器结构渲染只读内容，保留格式而不创建可写编辑器。 */
export function renderDocumentPreview(host: HTMLElement, document: JSONContent): void {
  const schema = getSchema(noteExtensions());
  const node = schema.nodeFromJSON(document); node.check();
  const content = window.document.createElement('div'); content.className = 'tiptap preview-document';
  content.append(DOMSerializer.fromSchema(schema).serializeFragment(node.content));
  content.querySelectorAll<HTMLInputElement>('input').forEach(input => { input.disabled = true; input.tabIndex = -1; input.setAttribute('aria-label', `${input.checked ? '已完成' : '未完成'}待办：${input.closest('li')?.textContent?.trim() || '空白待办'}`); });
  content.querySelectorAll<HTMLAnchorElement>('a').forEach(link => { link.removeAttribute('href'); link.tabIndex = -1; });
  if (!node.textContent && node.childCount === 1 && node.firstChild?.type.name === 'paragraph') content.textContent = '空白便签';
  host.replaceChildren(content);
}
