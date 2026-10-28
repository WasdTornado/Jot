(() => {
  const root = document.querySelector('.theme-showcase');
  if (!root) return;
  const preview = root.querySelector('.theme-demo');
  const choices = [...root.querySelectorAll('[data-theme-choice]')];
  const names = { default: '默认留白', grid: '方格手账', cream: '奶油贴纸', marker: '荧光清单', mint: '薄荷花园', sakura: '樱花信笺', manuscript: '复古稿纸', sea: '海盐蓝调' };
  let chosen = 'cream';
  let temporary;
  const render = () => {
    const skin = temporary ?? chosen;
    preview.dataset.skin = skin;
    root.querySelector('#theme-caption').textContent = `${temporary ? '预览' : '已选'} · ${names[skin]}`;
    choices.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === chosen));
      button.classList.toggle('previewing', button.dataset.themeChoice === temporary);
    });
  };
  choices.forEach(button => {
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      temporary = button.dataset.themeChoice; render();
    });
    button.addEventListener('focus', () => { temporary = button.dataset.themeChoice; render(); });
    button.addEventListener('click', () => { chosen = button.dataset.themeChoice; temporary = undefined; render(); });
  });
  const options = root.querySelector('.theme-choices');
  options.addEventListener('pointerleave', () => { temporary = undefined; render(); });
  options.addEventListener('focusout', event => { if (!options.contains(event.relatedTarget)) { temporary = undefined; render(); } });
  options.addEventListener('keydown', event => {
    if (event.key === 'Escape') { temporary = undefined; render(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = choices.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + choices.length) % choices.length;
    choices[next].focus();
  });
  root.querySelector('#theme-night').addEventListener('click', event => {
    const dark = preview.classList.toggle('dark');
    event.currentTarget.setAttribute('aria-pressed', String(dark));
    event.currentTarget.textContent = dark ? '切换浅色' : '试试深色';
  });
  render();
})();
