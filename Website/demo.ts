import { createDemoStore } from './demo-store';
import { skins } from '../Web/src/skinPicker';
import type { AppSettings } from '../Web/src/pages';
import type { NoteSnapshot } from '../Web/src/types';

const initialSkin = new URLSearchParams(location.search).get('skin');
const store = createDemoStore(skins.find(skin => skin.id === initialSkin)?.id);
const notify = (type: string, extra = {}) => parent.postMessage({type,...extra},location.origin);
function download(text: string, name: string): void {
 const url = URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));
 const link = document.createElement('a'); link.href=url; link.download=name; link.click();
 setTimeout(() => URL.revokeObjectURL(url),1000);
}
window.webkit = {messageHandlers:{notes:{postMessage:raw => {
 const message = raw as {type:string;requestID:string;payload:any};
 const reply = (payload?: unknown, error?: string) => queueMicrotask(() => window.totNotes.receive({type:'result',requestID:message.requestID,ok:!error,payload,error}));
 try {
  switch(message.type) {
   case 'ready': reply({...store.load(store.settings.pageID),settings:store.settings}); break;
   case 'loadPage': reply(store.load(message.payload.pageID)); break;
   case 'listPages': reply(store.list()); break;
   case 'save': reply(store.save(message.payload as NoteSnapshot)); break;
   case 'setSettings': reply(store.configure(message.payload as AppSettings)); break;
   case 'listHistory': reply(store.history(message.payload.pageID)); break;
   case 'restoreHistory': reply(store.restore(message.payload.pageID,message.payload.backupID,message.payload.expectedRevision)); break;
   case 'exportMarkdown': download(message.payload.text,message.payload.name); reply(); break;
   case 'loginStatus': reply({enabled:false,qa:true,message:'登录后启动仅适用于 Mac 应用'}); break;
   case 'hide': case 'quit': document.body.classList.add('demo-hidden'); notify('jot-demo-hidden'); reply(); break;
   case 'editorReady': notify('jot-demo-ready'); reply(); break;
   case 'usageActivity': case 'checkpoint': case 'windowDragRegion': case 'previewSkin': reply(); break;
   default: reply(undefined,'此功能需要在 Mac 应用中使用');
  }
 } catch(error) { reply(undefined,error instanceof Error ? error.message : '演示操作失败'); }
}}}};
window.addEventListener('message',event => {
 if (event.source !== parent || event.origin !== location.origin || !event.data) return;
 const {type,index,panel} = event.data;
 if (type === 'jot-demo-open') {
  document.body.classList.remove('demo-hidden');
  window.totNotes.receive(typeof index === 'number' ? {type:'selectPage',index} : {type:'focusEditor'});
  const panels: Record<string,string>={search:'search-button',notes:'notes-button',skins:'skins-button',format:'format-button',help:'help-button'};
  if(panels[panel]) document.getElementById(panels[panel])?.click();
 } else if(type === 'jot-demo-reset') location.reload();
 else if(type === 'jot-demo-skins') document.querySelector<HTMLButtonElement>('#skins-button')?.click();
});
void import('../Web/src/main').then(() => {
 // 原生专属能力不伪装成网页成功操作；普通编辑与格式快捷键保持原实现。
 for (const selector of ['#window-mode','#pin-button','#check-updates']) {
  const button=document.querySelector<HTMLButtonElement>(selector)!; button.disabled=true;
  button.title='仅在 Mac 应用中可用';
  new MutationObserver(() => {if(!button.disabled) button.disabled=true;}).observe(button,{attributes:true,attributeFilter:['disabled']});
 }
 document.querySelector<HTMLInputElement>('#usage-toggle')!.disabled=true;
 document.querySelector('#usage-hint')!.textContent='网页试写不计入应用活跃统计；此开关仅在 Mac 应用中生效。';
 const shortcutPanel=document.querySelector('#help-panel')!;
 const updateShortcuts=() => {
  shortcutPanel.querySelectorAll<HTMLButtonElement>('[data-shortcut],.shortcut-reset,.shortcut-key').forEach(button => { button.disabled=true; button.title='快捷键修改仅在 Mac 应用中可用'; });
 };
 updateShortcuts(); new MutationObserver(updateShortcuts).observe(document.querySelector('#editable-shortcuts')!,{childList:true,subtree:true});
 document.querySelector('.shortcut-section-title span')!.textContent='Mac 应用支持修改';
 document.querySelector('#shortcut-message')!.textContent='网页使用默认编辑快捷键；部分组合可能由浏览器保留。';
 document.querySelector('#quit')!.childNodes.forEach(node => {if(node.nodeType===Node.TEXT_NODE) node.textContent='收起演示 ';});
 const historyMessage=document.querySelector('#history-message')!;
 const clarifyHistory=() => {
  if(historyMessage.textContent?.startsWith('还没有历史备份。')) historyMessage.textContent='正文修改后会留下临时版本；刷新网页后清空。';
 };
 new MutationObserver(clarifyHistory).observe(historyMessage,{childList:true});
 document.querySelector('.history-summary span')!.textContent='当前网页 · 最近 10 个临时版本';
 const status=document.querySelector<HTMLElement>('#status')!;
 const markTemporary=() => {
  if(status.dataset.error === 'false' && status.textContent === '已保存') status.textContent='本页暂存';
 };
 new MutationObserver(markTemporary).observe(status,{childList:true,characterData:true,subtree:true});markTemporary();

});
