import type { NoteSnapshot, SaveReceipt } from './types';

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';
export class SaveCoordinator {
  status: SaveStatus = 'saved';
  error: string | undefined;
  private savedRevision: number;
  private contentRevision: number;
  private composing = false;
  private disposed = false;
  private idle?: ReturnType<typeof setTimeout>;
  private maximum?: ReturnType<typeof setTimeout>;
  private pending = new Map<number, Promise<void>>();
  private compositionWaiters: Array<() => void> = [];

  constructor(private snapshot: () => NoteSnapshot,
    private persist: (snapshot: NoteSnapshot) => Promise<SaveReceipt>,
    private onStatus: (status: SaveStatus, error?: string) => void = () => {}) {
    this.contentRevision = this.savedRevision = snapshot().revision;
  }
  private state(status: SaveStatus, error?: string): void {
    this.status = status; this.error = error; this.onStatus(status, error);
  }
  private clearTimers(): void {
    clearTimeout(this.idle); clearTimeout(this.maximum); this.idle = this.maximum = undefined;
  }
  changed(silent = false): void {
    if (this.disposed) return;
    // 滚动和光标仍持久化，但只有正文修改才进入可见的保存进度。
    if (!silent) { this.contentRevision = this.snapshot().revision; this.state('dirty'); }
    if (this.composing) return;
    clearTimeout(this.idle);
    const save = (): void => { this.clearTimers(); void this.saveLatest().catch(() => {}); };
    this.idle = setTimeout(save, 300);
    this.maximum ??= setTimeout(save, 1000);
  }
  compositionStarted(): void { this.composing = true; this.clearTimers(); }
  compositionEnded(): void {
    this.composing = false;
    // 等待编辑器处理组合输入的最终事务，再读取已提交的正文。
    queueMicrotask(() => {
      if (this.disposed) return;
      this.changed();
      this.compositionWaiters.splice(0).forEach(resolve => resolve());
    });
  }
  private saveLatest(): Promise<void> {
    if (this.disposed) return Promise.reject(Error('编辑器已关闭'));
    if (this.composing) return Promise.resolve();
    const next = this.snapshot();
    if (next.revision <= this.savedRevision) { this.state('saved'); return Promise.resolve(); }
    const existing = this.pending.get(next.revision);
    if (existing) return existing;
    if (this.contentRevision > this.savedRevision) this.state('saving');
    const promise = this.persist(next).then(receipt => {
      if (receipt.pageID !== next.pageID || receipt.revision < next.revision) throw Error('保存确认与便签不一致');
      this.savedRevision = Math.max(this.savedRevision, receipt.revision);
      if (!this.disposed && (this.snapshot().revision <= this.savedRevision || this.status !== 'error')) {
        this.state(this.contentRevision <= this.savedRevision ? 'saved' : 'dirty');
      }
    }).catch((error: unknown) => {
      if (!this.disposed && next.revision > this.savedRevision && next.revision >= this.snapshot().revision) {
        this.state('error', error instanceof Error ? error.message : '保存失败');
      }
      throw error;
    }).finally(() => this.pending.delete(next.revision));
    this.pending.set(next.revision, promise);
    return promise;
  }
  async flush(): Promise<void> {
    if (this.disposed) throw Error('编辑器已关闭');
    this.clearTimers();
    if (this.composing) await new Promise<void>(resolve => this.compositionWaiters.push(resolve));
    await Promise.resolve();
    while (!this.disposed && this.snapshot().revision > this.savedRevision) {
      await this.saveLatest();
      if (this.composing) await new Promise<void>(resolve => this.compositionWaiters.push(resolve));
    }
    this.clearTimers();
  }
  dispose(): void {
    this.disposed = true; this.clearTimers();
    this.compositionWaiters.splice(0).forEach(resolve => resolve());
  }
}
