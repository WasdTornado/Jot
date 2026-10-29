import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from '../../../Web/node_modules/jsdom/lib/api.js';

const site=process.argv.includes('--site');
const dom=new JSDOM(readFileSync(new URL(site?'../../../Website/window-motion.html':'index.html',import.meta.url),'utf8'),{runScripts:'outside-only'});
const w=dom.window,d=w.document;
let now=0,id=0;const frames=new Map();
w.requestAnimationFrame=fn=>{frames.set(++id,fn);return id;};w.cancelAnimationFrame=id=>frames.delete(id);
Object.defineProperty(w.performance,'now',{value:()=>now});
w.matchMedia=()=>({matches:false,addEventListener(){}});w.ResizeObserver=class{constructor(callback){this.callback=callback;w.resizeDemo=callback;}observe(){}};
w.HTMLElement.prototype.setPointerCapture=()=>{};
w.HTMLElement.prototype.getBoundingClientRect=function(){return new w.DOMRect(this.id==='status-icon'?740:0,0,this.id==='status-icon'?34:960,650);};
Object.defineProperty(d.querySelector('#desktop'),'clientWidth',{value:960});
Object.defineProperty(d.querySelector('#desktop'),'clientHeight',{value:650});
w.eval(readFileSync(new URL(site?'../../../Website/window-motion.js':'motion.js',import.meta.url),'utf8'));
const $=id=>d.getElementById(id),click=id=>$(id).click();
function step(ms=16){now+=ms;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));}
function finish(){let steps=0;while(frames.size){assert.ok(++steps<500,'动画必须结束');step();}}
function pointer(type,x,y){const e=new w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:1});$('drag-top').dispatchEvent(e);}
const original=$('note').style.transform,content=d.querySelector('.writing').textContent;
assert.ok(!/[CQ]/.test($('neck').getAttribute('d')),'连接应为直边三角形');
pointer('pointerdown',100,100);pointer('pointermove',110,150);pointer('pointerup',110,150);finish();
assert.equal($('desktop').dataset.mode,'docked');assert.equal($('note').style.transform,original);
pointer('pointerdown',100,100);pointer('pointermove',120,240);pointer('pointerup',120,240);finish();
assert.equal($('desktop').dataset.mode,'floating');assert.equal($('neck').getAttribute('d'),'');assert.equal($('pin').getAttribute('aria-pressed'),'true');
click('mode');finish();assert.equal($('desktop').dataset.mode,'docked');assert.equal($('note').style.transform,original);
assert.equal(d.querySelector('.writing').textContent,content);assert.equal($('pin').getAttribute('aria-pressed'),'false');
click('mode');now+=100;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));click('reset');finish();
assert.equal($('desktop').dataset.mode,'docked');assert.equal($('note').style.transform,original);
// 拉断后继续拖动时，残留尖角的底边仍必须落在便签顶边内。
function assertAttached(){
  const transform=$('note').style.transform;
  const paperY=Number(transform.match(/translate\([^,]+,([^p]+)px/)[1]);
  const bottom=$('tear')||$('remnant'), values=bottom.getAttribute('d').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi).map(Number);
  const local=bottom.closest('#note'), scaleY=Number(transform.match(/scale\([^,]+,([^)]+)\)/)[1]);
  const baseY=local?paperY+values[1]*scaleY:values[7];
  assert.ok(baseY>=paperY && baseY<=paperY+2,`尖角离开纸张：底边 ${baseY}，纸张 ${paperY}`);
}
pointer('pointerdown',100,100);pointer('pointermove',120,240);step(32);
pointer('pointermove',190,330);assertAttached();step(32);assertAttached();
pointer('pointermove',40,160);assertAttached();step(32);assertAttached();
pointer('pointerup',40,160);finish();
assert.equal($('tear').getAttribute('d'),'');assert.equal($('remnant').getAttribute('d'),'');click('reset');
// 不同起点到图标的形变必须始终有序，首尾准确，无翻转或非有限坐标。
for(const origin of [{x:20,y:180},{x:480,y:50}]){
  for(let p=0;p<=1.001;p+=.025){
    let previous=-Infinity;
    for(let i=0;i<=96;i++){
      const row=w.eval(`genieRow(${i/96},${Math.min(p,1)},${JSON.stringify(origin)})`);
      assert.ok(Object.values(row).every(Number.isFinite));assert.ok(row.width>0);
      assert.ok(row.y>=previous-1e-8,'纸张纵向不能折返');previous=row.y;
      if(p===0){assert.equal(row.left,origin.x);assert.equal(row.width,440);}
      if(p>=1){assert.ok(Math.abs(row.width-18)<1e-8);assert.ok(Math.abs(row.y-18)<1e-8);}
    }
  }
}
click('mode');finish();click('mode');step(180);
assert.equal($('desktop').dataset.flight,'in');assert.equal($('note').inert,true);
assert.equal(d.querySelector('.genie').getAttribute('aria-hidden'),'true');
assert.equal(d.querySelectorAll('.genie [id]').length,0,'视觉副本不能污染真实控件 ID');
const flightLayer=d.querySelector('.genie');click('status-icon');assert.equal(d.querySelector('.genie'),flightLayer);
step(450);assert.equal($('desktop').dataset.flight,'out','吸入后直接开始舒展');
assert.equal($('note').style.visibility,'hidden');step(180);click('reset');finish();
assert.equal(d.querySelector('.genie'),null);assert.equal($('note').inert,false);assert.equal($('note').style.visibility,'');
assert.equal($('note').style.transform,original);assert.equal(d.querySelector('.writing').textContent,content);
click('mode');finish();click('mode');step(100);
d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));finish();
assert.equal(d.querySelector('.genie'),null);assert.equal($('note').hidden,true);click('status-icon');
$('reduced').checked=true;$('reduced').dispatchEvent(new w.Event('change'));click('mode');
assert.equal($('desktop').dataset.mode,'floating');click('mode');assert.equal($('desktop').dataset.mode,'docked');assert.equal(frames.size,0);
click('more');assert.equal($('note').hidden,true);click('status-icon');assert.equal($('note').hidden,false);
if(site){
  $('reduced').checked=false;$('reduced').dispatchEvent(new w.Event('change'));
  click('mode');finish();click('mode');step(100);w.resizeDemo();
  assert.equal(frames.size,0);assert.equal(d.querySelector('.genie'),null);
  assert.equal($('state').textContent,'自由拖拽');
  $('reduced').checked=true;$('reduced').dispatchEvent(new w.Event('change'));
  w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,origin:'https://untrusted.example',data:{type:'jot-motion',enabled:true}}));
  assert.equal($('reduced').checked,true,'不接受其他来源的动效控制');
  w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,origin:w.location.origin,data:{type:'jot-motion',enabled:true}}));
  assert.equal($('reduced').checked,false);
  click('mode');step(100);
  w.dispatchEvent(new w.MessageEvent('message',{source:w.parent,origin:w.location.origin,data:{type:'jot-motion',enabled:false}}));
  assert.equal(frames.size,0);assert.equal($('desktop').dataset.mode,'docked');
}
console.log('PASS：拉断后连续拖动贴边、直边三角形、神奇效果形变与取消、无缝衔接、轻拉回弹、拉断切换、吸回展开、内容保留、取消重置、减少动态、收起恢复');
w.close();
