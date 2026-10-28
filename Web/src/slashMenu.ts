import type {Editor} from '@tiptap/core';
import {Plugin,PluginKey} from '@tiptap/pm/state';
import {closeHistory} from '@tiptap/pm/history';
import {formats} from './formatting';

const order = ['paragraph','heading1','heading2','task','bulletList','orderedList','blockquote','codeBlock','bold','italic','strike','code','clear'];
const aliases: Record<string,string> = {paragraph:'text 正文 文本',heading1:'h1 heading title 标题',heading2:'h2 subtitle 小标题',task:'todo task checkbox 待办 任务',bulletList:'bullet list 无序 项目列表',orderedList:'number ordered 编号 有序列表',blockquote:'quote 引用',codeBlock:'code block 代码块',bold:'bold 加粗',italic:'italic 斜体',strike:'strike 删除线',code:'inline code 行内代码',clear:'clear 清除格式'};
const glyphs: Record<string,string> = {paragraph:'T',heading1:'H1',heading2:'H2',bold:'B',italic:'I',strike:'S'};
const commands = order.map(id => ({id,label:id === 'task' ? '待办列表' : formats.find(format=>format.id===id)!.label,alias:aliases[id]}));
let nextMenuID = 0;

/** 菜单直接使用编辑器选区与事务，命令文本不会被另存成第二份正文。 */
export function setupSlashMenu(editor: Editor): void {
  const menuID = `slash-menu-${++nextMenuID}`;
  let menu: HTMLDivElement | undefined;
  let options = commands, selected = 0, signature = '', dismissed = '', applying = false;
  let range = {from:0,to:0};
  const hide = (): void => {
    menu?.remove(); menu=undefined;
    editor.view.dom.removeAttribute('aria-controls');editor.view.dom.removeAttribute('aria-expanded');editor.view.dom.removeAttribute('aria-activedescendant');
  };
  const dismiss = (): void => { dismissed=signature; hide(); };
  const position = (): void => {
    if (!menu) return;
    let anchor: {left:number;top:number;bottom:number};
    try {anchor=editor.view.coordsAtPos(range.from);} catch {anchor=editor.view.dom.getBoundingClientRect();}
    const width=Math.min(254,window.innerWidth-24);
    const below=Math.max(0,window.innerHeight-51-anchor.bottom), above=Math.max(0,anchor.top-12);
    const natural=Math.min(300,menu.scrollHeight || 300);
    const openBelow=below>=natural || below>=above;
    const height=Math.max(100,Math.min(natural,openBelow?below:above));
    menu.style.width=`${width}px`;menu.style.maxHeight=`${height}px`;
    menu.style.left=`${Math.max(12,Math.min(anchor.left,window.innerWidth-width-12))}px`;
    const actual=Math.min(menu.offsetHeight || height,height);
    menu.style.top=`${openBelow ? anchor.bottom+7 : Math.max(12,anchor.top-actual-7)}px`;
  };
  const highlight = (): void => {
    const rows=menu?.querySelectorAll<HTMLButtonElement>('[role=option]');
    rows?.forEach((row,index)=>row.setAttribute('aria-selected',String(index===selected)));
    const active=rows?.[selected];
    if(active){
      editor.view.dom.setAttribute('aria-activedescendant',active.id);
      const list=active.parentElement!;
      if(active.offsetTop<list.scrollTop)list.scrollTop=active.offsetTop;
      else if(active.offsetTop+active.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=active.offsetTop+active.offsetHeight-list.clientHeight;
    }
  };
  const apply = (index:number): void => {
    if (!menu || editor.view.composing || !editor.isEditable || !options[index]) return;
    const id=options[index].id; applying=true; hide();
    let chain=editor.chain().focus().command(({tr})=>{closeHistory(tr);return true;}).deleteRange(range);
    switch(id){
      case 'paragraph':chain=chain.setParagraph();break;
      case 'heading1':chain=chain.setHeading({level:1});break;
      case 'heading2':chain=chain.setHeading({level:2});break;
      case 'task':if(!editor.isActive('taskItem'))chain=chain.toggleTaskList();break;
      case 'bulletList':if(!editor.isActive('bulletList'))chain=chain.toggleBulletList();break;
      case 'orderedList':if(!editor.isActive('orderedList'))chain=chain.toggleOrderedList();break;
      case 'blockquote':if(!editor.isActive('blockquote'))chain=chain.toggleBlockquote();break;
      case 'codeBlock':chain=chain.setCodeBlock();break;
      case 'bold':chain=chain.setBold();break;
      case 'italic':chain=chain.setItalic();break;
      case 'strike':chain=chain.setStrike();break;
      case 'code':chain=chain.setCode();break;
      case 'clear':chain=chain.unsetAllMarks().clearNodes();break;
    }
    chain.run(); applying=false;
  };
  const render = (): void => {
    if(applying || editor.isDestroyed)return;
    const {$from,empty}=editor.state.selection;
    const unavailable=!editor.isEditable || editor.view.composing || !empty || $from.parent.type.spec.code || editor.view.dom.closest('[hidden],[inert]');
    const prefix=$from.parent.textBetween(0,$from.parentOffset,'\n','\n');
    const match=unavailable ? null : /^\/([^/\n]{0,32})$/.exec(prefix);
    if(!match){hide();signature='';dismissed='';return;}
    range={from:$from.start(),to:$from.pos};
    const next=`${range.from}:${prefix}`;
    if(next===dismissed){hide();return;}
    if(next!==signature){signature=next;selected=0;}
    options=commands.filter(command=>(command.label+' '+command.alias).toLowerCase().includes(match[1].trim().toLowerCase()));
    if(!menu){menu=document.createElement('div');menu.id=menuID;menu.className='slash-menu';menu.setAttribute('aria-label','选择格式');document.body.append(menu);}
    menu.replaceChildren();
    const title=document.createElement('div');title.className='slash-title';title.textContent='选择格式';menu.append(title);
    const list=document.createElement('div');list.className='slash-options';list.setAttribute('role','listbox');list.id=menuID+'-options';list.setAttribute('aria-label','格式');menu.append(list);
    options.forEach((command,index)=>{
      const button=document.createElement('button');button.type='button';button.className='slash-option';button.id=menuID+'-'+index;button.setAttribute('role','option');
      const glyph=document.createElement('span');glyph.className='slash-glyph';glyph.textContent=glyphs[command.id] ?? '';
      if(!glyph.textContent){const icons:Record<string,string>={task:'task',bulletList:'list',orderedList:'list',blockquote:'quote',code:'code',codeBlock:'code',clear:'type'};glyph.innerHTML=`<svg aria-hidden="true"><use href="#i-${icons[command.id]}"/></svg>`;}
      const label=document.createElement('span');label.textContent=command.label;button.append(glyph,label);
      button.onmousedown=event=>event.preventDefault();button.onclick=()=>apply(index);button.onpointermove=()=>{selected=index;highlight();};list.append(button);
    });
    if(!options.length){const empty=document.createElement('p');empty.className='slash-empty';empty.textContent='没有匹配的格式';list.append(empty);}
    const footer=document.createElement('div');footer.className='slash-footer';footer.textContent='↑↓ 选择 · Enter 应用 · Esc 关闭';menu.append(footer);
    editor.view.dom.setAttribute('aria-expanded','true');editor.view.dom.setAttribute('aria-controls',list.id);
    selected=Math.min(selected,Math.max(0,options.length-1));position();highlight();
  };
  const plugin=new Plugin({key:new PluginKey('jotlet-slash'),props:{handleKeyDown:(_view,event)=>{
    if(!menu || event.isComposing || event.keyCode===229 || editor.view.composing)return false;
    if(event.key==='Escape'){dismiss();return true;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){selected=(selected+(event.key==='ArrowDown'?1:-1)+options.length)%Math.max(1,options.length);highlight();return true;}
    if(event.key==='Enter' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey){if(options.length)apply(selected);return true;}
    return false;
  }}});
  // 优先处理菜单按键，避免 Enter 先被正文的换行键映射消费。
  editor.registerPlugin(plugin,(next,plugins)=>[next,...plugins]);
  editor.on('update',render);editor.on('selectionUpdate',render);editor.on('blur',dismiss);
  const outside=(event:PointerEvent):void=>{if(menu&&!menu.contains(event.target as Node)&&!editor.view.dom.contains(event.target as Node))dismiss();};
  const composing=():void=>hide();
  document.addEventListener('pointerdown',outside);editor.view.dom.addEventListener('compositionstart',composing);
  window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
  editor.on('destroy',()=>{hide();document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',position);document.removeEventListener('scroll',position,true);editor.view.dom.removeEventListener('compositionstart',composing);});
}
