// 官网演示使用独立内存数据，不读取应用文件，也不持久化用户输入。
const seeds = [
  {name:'灵感',color:'#b58c28',title:'把一闪而过的念头留下',lines:[['text','一本关于日常小事的书。'],['text','一个只做一件事的小工具。'],['quote','有些想法，写下来才会长大。']]},
  {name:'工作',color:'#b97848',title:'今天，专注这几件事',lines:[['task','整理会议里的三个决定',true],['task','把新想法写进方案'],['task','下班前收好今天的尾巴']]},
  {name:'日常',color:'#b74760',title:'今天，慢慢来。',lines:[['task','给窗边的绿植浇水',true],['task','读完书里的一个章节'],['task','下班路上，买一束花'],['quote','也记得给自己留一点空白。']]},
  {name:'阅读',color:'#9876b0',title:'读到这里，想记一句',lines:[['quote','生活的细节，值得慢慢读。'],['text','下次去书店，挑一本没读过的散文。']]},
  {name:'草稿',color:'#8d8a92',title:'还没写完，也没关系',lines:[['text','嗨，好久不见。'],['text','突然想起上次一起散步的那个傍晚……']]},
  {name:'随想',color:'#459aab',title:'不急着整理的想法',lines:[['text','窗外的光，刚好落在书页上。'],['quote','留一页，给没有名字的念头。']]},
  {name:'生活',color:'#78965b',title:'把周末留给自己',lines:[['task','去附近的新咖啡店'],['task','找条没走过的散步路线'],['task','给家里打个电话']]},
];
let pages = structuredClone(seeds), active = 2, format = 'text';
let drafts = seeds.map(() => ({text:'',format:'text'}));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function allowsMotion() { return !reducedMotion.matches && document.documentElement.dataset.motion !== 'off'; }
let pageAnimation;
const dots = document.querySelector('.page-dots'), input = document.querySelector('#demo-input'), menu = document.querySelector('#slash-menu'), hint = document.querySelector('#demo-hint');
function rowElement(line) {
  const [type,text,done] = line;
  if (type === 'task') {
    const label = document.createElement('label'); label.className = 'task-row';
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = Boolean(done);
    box.addEventListener('change', () => {
      line[2] = box.checked;
      if (allowsMotion() && box.checked) box.animate([{transform:'scale(.8)'},{transform:'scale(1.18)'},{transform:'scale(1)'}],{duration:280,easing:'ease-out'});
    });
    const span = document.createElement('span'); span.textContent = text; label.append(box,span); return label;
  }
  const row = document.createElement(type === 'quote' ? 'blockquote' : type === 'heading' ? 'h3' : 'p');
  row.className = type === 'quote' ? 'note-quote' : type === 'heading' ? 'note-title' : 'note-line'; row.textContent = text; return row;
}
function setFormat(value) {
  format = value; const marker = document.querySelector('#entry-marker');
  marker.className = value === 'task' ? 'task-marker' : ''; marker.textContent = value === 'heading' ? 'H' : value === 'quote' ? '❞' : '';
  input.placeholder = value === 'task' ? '写下一项待办，Enter 添加' : value === 'quote' ? '写下一句引用，Enter 添加' : value === 'heading' ? '写下标题，Enter 添加' : '试试输入 [] 加空格…';
}
function render() {
  const page = pages[active]; document.querySelector('.note-window').style.setProperty('--page',page.color);
  document.querySelector('.hero-visual').style.setProperty('--stage-accent',`color-mix(in srgb, ${page.color} 17%, #f5f0e9)`);
  document.querySelector('#page-number').textContent = String(active + 1).padStart(2,'0'); document.querySelector('#page-name').textContent = page.name;
  dots.querySelectorAll('button').forEach((button,index) => button.setAttribute('aria-pressed',String(index === active)));
  const content = document.querySelector('#note-content'); content.replaceChildren();
  const title = document.createElement('h3'); title.className = 'note-title'; title.textContent = page.title; content.append(title);
  page.lines.forEach(line => content.append(rowElement(line)));
}
seeds.forEach((page,index) => {
  const button = document.createElement('button'); button.type = 'button'; button.style.setProperty('--dot',page.color); button.setAttribute('aria-label',`第 ${index+1} 页 · ${page.name}`); button.title = page.name;
  button.addEventListener('click', () => {
    if (active === index) return;
    // 换页时保留尚未提交的输入，避免演示悄悄吃掉文字。
    const direction=index>active?1:-1;
    drafts[active] = {text:input.value,format}; active=index;
    input.value=drafts[index].text; setFormat(drafts[index].format); menu.hidden=true;
    hint.textContent='输入 [] 加空格，或 / 选择格式'; render();
    pageAnimation?.cancel();
    if (allowsMotion()) pageAnimation=document.querySelector('#note-content').animate(
      [{opacity:.1,transform:`translateX(${direction*16}px)`},{opacity:1,transform:'translateX(0)'}],
      {duration:320,easing:'cubic-bezier(.2,.75,.25,1)'});
    document.querySelector('#note-content').scrollTop=0;
  }); dots.append(button);
});
input.addEventListener('input', event => {
  if (event.isComposing) return;
  if (/^\[\s?\] $/.test(input.value)) {input.value=''; setFormat('task'); hint.textContent='现在直接写待办，Enter 添加到这一页。';}
  menu.hidden = input.value !== '/';
});
input.addEventListener('keydown', event => {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') {menu.hidden=true; return;}
  if (!menu.hidden && (event.key === 'ArrowDown' || event.key === 'Enter')) {event.preventDefault(); menu.querySelector('button').focus(); return;}
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (!input.value.trim()) {setFormat('text'); return;}
  if (pages[active].lines.length >= 15) {hint.textContent='演示最多添加 15 行，可重置后继续体验。'; return;}
  pages[active].lines.push([format,input.value.trim(),false]); input.value=''; render();
  document.querySelector('#note-content').scrollTop = document.querySelector('#note-content').scrollHeight;
  hint.textContent='已添加到演示便签，仅在当前页面保留。';
  if (event.metaKey || event.shiftKey) setFormat('text');
});
menu.addEventListener('click', event => {
  const button = event.target.closest('button[data-format]'); if (!button) return;
  setFormat(button.dataset.format); input.value=''; menu.hidden=true; hint.textContent='写下内容，按 Enter 添加。'; input.focus();
});
menu.addEventListener('keydown', event => {
  if (event.key === 'Escape') {menu.hidden=true; input.focus(); return;}
  if (!['ArrowUp','ArrowDown'].includes(event.key)) return;
  event.preventDefault(); const options=[...menu.querySelectorAll('button')]; const current=options.indexOf(document.activeElement);
  options[(current+(event.key==='ArrowDown'?1:options.length-1))%options.length].focus();
});
document.addEventListener('click',event => {if (!event.target.closest('.demo-entry')) menu.hidden=true;});
document.querySelector('#reset-demo').addEventListener('click',() => {pages=structuredClone(seeds);drafts=seeds.map(() => ({text:'',format:'text'}));active=2;input.value='';setFormat('text');menu.hidden=true;hint.textContent='演示已重置。试试输入 [] 加空格。';render();});
document.querySelector('#try-demo').addEventListener('click',() => {input.focus({preventScroll:true});});
render();

const themeButton=document.querySelector('#demo-theme');
themeButton.addEventListener('click',() => {
  const dark=document.querySelector('.hero-visual').classList.toggle('is-dark');
  themeButton.setAttribute('aria-pressed',String(dark));
  themeButton.setAttribute('aria-label',dark?'切换演示浅色外观':'切换演示深色外观');
  themeButton.querySelector('span').textContent=dark?'日间':'夜间';
});
// 内容始终可读；仅在首次进入视口时播放轻微出现动画。
if ('IntersectionObserver' in window) {
  const reveal=new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      reveal.unobserve(entry.target);
      if (allowsMotion()) entry.target.animate(
        [{opacity:.5,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],
        {duration:440,easing:'cubic-bezier(.2,.75,.25,1)'});
    });
  },{threshold:.12});
  document.querySelectorAll('.section-head,.feature-pages,.keyboard-grid,.faq,.availability').forEach(el=>reveal.observe(el));
}
// 原生 details 仍承担语义与键盘操作；高度动画可被连续点击打断。
document.querySelectorAll('.faq details').forEach(details => {
  let animation,expanded=details.open;
  details.querySelector('summary').addEventListener('click',event => {
    event.preventDefault();
    const start=details.getBoundingClientRect().height;
    expanded=!expanded; animation?.cancel();
    if (!allowsMotion()) {details.open=expanded;return;}
    details.open=true;
    const end=expanded?details.getBoundingClientRect().height:details.querySelector('summary').getBoundingClientRect().height+1;
    details.style.overflow='hidden';
    animation=details.animate([{height:`${start}px`},{height:`${end}px`}],{duration:240,easing:'cubic-bezier(.2,.75,.25,1)'});
    animation.onfinish=()=>{details.open=expanded;details.style.overflow='';animation=null;};
  });
});
reducedMotion.addEventListener('change',event=>{
  if (event.matches) {
    // 主动结束在播动画，立即呈现最终可读状态。
    document.getAnimations().forEach(animation=>{
      if (animation.effect?.getTiming().iterations === Infinity) animation.cancel();
      else animation.finish();
    });
  }
});
