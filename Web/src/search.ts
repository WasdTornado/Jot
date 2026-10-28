import { getSchema, type JSONContent } from '@tiptap/core';
import { Node } from '@tiptap/pm/model';
import { noteExtensions } from './editor';
const schema = getSchema(noteExtensions());
export interface SearchMatch { from: number; to: number; text: string; snippet: string }
export function searchDocument(content: JSONContent, query: string): SearchMatch[] {
  if (!query.trim()) return [];
  const expression = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const doc = Node.fromJSON(schema, content); const matches: SearchMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock || matches.length >= 100) return;
    const text = node.textBetween(0, node.content.size, '\n', '\n');
    for (const match of text.matchAll(expression)) {
      if (matches.length >= 100) break;
      const from = pos + 1 + match.index;
      matches.push({ from, to: from + match[0].length, text: match[0], snippet:
        Array.from(text.slice(0, match.index)).slice(-16).join('') + match[0] + Array.from(text.slice(match.index + match[0].length)).slice(0, 24).join('') });
    }
    return false;
  });
  return matches;
}
export interface SearchPage { id: string; name: string; document?: JSONContent; error?: string }
export function setupSearch(load: (all: boolean) => Promise<SearchPage[]>, jump: (pageID: string, match: SearchMatch) => Promise<void>, onError: (error: unknown) => void, onClose: (jumped: boolean) => void = () => {}) {
  const panel = document.querySelector<HTMLElement>('#search-panel')!;
  const input = document.querySelector<HTMLInputElement>('#search-input')!;
  const scope = document.querySelector<HTMLSelectElement>('#search-scope')!;
  const results = document.querySelector<HTMLElement>('#search-results')!;
  const status = document.querySelector<HTMLElement>('#search-status')!;
  let generation = 0, selected = 0, jumping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = (jumped = false): void => {
    generation++; clearTimeout(timer); const wasOpen = !panel.hidden; panel.hidden = true;
    if (wasOpen) onClose(jumped);
  };
  const select = (index: number): void => {
    const rows = [...results.querySelectorAll<HTMLButtonElement>('button')];
    selected = Math.max(0, Math.min(index, rows.length - 1));
    rows.forEach((row, i) => { row.classList.toggle('selected', i === selected); row.setAttribute('aria-pressed', String(i === selected)); });
    rows[selected]?.scrollIntoView?.({ block:'nearest' });
  };
  const refresh = async (): Promise<void> => {
    const current = ++generation, query = input.value;
    results.replaceChildren(); selected = 0;
    if (!query.trim()) { status.textContent = '输入想找的文字'; return; }
    status.textContent = '正在查找…';
    try {
      const pages = await load(scope.value === 'all');
      if (current !== generation || panel.hidden) return;
      let count = 0; const unavailable: string[] = [];
      for (const page of pages) {
        if (page.error) { unavailable.push(page.name); continue; }
        if (!page.document) continue;
        for (const match of searchDocument(page.document, query)) {
          if (count >= 100) break; const index = count++;
          const button = document.createElement('button'); button.type = 'button';
          const name = document.createElement('small'); name.textContent = page.name;
          const snippet = document.createElement('p');
          // 原文以文本节点加入，搜索内容不能作为 HTML 执行。
          const offset = match.snippet.toLocaleLowerCase().indexOf(match.text.toLocaleLowerCase());
          snippet.append(document.createTextNode(match.snippet.slice(0, offset)));
          const mark = document.createElement('mark'); mark.textContent = match.snippet.slice(offset, offset + match.text.length); snippet.append(mark, document.createTextNode(match.snippet.slice(offset + match.text.length)));
          button.append(name, snippet); button.onfocus = () => select(index);
          button.onclick = () => {
            if (jumping) return; jumping = true; results.inert = true;
            void jump(page.id, match).then(() => close(true)).catch(error => { onError(error); void refresh(); })
              .finally(() => { jumping = false; results.inert = false; });
          };
          results.append(button);
        }
      }
      select(0);
      status.textContent = `${count >= 100 ? '前 100' : count} 处匹配${unavailable.length ? '；无法读取：' + unavailable.join('、') : ''}`;
      if (!count) { const empty = document.createElement('p'); empty.className = 'small-note'; empty.textContent = `没有找到“${query}”，换个关键词试试。`; results.append(empty); }
    } catch (error) { if (current === generation) { status.textContent = '查找失败，请重新输入重试'; onError(error); } }
  };
  input.addEventListener('input', () => { generation++; clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 120); });
  scope.addEventListener('change', () => { void refresh(); });
  document.querySelectorAll<HTMLButtonElement>('[data-search-scope]').forEach(button => button.addEventListener('click', () => {
    scope.value = button.dataset.searchScope!;
    document.querySelectorAll('[data-search-scope]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    void refresh(); input.focus();
  }));
  panel.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!jumping) close(); }
    if (['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); select(selected + (event.key === 'ArrowDown' ? 1 : -1)); }
    if (event.key === 'Enter' && event.target === input) { event.preventDefault(); results.querySelectorAll<HTMLButtonElement>('button')[selected]?.click(); }
  });
  document.querySelector('#search-close')!.addEventListener('click', () => { if (!jumping) close(); });
  return { close, get isOpen() { return !panel.hidden; }, open() { panel.hidden = false; input.focus(); input.select(); void refresh(); } };
}
