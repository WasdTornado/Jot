// 浮游的页面动效和导航；只操作网页演示，不访问正式便签。
(() => {
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const toggle = document.querySelector('#motion-toggle');
  const garden = document.querySelector('.thought-garden');
  const gather = document.querySelector('.gather');
  const status = document.querySelector('#garden-status');
  const cards = [...garden.querySelectorAll('.thought')];
  const activeAnimations = new Map();
  let enabled = !reduce.matches;
  const canMove = () => enabled && !reduce.matches;
  function play(element, frames, delay = 0, duration = 650) {
    activeAnimations.get(element)?.cancel();
    if (!canMove()) return;
    const animation = element.animate(frames, { duration, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    activeAnimations.set(element, animation);
    const clean = () => { if (activeAnimations.get(element) === animation) activeAnimations.delete(element); };
    animation.onfinish = clean;
    animation.oncancel = clean;
  }
  function updateMotion() {
    root.dataset.motion = canMove() ? 'on' : 'off';
    toggle.disabled = reduce.matches;
    toggle.textContent = reduce.matches ? '已减少动态' : enabled ? '暂停动效' : '启用动效';
    toggle.setAttribute('aria-pressed', String(canMove()));
    if (!canMove()) document.getAnimations().forEach(animation => {
      if (animation.effect?.getTiming().iterations === Infinity) animation.cancel();
      else animation.finish();
    });
  }
  toggle.addEventListener('click', () => { enabled = !enabled; updateMotion(); });
  reduce.addEventListener('change', () => { enabled = !reduce.matches; updateMotion(); });
  updateMotion();
  // 入场不绑定滚动，不阻止书写；系统减少动态时直接显示最终状态。
  play(document.querySelector('.intro-title'), [{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'none'}], 0, 720);
  cards.forEach((card, index) => {
    const final = getComputedStyle(card).transform;
    play(card, [{opacity:0,transform:'translate(-50%,220px) scale(.92)'},{opacity:1,transform:final}], 90 + index * 45, 850);
  });
  function setGathered(value) {
    cards.forEach(card => activeAnimations.get(card)?.cancel());
    garden.classList.toggle('gathered', value);
    gather.setAttribute('aria-pressed', String(value));
    gather.textContent = value ? '让念头散开 ↗' : '把念头收好 ↓';
    status.textContent = value ? '收好了。需要的时候，随手打开一页。' : '每种念头，都有自己的颜色。';
  }
  gather.addEventListener('click', () => setGathered(!garden.classList.contains('gathered')));
  function openPage(index) {
    document.querySelectorAll('.page-dots button')[index].click();
    document.querySelector('#demo').scrollIntoView({ behavior: canMove() ? 'smooth' : 'instant', block: 'start' });
    document.querySelector('#demo-input').focus({ preventScroll: true });
  }
  cards.forEach(card => {
    card.addEventListener('click', () => openPage(Number(card.dataset.thought)));
    // 键盘访问时先展开，避免焦点落到被堆叠遮挡的卡片上。
    card.addEventListener('focus', () => { if (garden.classList.contains('gathered')) setGathered(false); });
  });
  document.querySelectorAll('[data-open-page]').forEach(button => button.addEventListener('click', () => openPage(Number(button.dataset.openPage))));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      play(entry.target, [{opacity:0,transform:'translateY(24px)'},{opacity:1,transform:'none'}], 0, 650);
    }), {threshold:.12});
    document.querySelectorAll('.reveal,.orbit-stage').forEach(element => observer.observe(element));
  }
  // 调整窗口时结束捕获旧尺寸的入场动画，马上交还响应式布局。
  window.addEventListener('resize', () => activeAnimations.forEach(animation => animation.cancel()));
})();
