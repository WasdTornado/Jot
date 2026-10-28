import type { Editor } from '@tiptap/core';
import { createNoteEditor } from './editor';
import { SaveCoordinator, type SaveStatus } from './saveCoordinator';
import type { NoteSnapshot, SaveReceipt } from './types';

export interface LoadedPage { snapshot: NoteSnapshot | null; recovered: boolean }
export interface NoteSession {
  pageID: string; editor: Editor; coordinator: SaveCoordinator; host: HTMLDivElement;
  revision: number; recovered: boolean; scrollTop: number;
}
export class NoteWorkspace {
  active?: NoteSession;
  onChange: () => void = () => {};
  onStatus: (status: SaveStatus, error?: string) => void = () => {};
  private sessions = new Map<string, NoteSession>();
  private switching?: Promise<void>;
  private restoration?: Promise<void>;
  private requestedPage?: { pageID: string; initial?: LoadedPage };
  private readonly onScroll = (): void => {
    const session = this.active;
    if (!session || session.scrollTop === this.container.scrollTop) return;
    session.scrollTop = this.container.scrollTop; session.revision++; session.coordinator.changed();
  };
  constructor(private container: HTMLElement, private load: (id: string) => Promise<LoadedPage>,
    private persist: (snapshot: NoteSnapshot) => Promise<SaveReceipt>) { this.container.addEventListener('scroll', this.onScroll); }

  activate(pageID: string, initial?: LoadedPage): Promise<void> {
    if (this.restoration) return Promise.reject(Error('正在恢复历史版本，请稍候'));
    if (!/^page-[1-7]$/.test(pageID)) return Promise.reject(Error('无效便签页'));
    if (!this.switching && this.active?.pageID === pageID) return Promise.resolve();
    this.requestedPage = { pageID, initial };
    if (this.switching) return this.switching;
    // 保存和加载仍串行处理；期间的新点击更新目标，避免静默丢弃用户最后的选择。
    this.switching = Promise.resolve().then(async () => {
      while (this.requestedPage) {
        const next = this.requestedPage; this.requestedPage = undefined;
        if (this.active?.pageID !== next.pageID) await this.changePage(next.pageID, next.initial);
      }
    }).finally(() => { this.switching = undefined; this.requestedPage = undefined; });
    return this.switching;
  }
  private async changePage(pageID: string, initial?: LoadedPage): Promise<void> {
    if (!/^page-[1-7]$/.test(pageID)) throw Error('无效便签页');
    const previous = this.active;
    try {
      if (previous) {
        await this.flushSession(previous);
        previous.editor.setEditable(false);
        previous.scrollTop = this.container.scrollTop;
      }
      let session = this.sessions.get(pageID);
      if (!session) {
        session = this.createSession(pageID, initial ?? await this.load(pageID));
        this.sessions.set(pageID, session);
      }
      if (previous) previous.host.hidden = true;
      this.active = session; session.host.hidden = false; session.editor.setEditable(true);
      this.container.scrollTop = session.scrollTop;
      this.onChange(); this.onStatus(session.coordinator.status, session.coordinator.error);
      session.editor.commands.focus(undefined, { scrollIntoView: false });
    } catch (error) {
      previous?.editor.setEditable(true);
      previous?.editor.commands.focus(undefined, { scrollIntoView: false });
      throw error;
    }
  }
  private createSession(pageID: string, loaded: LoadedPage): NoteSession {
    const host = document.createElement('div'); host.hidden = true; this.container.append(host);
    let session: NoteSession | undefined;
    const changed = (): void => {
      if (!session) return;
      session.revision++; session.coordinator.changed();
      if (this.active === session) this.onChange();
    };
    const editor = createNoteEditor(host, changed);
    editor.setEditable(false);
    try {
      if (loaded.snapshot) {
        if (loaded.snapshot.pageID !== pageID) throw Error('载入内容与便签页不一致');
        editor.commands.setContent(loaded.snapshot.document, { emitUpdate: false, errorOnInvalidContent: true });
        const { anchor, head } = loaded.snapshot.selection;
        const max = editor.state.doc.content.size;
        editor.commands.setTextSelection({ from: Math.max(1, Math.min(anchor, max)), to: Math.max(1, Math.min(head, max)) });
      }
      const snapshot = (): NoteSnapshot => ({ schemaVersion: 1, pageID, revision: session!.revision,
        updatedAt: new Date().toISOString(), document: editor.getJSON(), selection: {
          anchor: editor.state.selection.anchor, head: editor.state.selection.head, scrollTop: this.active === session ? this.container.scrollTop : session!.scrollTop } });
      session = { pageID, host, editor, revision: loaded.snapshot?.revision ?? 0, recovered: loaded.recovered, scrollTop: loaded.snapshot?.selection.scrollTop ?? 0,
        coordinator: undefined as unknown as SaveCoordinator };
      const current = session;
      current.coordinator = new SaveCoordinator(snapshot, this.persist, (state, error) => {
        if (this.active === current) this.onStatus(state, error);
      });
      editor.on('selectionUpdate', () => { if (this.active === current && !editor.view.composing) changed(); });
      editor.view.dom.addEventListener('compositionstart', () => current.coordinator.compositionStarted());
      editor.view.dom.addEventListener('compositionend', () => current.coordinator.compositionEnded());
      return current;
    } catch (error) { editor.destroy(); host.remove(); throw error; }
  }
  private async flushSession(session: NoteSession): Promise<void> {
    session.editor.view.dom.blur();
    // 给系统输入法提交候选词的机会，再等待最终版本的原生写盘确认。
    await new Promise(resolve => setTimeout(resolve, 0));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([session.coordinator.flush(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Error('保存尚未完成，已保留当前页')), 3000);
      })]);
    } finally { clearTimeout(timer); }
  }
  async flush(): Promise<void> {
    if (this.restoration) await this.restoration;
    if (this.switching) await this.switching;
    if (this.active) await this.flushSession(this.active);
  }
  restoreActive(restore: (pageID: string, revision: number) => Promise<NoteSnapshot>): Promise<void> {
    if (this.restoration || this.switching || !this.active) return Promise.reject(Error('便签正在处理其他操作'));
    const previous = this.active;
    this.restoration = (async () => {
      try {
        await this.flushSession(previous); previous.editor.setEditable(false, false);
        const snapshot = await restore(previous.pageID, previous.revision);
        if (snapshot.revision <= previous.revision) throw Error('恢复版本无效');
        const next = this.createSession(previous.pageID, { snapshot, recovered: false });
        previous.coordinator.dispose(); previous.editor.destroy(); previous.host.remove();
        this.sessions.set(next.pageID, next); this.active = next;
        next.host.hidden = false; next.editor.setEditable(true, false); this.container.scrollTop = next.scrollTop;
        this.onChange(); this.onStatus(next.coordinator.status);
        next.editor.commands.focus(undefined, { scrollIntoView: false });
      } catch (error) {
        if (!previous.editor.isDestroyed) { previous.editor.setEditable(true, false); previous.editor.commands.focus(undefined, { scrollIntoView: false }); }
        throw error;
      }
    })().finally(() => { this.restoration = undefined; });
    return this.restoration;
  }
  replaceAll(restore: () => Promise<NoteSnapshot[]>): Promise<void> {
    if (this.restoration || this.switching || !this.active) return Promise.reject(Error('便签正在处理其他操作'));
    const activeID = this.active.pageID;
    this.restoration = (async () => {
      const prepared: NoteSession[] = [];
      try {
        for (const session of this.sessions.values()) { await this.flushSession(session); session.editor.setEditable(false, false); }
        const notes = await restore();
        if (notes.length !== 7 || new Set(notes.map(note => note.pageID)).size !== 7 || notes.some(note => !/^page-[1-7]$/.test(note.pageID))) throw Error('备份必须包含完整七页');
        for (const snapshot of notes) prepared.push(this.createSession(snapshot.pageID, { snapshot, recovered: false }));
        this.sessions.forEach(session => { session.coordinator.dispose(); session.editor.destroy(); session.host.remove(); });
        this.sessions = new Map(prepared.map(session => [session.pageID, session]));
        this.active = this.sessions.get(activeID)!;
        this.active.host.hidden = false; this.active.editor.setEditable(true, false);
        this.container.scrollTop = this.active.scrollTop; this.onChange(); this.onStatus('saved');
      } catch (error) {
        prepared.forEach(session => { session.coordinator.dispose(); session.editor.destroy(); session.host.remove(); });
        this.active?.editor.setEditable(true, false); throw error;
      }
    })().finally(() => { this.restoration = undefined; });
    return this.restoration;
  }
  dispose(): void {
    this.container.removeEventListener('scroll', this.onScroll);
    this.sessions.forEach(session => { session.coordinator.dispose(); session.editor.destroy(); session.host.remove(); });
  }
}
