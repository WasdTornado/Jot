// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { createNoteEditor } from '../src/editor';
import { searchDocument } from '../src/search';
test('跨行内格式查找中文，定位到实际编辑器位置且保留大小写搜索', () => {
  const editor = createNoteEditor(document.createElement('div'), () => {});
  editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'text', text: '会议' }, { type: 'text', text: '记录', marks: [{ type: 'bold' }] }, { type: 'text', text: ' API api' },
  ] }] });
  const matches = searchDocument(editor.getJSON(), '会议记录');
  expect(matches).toHaveLength(1);
  editor.commands.setTextSelection(matches[0]);
  expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('会议记录');
  expect(searchDocument(editor.getJSON(), 'api')).toHaveLength(2); editor.destroy();
});

test('查找支持方向键选择下一条并 Enter 打开，内容含特殊字符仍按文本显示', async () => {
  const { setupSearch } = await import('../src/search');
  const { vi } = await import('vitest');
  document.body.innerHTML = '<section id="search-panel" hidden><input id="search-input"><select id="search-scope"><option value="all">全部</option></select><p id="search-status"></p><div id="search-results"></div><button id="search-close"></button></section>';
  const jump = vi.fn(async () => {});
  const documentJSON = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
  const search = setupSearch(async () => [{ id:'a',name:'日常',document:documentJSON('会议 <script>') },{id:'b',name:'工作',document:documentJSON('会议纪要')}],jump,()=>{});
  const input = document.querySelector<HTMLInputElement>('#search-input')!; input.value='会议'; search.open();
  await vi.waitFor(() => expect(document.querySelectorAll('#search-results button')).toHaveLength(2));
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await vi.waitFor(() => expect(jump).toHaveBeenCalledWith('b',expect.objectContaining({text:'会议'})));
  expect(document.querySelector('#search-results script')).toBeNull();
});
