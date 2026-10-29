import type { AppSettings } from './pages';

export type Skin = AppSettings['skin'];
export const skins: { id: Skin; name: string; font: 'system' | 'hand' | 'serif' }[] = [
  { id: 'default', name: '默认', font: 'system' },
  { id: 'grid', name: '方格手账', font: 'hand' },
  { id: 'cream', name: '奶油贴纸', font: 'hand' },
  { id: 'marker', name: '荧光清单', font: 'system' },
  { id: 'mint', name: '薄荷花园', font: 'hand' },
  { id: 'sakura', name: '樱花信笺', font: 'hand' },
  { id: 'manuscript', name: '复古稿纸', font: 'serif' },
  { id: 'sea', name: '海盐蓝调', font: 'system' },
];

/** 预览和选定分开：鼠标与键盘都能试穿，只有点击/Enter 才保存。 */
export function setupSkinPicker(preview: (skin?: Skin) => void, choose: (skin: Skin) => void): void {
  const picker = document.querySelector<HTMLElement>('#skins')!;
  const list = picker.querySelector<HTMLElement>('.skin-fan')!;
  for (const [index, skin] of skins.entries()) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'skin-card'; card.dataset.previewSkin = skin.id;
    card.setAttribute('aria-pressed', 'false'); card.style.setProperty('--fan-index', String(index));
    card.innerHTML = `<span>${skin.name}</span><span class="skin-check" aria-hidden="true">✓</span><i class="skin-swatch swatch-${skin.id}" aria-hidden="true"></i>`;
    card.addEventListener('pointerenter', () => preview(skin.id));
    card.addEventListener('focus', () => preview(skin.id));
    card.addEventListener('mousedown', event => event.preventDefault());
    card.addEventListener('click', () => choose(skin.id));
    list.append(card);
  }
  picker.addEventListener('pointerleave', () => preview());
  picker.addEventListener('focusout', event => { if (!picker.contains(event.relatedTarget as Node | null)) preview(); });
  picker.addEventListener('keydown', event => {
    const cards = Array.from(list.querySelectorAll<HTMLButtonElement>('button'));
    const index = cards.indexOf(document.activeElement as HTMLButtonElement);
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + cards.length) % cards.length;
    cards[next].focus({ preventScroll: true }); cards[next].scrollIntoView?.({ block: 'nearest' });
  });
}
