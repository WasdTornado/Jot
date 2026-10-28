/** 仅放大圆点视觉层，固定点击区和正文位置，避免放大后反复触发进出。 */
export function setupPageDock(tabs: HTMLElement): void {
  const buttons = [...tabs.querySelectorAll<HTMLButtonElement>('.page-tab')];
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let pointerX: number | undefined;
  let focused: HTMLButtonElement | undefined;
  const render = (): void => {
    frame = 0;
    const origin = tabs.getBoundingClientRect().left;
    const center = pointerX === undefined && focused ? origin + focused.offsetLeft + focused.offsetWidth / 2 : pointerX;
    for (const button of buttons) {
      const distance = center === undefined ? Infinity : Math.abs(center - origin - button.offsetLeft - button.offsetWidth / 2);
      const influence = reduced?.matches ? 0 : distance < 64 ? (1 + Math.cos(Math.PI * distance / 64)) / 2 : 0;
      button.style.setProperty('--dock-scale', String(1 + .2 * influence));
      button.style.setProperty('--dock-lift', `${-1.5 * influence}px`);
    }
  };
  const schedule = (): void => { if (!frame) frame = requestAnimationFrame(render); };
  tabs.addEventListener('pointermove', event => { if (event.pointerType === 'touch') return; pointerX = event.clientX; schedule(); });
  tabs.addEventListener('pointerleave', () => { pointerX = undefined; schedule(); });
  tabs.addEventListener('pointercancel', () => { pointerX = undefined; schedule(); });
  tabs.addEventListener('focusin', event => { focused = buttons.find(button => button === event.target && button.matches(':focus-visible')); schedule(); });
  tabs.addEventListener('focusout', () => { focused = undefined; schedule(); });
  reduced?.addEventListener?.('change', schedule);
}
