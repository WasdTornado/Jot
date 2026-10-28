/** 小调整使用轻面板，长流程使用内容页；只隐藏视图，不重建正文。 */
export class NoteSurfaces {
  current?: string;
  private parent?: string;
  private origin?: HTMLElement;
  onBack?: () => void;
  onClose?: (id: string) => void;
  constructor(private restoreEditor: () => void) {}
  show(id: string, parent?: string): void {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.close(false); this.current = id; this.parent = parent; this.origin = origin;
    const element = document.getElementById(id)!; element.hidden = false;
    const pane = element.classList.contains('content-pane');
    document.querySelector('.note-window')!.classList.toggle('has-pane', pane);
    document.querySelector<HTMLElement>('#editor')!.inert = pane;
    document.querySelector<HTMLElement>('.page-context')!.inert = pane;
    document.querySelectorAll(`[aria-controls="${id}"]`).forEach(button => button.setAttribute('aria-expanded', 'true'));
    if (pane) element.querySelector<HTMLElement>('input:not([type=checkbox]),button')?.focus({ preventScroll:true });
  }
  close(restore = true): void {
    const origin = this.origin;
    const closing = this.current;
    document.querySelectorAll<HTMLElement>('.popover,.content-pane').forEach(panel => { panel.hidden = true; });
    document.querySelectorAll('[aria-expanded=true]').forEach(button => button.setAttribute('aria-expanded','false'));
    document.querySelector('.note-window')!.classList.remove('has-pane');
    document.querySelector<HTMLElement>('#editor')!.inert = false;
    document.querySelector<HTMLElement>('.page-context')!.inert = false;
    this.current = undefined; this.parent = undefined; this.origin = undefined; this.onBack = undefined;
    if (closing) this.onClose?.(closing);
    if (restore) {
      if (origin?.isConnected && !origin.closest('[hidden]') && !origin.closest('#editor')) origin.focus({preventScroll:true});
      else this.restoreEditor();
    }
  }
  back(): void {
    if (this.onBack) { this.onBack(); return; }
    if (this.parent) { const parent = this.parent; this.show(parent); document.getElementById(parent)?.querySelector<HTMLElement>('button')?.focus({ preventScroll:true }); return; }
    this.close();
  }
}

export function confirmRestore(title: string, description: string, label: string, action: () => Promise<void>): Promise<boolean> {
  const dialog = document.querySelector<HTMLDialogElement>('#confirm-dialog')!;
  const cancel = document.querySelector<HTMLButtonElement>('#confirm-cancel')!;
  const accept = document.querySelector<HTMLButtonElement>('#confirm-accept')!;
  const error = document.querySelector('#confirm-error')!;
  document.querySelector('#confirm-title')!.textContent = title;
  document.querySelector('#confirm-description')!.textContent = description;
  error.textContent = ''; accept.textContent = label; cancel.disabled = false; accept.disabled = false;
  const origin = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : document.querySelector<HTMLElement>('.content-pane:not([hidden]) .primary');
  let busy = false, restored = false;
  return new Promise(resolve => {
    dialog.onclose = () => { origin?.focus({preventScroll:true}); resolve(restored); };
    // WebKit 的 Tab 导航受系统设置影响，确认框明确维持内部焦点循环。
    dialog.onkeydown = event => {
      if (event.key !== 'Tab') return; event.preventDefault();
      const buttons = [cancel,accept].filter(button => !button.disabled);
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    };
    dialog.oncancel = event => { if (busy) event.preventDefault(); };
    cancel.onclick = () => { if (!busy) dialog.close(); };
    accept.onclick = () => {
      if (busy) return; busy = true; accept.disabled = true; cancel.disabled = true; accept.textContent = '正在恢复…';
      void action().then(() => { restored = true; dialog.close(); }).catch(value => {
        error.textContent = value instanceof Error ? value.message : '恢复失败，当前内容保持不变';
      }).finally(() => { busy = false; accept.disabled = false; cancel.disabled = false; accept.textContent = label; });
    };
    dialog.showModal(); cancel.focus();
  });
}
