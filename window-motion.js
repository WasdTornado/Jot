const $ = id => document.getElementById(id);
// 内嵌宽度决定控制区是否换行，向官网报告真实高度以免底部动作被裁掉。
new ResizeObserver(() => parent.postMessage({type:'jot-motion-height',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height)},location.origin)).observe(document.querySelector('main'));
const desk=$('desktop'), note=$('note'), top=$('drag-top'), neck=$('neck'), remnant=$('remnant'), tear=$('tear');
let mode='docked', x=0,y=0, scale=1, anchor={x:0,y:0}, home={x:0,y:0}, job=0, drag=null, pinned=false, priorPin=false;
let flight=null;
let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
$('reduced').checked=reduced;
const clamp=(v,a,b)=>Math.min(Math.max(v,a),b);
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const spring=t=>1-Math.exp(-7*t)*Math.cos(11*t);
const speed=()=> $('slow').checked ? 2.5:1;
function announce(text){$('state').textContent=text;desk.dataset.mode=mode;}
function paint(sx=1,sy=1,rotation=0){note.style.transform=`translate(${x}px,${y}px) rotate(${rotation}deg) scale(${scale*sx},${scale*sy})`;}
function updateMode(value){
  mode=value;const free=value==='floating';
  if(free){priorPin=pinned;setPin(true);} else setPin(priorPin);
  $('mode').classList.toggle('free',free);
  $('mode').querySelector('use').setAttribute('href',free?'#floating':'#docked');
  const label=free?'自由拖拽 · 点击回到菜单栏':'跟随菜单栏 · 点击自由拖拽';
  $('mode').title=label;$('mode').setAttribute('aria-label',`当前${label}`);$('mode').querySelector('.tooltip').textContent=label;
  $('gesture-hint').innerHTML=free?'拖动顶部，自在停留 <span>↔</span>':'在便签顶部的空白处向下拖动 <span>↓</span>';
  announce(free?'自由拖拽':'跟随菜单栏');
}
function setPin(value){pinned=value;$('pin').setAttribute('aria-pressed',String(value));$('pin').setAttribute('aria-label',value?'取消置顶':'置顶便签');}
function geometry(){
  const d=desk.getBoundingClientRect(), icon=$('status-icon').getBoundingClientRect();
  scale=Math.min(1,(d.width-30)/440);
  // 网页演示共享菜单栏锚点；应用以真实菜单栏坐标为准。
  const iconCenter=icon.left-d.left+icon.width/2;
  anchor={x:iconCenter,y:63-10*scale};
  home={x:clamp(iconCenter-220*scale,14,d.width-440*scale-14),y:63};
  anchor.x=clamp(anchor.x,home.x+25*scale,home.x+415*scale);
  if(mode==='docked'){x=home.x;y=home.y;} else {x=clamp(x,10,d.width-440*scale-10);y=clamp(y,45,d.height-422*scale-15);}
  paint();connection();
}
// 与原生便签采用相同的圆润肩部和轻圆角尖端。
function pointerPath(tip,base,w){
 const h=tip.y-base.y;
 return `M ${base.x-w} ${base.y} C ${base.x-w*.55} ${base.y} ${tip.x-w*.38} ${base.y+h*.84} ${tip.x-w*.2} ${base.y+h*.9} C ${tip.x-w*.08} ${tip.y+h*.03} ${tip.x+w*.08} ${tip.y+h*.03} ${tip.x+w*.2} ${base.y+h*.9} C ${tip.x+w*.38} ${base.y+h*.84} ${base.x+w*.55} ${base.y} ${base.x+w} ${base.y} Z`;
}
function connection(amount=1){
  if(mode==='floating' || amount<=0){neck.setAttribute('d','');return;}
  const baseX=x+(anchor.x-home.x), baseY=y+1;
  const half=14*scale;
  neck.setAttribute('d',pointerPath(anchor,{x:baseX,y:baseY},half));
  neck.style.opacity=amount;
}
function stop(){cancelAnimationFrame(job);job=0;clearFlight();remnant.setAttribute('d','');tear.setAttribute('d','');$('status-icon').style.transform='';note.style.opacity='1';paint();}
function animate(ms,step,done){
  cancelAnimationFrame(job);const start=performance.now(), duration=reduced?1:ms*speed();
  function tick(now){const t=clamp((now-start)/duration,0,1);step(t);if(t<1)job=requestAnimationFrame(tick);else{job=0;done?.();}}
  job=requestAnimationFrame(tick);
}
function flat(){neck.setAttribute('d','');remnant.setAttribute('d','');tear.setAttribute('d','');}
function reset(){stop();drag=null;updateMode('docked');geometry();$('note').hidden=false;announce('跟随菜单栏');}
function snap(){
  const ax=anchor.x, localX=(anchor.x-home.x)/scale;
  updateMode('floating');flat();announce('连接已松开 · 自由拖拽');
  if(reduced){paint();return;}
  const render=t=>{
    const r=Math.exp(-6*t)*Math.sin(t*13), remaining=(1-t)**3;
    remnant.setAttribute('d',pointerPath({x:ax,y:anchor.y+26*remaining},{x:ax,y:anchor.y},7*remaining));
    // 下半段属于便签自身，继续拖动和缩放时不再滞留于断开瞬间的桌面坐标。
    tear.setAttribute('d',pointerPath({x:localX,y:-10*remaining},{x:localX,y:1},14*remaining));
    paint(1+r*.008,1-r*.009);
  };
  render(0);animate(420,render,()=>{flat();paint();});
}
function rebound(){
  const from={x,y};announce('还没有松开 · 回到原位');
  animate(520,t=>{const p=spring(t);x=mix(from.x,home.x,p);y=mix(from.y,home.y,p);paint();connection();},()=>{x=home.x;y=home.y;paint();connection();announce('跟随菜单栏');});
}
function detachClick(){
  stop();if(mode!=='docked')return;const from={x,y};
  if(reduced){x=home.x;y=home.y+100;updateMode('floating');flat();paint();return;}
  announce('轻轻拉开');
  animate(460,t=>{x=from.x;y=from.y+98*ease(t);paint();connection();},snap);
}
// 每一行沿同一个形变场收向图标，展开时反向采样，避免两段动画的形状跳变。
function genieRow(v,p,origin){
  const t=clamp((p-.26*v)/.74,0,1), pull=t*t*t*(t*(t*6-15)+10);
  const width=mix(440*scale,18,pull), center=mix(origin.x+220*scale,anchor.x,pull);
  return {left:center-width/2,width,y:mix(origin.y+422*scale*v,18,pull)};
}
function clearFlight(){
  if(!flight)return;
  flight.layer.remove();flight=null;note.style.visibility='';note.inert=false;
  desk.removeAttribute('data-flight');
}
function makeFlight(){
  const layer=document.createElement('div');layer.className='genie';layer.inert=true;layer.setAttribute('aria-hidden','true');
  const template=note.cloneNode(true);
  template.querySelector('#pin').classList.add('genie-pin');
  template.removeAttribute('id');template.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
  template.querySelectorAll('[contenteditable]').forEach(el=>el.removeAttribute('contenteditable'));
  template.style.transform='none';template.style.opacity='1';template.style.visibility='visible';
  const strips=[], count=96, height=422/count, scroll=note.querySelector('.writing').scrollTop;
  for(let i=0;i<count;i++){
    const strip=document.createElement('div'), copy=template.cloneNode(true);
    strip.className='genie-strip';strip.style.height=`${height+.7}px`;
    copy.style.top=`${-i*height}px`;strip.append(copy);layer.append(strip);strips.push(strip);
  }
  desk.append(layer);
  layer.querySelectorAll('.writing').forEach(el=>{el.scrollTop=scroll;});
  flight={layer,strips,height};note.style.visibility='hidden';note.inert=true;
}
function paintGenie(progress,origin){
  const {strips,height}=flight;
  for(let i=0;i<strips.length;i++){
    const upper=genieRow(i/strips.length,progress,origin);
    const lower=genieRow((i+1)/strips.length,progress,origin);
    // 将窄条投影到梯形，邻接边共享坐标；轻微重叠消除亚像素接缝。
    const ratio=upper.width/lower.width, a=upper.width/440;
    const c=(lower.left*ratio-upper.left)/height, d=(lower.y*ratio-upper.y)/height;
    const g=(ratio-1)/height;
    strips[i].style.transform=`matrix3d(${a},0,0,0,${c},${d},0,${g},0,0,1,0,${upper.left},${upper.y},0,1)`;
  }
}
function recall(){
  if(flight)return;
  stop();drag=null;flat();note.hidden=false;
  if(mode==='docked'){connection();return;}
  const from={x,y};announce('收回菜单栏');
  if(reduced){updateMode('docked');x=home.x;y=home.y;paint();connection();return;}
  makeFlight();paintGenie(0,from);desk.dataset.flight='in';
  // 不插入隐藏停顿；两段都在图标处收敛为同一条线，接着反向舒展。
  animate(620,t=>{
    paintGenie(Math.sin(t*Math.PI/2),from);
    $('status-icon').style.transform=`scale(${1+.055*Math.sin(Math.PI*t)**2})`;
  },()=>{
    updateMode('docked');x=home.x;y=home.y;paint();announce('从菜单栏舒展');desk.dataset.flight='out';
    flight.layer.querySelectorAll('.mode use').forEach(el=>el.setAttribute('href','#docked'));
    flight.layer.querySelectorAll('.mode').forEach(el=>el.classList.remove('free'));
    flight.layer.querySelectorAll('.genie-pin').forEach(el=>el.setAttribute('aria-pressed',String(pinned)));
    animate(700,t=>{
      paintGenie(1-Math.sin(t*Math.PI/2),home);
      $('status-icon').style.transform=`scale(${1+.035*Math.sin(Math.PI*t)**2})`;
      if(t>.7)connection((t-.7)/.3);
    },()=>{clearFlight();$('status-icon').style.transform='';paint();connection();announce('跟随菜单栏');});
  });
}
function closeNote(){stop();note.hidden=true;flat();announce('已收起 · 点击菜单栏 Jot 图标打开');}
function toggle(){if(mode==='docked')detachClick();else recall();}
$('mode').addEventListener('click',toggle);
$('status-icon').addEventListener('click',()=>{if(note.hidden){note.hidden=false;reset();}else recall();});
$('reset').addEventListener('click',reset);
$('dark').addEventListener('change',e=>document.body.classList.toggle('dark',e.target.checked));
$('reduced').addEventListener('change',e=>{reduced=e.target.checked;reset();});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{reduced=e.matches;$('reduced').checked=reduced;reset();});
top.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('button'))return;
  stop();if(mode==='docked'){x=home.x;y=home.y;paint();connection();}
  drag={id:e.pointerId,startX:e.clientX,startY:e.clientY,x,y,started:mode,broken:false};top.setPointerCapture(e.pointerId);top.style.cursor='grabbing';
});
top.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;
  if(Math.hypot(dx,dy)<4)return;
  if(mode==='docked'){
    x=drag.x+dx*.42;y=drag.y+Math.max(-5,dy*.8);paint();connection();
    if(dy>112||Math.abs(dx)>150){snap();drag.broken=true;drag.startX=e.clientX;drag.startY=e.clientY;drag.x=x;drag.y=y;}
  }else{
    x=clamp(drag.x+dx,8,desk.clientWidth-440*scale-8);y=clamp(drag.y+dy,43,desk.clientHeight-422*scale-8);paint();
  }
});
function endDrag(e){if(!drag||e.pointerId!==drag.id)return;drag=null;top.style.cursor='';if(mode==='docked')rebound();else announce('自由拖拽');}
top.addEventListener('pointerup',endDrag);top.addEventListener('pointercancel',endDrag);
top.addEventListener('keydown',e=>{
  if(e.target!==top||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  e.preventDefault();stop();if(mode==='docked'){updateMode('floating');flat();}
  const step=e.shiftKey?40:10;x=clamp(x+({ArrowLeft:-step,ArrowRight:step}[e.key]||0),8,desk.clientWidth-440*scale-8);y=clamp(y+({ArrowUp:-step,ArrowDown:step}[e.key]||0),43,desk.clientHeight-422*scale-8);paint();
});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(drag){drag=null;reset();}else closeNote();});
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>{
  reset();document.querySelectorAll('[data-scene]').forEach(b=>b.classList.toggle('active',b===button));
  if(button.dataset.scene==='detach'){detachClick();}
  else if(button.dataset.scene==='rebound'){
    announce('轻拉，尚未脱离');const from=y;
    animate(420,t=>{y=from+48*ease(t);paint();connection();},rebound);
  }else{updateMode('floating');x=26;y=desk.clientHeight-422*scale-40;flat();paint();recall();}
}));
new ResizeObserver(()=>{stop();drag=null;top.style.cursor='';geometry();announce(note.hidden?'已收起 · 点击菜单栏 Jot 图标打开':mode==='docked'?'跟随菜单栏':'自由拖拽');}).observe(desk);
geometry();updateMode('docked');

// 同源官网的暂停按钮控制内嵌演示；不接收其他窗口发来的消息。
window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='jot-motion')return;
  reduced=event.data.enabled!==true||matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('reduced').checked=reduced;reset();
});
