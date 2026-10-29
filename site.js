// 两处试写均使用应用编辑器；父页面只负责打开与重置，不接触正文。
const demoFrames = [...document.querySelectorAll('.live-demo-frame')];
function sendDemo(id,type,extra={}) {
 if(type==='jot-demo-open') document.querySelector(`[data-reopen="${id}"]`).hidden=true;
 document.getElementById(id)?.contentWindow?.postMessage({type,...extra},location.origin);
}
window.openJotDemo = (index,panel) => sendDemo('live-demo','jot-demo-open',{index,panel});
document.querySelector('#try-demo').addEventListener('click',()=>window.openJotDemo());
document.querySelector('#reset-demo').addEventListener('click',()=>sendDemo('live-demo','jot-demo-reset'));
document.querySelector('#try-skins').addEventListener('click',()=>{
 sendDemo('theme-demo','jot-demo-open');sendDemo('theme-demo','jot-demo-skins');
});
document.querySelectorAll('[data-reopen]').forEach(button=>button.addEventListener('click',()=>{
 sendDemo(button.dataset.reopen,'jot-demo-open');button.hidden=true;
}));
window.addEventListener('message',event=>{
 if(event.origin!==location.origin)return;
 if(event.source===document.querySelector('#window-motion-demo')?.contentWindow && event.data?.type==='jot-motion-height') {
  const height=event.data.height;
  if(Number.isFinite(height)&&height>=400&&height<=1600) document.querySelector('#window-motion-demo').style.height=`${height}px`;
  return;
 }
 const frame=demoFrames.find(frame=>frame.contentWindow===event.source);if(!frame)return;
 const reopen=document.querySelector(`[data-reopen="${frame.id}"]`);
 if(event.data?.type==='jot-demo-hidden')reopen.hidden=false;
 if(event.data?.type==='jot-demo-ready')reopen.hidden=true;
});
