// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { createDemoStore } from '../../Website/demo-store';
import { pages } from '../src/pages';
import { parseMarkdown, serializeMarkdown } from '../src/markdown';

test('官网内存桥隔离七页、保存版本及历史恢复，不写浏览器存储', () => {
 const storage=vi.spyOn(Storage.prototype,'setItem');
 const store=createDemoStore('cream'), id=pages[2].id;
 const initial=store.load(id).snapshot;
 expect(store.list()).toHaveLength(7);
 const edited={...initial,revision:1,document:parseMarkdown('- [ ] 官网待办\n\n> 引用')};
 expect(store.save(edited)).toEqual({pageID:id,revision:1,ignored:false});
 edited.document=parseMarkdown('修改调用方对象');
 expect(serializeMarkdown(store.load(id).snapshot.document)).toContain('官网待办');
 expect(store.save({...initial,revision:0}).ignored).toBe(true);
 expect(store.load(pages[0].id).snapshot.document).not.toEqual(store.load(id).snapshot.document);
 expect(store.history(id)).toHaveLength(1);
 expect(store.restore(id,'0',1).revision).toBe(2);
 expect(store.load(id).snapshot.document).toEqual(initial.document);
 expect(store.settings.skin).toBe('cream');
 expect(createDemoStore().load(id).snapshot.document).toEqual(initial.document);
 expect(storage).not.toHaveBeenCalled();storage.mockRestore();
});

const editors=vi.hoisted(()=>({all:[] as import('@tiptap/core').Editor[]}));
vi.mock('../src/editor',async original=>{
 const actual=await original<typeof import('../src/editor')>();
 return {...actual,createNoteEditor:(...args:Parameters<typeof actual.createNoteEditor>)=>{
  const editor=actual.createNoteEditor(...args);editors.all.push(editor);return editor;
 }};
});
test('官网真实界面完成加载、切页、换肤，并明确禁用原生专属操作',async()=>{
 const html=(await import('../index.html?raw')).default;
 document.body.innerHTML=html;
 Range.prototype.getClientRects=()=>Object.assign([],{item:()=>null});
 Range.prototype.getBoundingClientRect=()=>new DOMRect();
 await import('../../Website/demo');
 try {
  await vi.waitFor(()=>expect(document.querySelector('#status')?.textContent).toBe('本页暂存'));
  expect(document.querySelectorAll('.page-tab')).toHaveLength(7);
  editors.all[0].commands.setContent('<p>官网输入验收</p>');
  (document.querySelector('[data-page="page-3"]') as HTMLButtonElement).click();
  await vi.waitFor(()=>expect(document.querySelector('#current-page-name')?.textContent).toBe('工作'));
  (document.querySelector('[data-page="page-1"]') as HTMLButtonElement).click();
  await vi.waitFor(()=>expect(document.querySelector('#editor>div:not([hidden])')?.textContent).toBe('官网输入验收'));
  (document.querySelector('#skins-button') as HTMLButtonElement).click();
  (document.querySelector('[data-preview-skin="sea"]') as HTMLButtonElement).click();
  await vi.waitFor(()=>expect(document.body.dataset.skin).toBe('sea'));
  expect((document.querySelector('#window-mode') as HTMLButtonElement).disabled).toBe(true);
  expect((document.querySelector('#login-toggle') as HTMLInputElement).disabled).toBe(true);
  expect((document.querySelector('[data-shortcut="search"]') as HTMLButtonElement).disabled).toBe(true);
 }finally{editors.all.forEach(editor=>editor.destroy());}
});
