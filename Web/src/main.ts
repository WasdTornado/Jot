import { setupSkinPicker, skins, type Skin } from './skinPicker';
import { selectAllNoteText } from './editorInput';
import { setupPageDock } from './pageDock';
import { NoteSurfaces } from './surfaces';
import { serializeMarkdown } from './markdown';
import { insertTask } from './editor';
import { applyFormat, formatActive, formats, type Format } from './formatting';
import { NativeBridge } from './bridge';
import { NoteWorkspace, type LoadedPage } from './workspace';
import { defaultSettings, pages, pageName, type AppSettings, type HotKeySettings } from './pages';
import type { SaveReceipt, NoteSnapshot } from './types';
import { showHistory, type HistoryEntry } from './history';
import { describeNote, exportName } from './notePresentation';
import { insertPlainParagraphAfterBlock, clearCompleted, completedSummary } from './dailyEditing';
import { setCompletedFold } from './completedFold';
import { setupSearch } from './search';
import { previewArchive, validateArchiveDocuments, type ArchivePreview, type WorkspaceArchive } from './archiveUI';

declare global {
  interface Window {
    webkit?: { messageHandlers: { notes: { postMessage: (message: unknown) => void } } };
    totNotes: { receive: (message: unknown) => void; selectAll: () => boolean };
  }
}
const status = document.querySelector<HTMLSpanElement>('#status')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
const exportButton = document.querySelector<HTMLButtonElement>('#export')!;
const hint = document.querySelector<HTMLDivElement>('#hint')!;
const count = document.querySelector<HTMLSpanElement>('#word-count')!;
let dragRegionQueued = false;
const windowMode = document.querySelector<HTMLButtonElement>('#window-mode')!;
const pin = document.querySelector<HTMLButtonElement>('#pin-button')!;
const tabs = document.querySelector<HTMLElement>('.page-tabs')!;
const bridge = new NativeBridge(message => {
  if (!window.webkit) throw Error('请从 macOS 应用中打开便签');
  window.webkit.messageHandlers.notes.postMessage(message);
});
window.totNotes = { receive: value => bridge.receive(value), selectAll: () => selectAllNoteText(workspace.active?.editor) };
let settings = { ...defaultSettings };
let previewSkin: Skin | undefined;
let loadFailed = false;
let initialLoading = true;
let systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
let systemSolid = false;
let preferenceQueue = Promise.resolve();
let preferenceError: Error | undefined;
let preferenceRevision = 0;
let exportInProgress = false;
let historyOpen = false;
let hotKeyRecording = false;
let archiveBusy = false;
let operationError: { message: string; retry?: () => Promise<void> } | undefined;
const busy = (): boolean => initialLoading || historyOpen || hotKeyRecording || archiveBusy || exportInProgress || !!document.querySelector('dialog[open]');
interface PageOverview { pageID: string; snapshot?: NoteSnapshot | null; error?: string }
const pageOverviews = new Map<string, { title: string; hasContent: boolean; error?: string }>();
async function refreshPageOverview(): Promise<void> {
  const overview = await bridge.request<PageOverview[]>('listPages');
  if (!Array.isArray(overview)) return;
  for (const page of overview) if (page.pageID !== workspace.active?.pageID) {
    pageOverviews.set(page.pageID, { ...describeNote(page.snapshot?.document), error: page.error });
  }
  renderContent();
}
const workspace = new NoteWorkspace(document.querySelector('#editor')!, id => bridge.request<LoadedPage>('loadPage', { pageID: id }),
  snapshot => bridge.request<SaveReceipt>('save', snapshot));

const surfaces = new NoteSurfaces(() => workspace.active?.editor.commands.focus(undefined, { scrollIntoView:false }));
let undoCleanup: { pageID:string; document:string } | undefined;
let undoTimer: ReturnType<typeof setTimeout> | undefined;

function setStatus(text: string, error = false): void {
  status.title = text; status.dataset.error = String(error);
  status.textContent = error ? (loadFailed && !workspace.active ? '无法读取' : workspace.active?.coordinator.status === 'error' ? '尚未保存' : preferenceError ? '设置未保存' : '操作未完成') : text;
  document.querySelector<HTMLElement>('#error-banner')!.hidden = !error;
  document.querySelector('#error-heading')!.textContent = workspace.active?.coordinator.status === 'error' ? '这次修改还没有保存' : '这项操作还未完成';
  document.querySelector('#error-summary')!.textContent = workspace.active?.coordinator.status === 'error' ? '内容仍在窗口中，请重试保存或先导出一份副本。' : text;
  document.body.classList.toggle('error', error); retry.hidden = !error;
  document.querySelector<HTMLButtonElement>('#error-details-button')!.hidden = !error;
}
function showError(error: unknown, retryAction?: () => Promise<void>): void {
  const message = error instanceof Error ? error.message : '操作失败，内容仍保留在窗口中';
  if (workspace.active?.coordinator.status !== 'error' && !preferenceError) operationError = { message, retry: retryAction };
  if (operationError) renderSaveStatus(); else setStatus(message, true);
}
function renderAppearance(): void {
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  document.body.classList.toggle('dark', dark); document.body.classList.toggle('solid', settings.reduceTransparency || systemSolid);
  const skin = previewSkin ?? settings.skin;
  document.body.dataset.skin = skin;
  document.body.classList.toggle('without-decorations', !settings.decorations);
  const family = settings.fontFamily === 'auto' ? (skins.find(item => item.id === skin)?.font ?? 'system') : settings.fontFamily;
  document.body.style.setProperty('--note-font-family', family === 'hand' ? '"Jot WenKai", var(--font-ui)' : family === 'serif' ? '"Songti SC", "STSong", serif' : 'var(--font-ui)');
  document.querySelector<HTMLSelectElement>('#font-family')!.value = settings.fontFamily;
  document.querySelector<HTMLInputElement>('#decorations-toggle')!.checked = settings.decorations;
  document.querySelectorAll<HTMLButtonElement>('button[data-skin]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.skin === settings.skin)));
  document.querySelectorAll<HTMLButtonElement>('[data-preview-skin]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.previewSkin === settings.skin));
    button.classList.toggle('is-preview', button.dataset.previewSkin === previewSkin);
  });
  document.querySelector('#skin-preview-status')!.textContent = previewSkin ? `预览 · ${skins.find(item => item.id === previewSkin)?.name}` : '悬停预览 · 点击选定';
  // 保留已保存的字号档位值，渲染为紧凑版的 13 / 14 / 16 pt，避免重置用户的档位选择。
  document.body.style.setProperty('--editor-font', `${settings.fontSize - 2}px`);
  const page = pages.find(page => page.id === workspace.active?.pageID) ?? pages[2];
  document.body.style.setProperty('--page-color', dark ? page.dark : page.color);
  document.body.style.setProperty('--page-rgb', page.rgb);
  const index = pages.indexOf(page);
  document.body.style.setProperty('--accent', dark ? page.dark : ['#8c6a1a','#9a5734','#a34260','#7d5d93','#6b6474','#2d7480','#59703f'][index]);
  tabs.style.setProperty('--active-page', String(index));
  document.querySelector<HTMLElement>('.page-track')!.hidden = !workspace.active;
  document.querySelector('#page-index')!.textContent = String(index + 1).padStart(2,'0');
  document.querySelector('#current-page-name')!.textContent = pageName(settings,page.id);
  document.querySelector('#notes-title')!.textContent = `当前页 · ${pageName(settings,page.id)}`;
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach((button, index) => {
    button.style.setProperty('--dot', dark ? pages[index].dark : pages[index].color);
    if (button.dataset.page === workspace.active?.pageID) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    const summary = pageOverviews.get(pages[index].id);
    button.classList.toggle('has-content', summary?.hasContent === true);
    button.classList.toggle('unavailable', !!summary?.error);
    const title = summary?.error ? '无法读取' : summary ? summary.title || (summary.hasContent ? '未填写文字' : '空白页') : '正在读取';
    button.querySelector('.tip-name')!.textContent = pageName(settings, pages[index].id);
    button.querySelector('.tip-copy')!.textContent = title;
    button.setAttribute('aria-label', `第 ${index + 1} 页 · ${pageName(settings, pages[index].id)} · ${title}`);
  });
  document.querySelector('#hotkey-label')!.textContent = settings.hotKey.label;
  document.body.classList.toggle('pinned', settings.pinned);
  scheduleDragRegion();
  pin.setAttribute('aria-pressed', String(settings.pinned));
  pin.setAttribute('aria-label', settings.pinned ? '取消置顶' : '置顶便签'); pin.title = settings.pinned ? '取消置顶' : '置顶便签';

  document.querySelector<HTMLInputElement>('#solid-toggle')!.checked = settings.reduceTransparency;
  document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(button => {
    button.classList.toggle('selected', button.dataset.theme === settings.theme); button.setAttribute('aria-pressed', String(button.dataset.theme === settings.theme));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-font]').forEach(button => {
    button.classList.toggle('selected', Number(button.dataset.font) === settings.fontSize); button.setAttribute('aria-pressed', String(Number(button.dataset.font) === settings.fontSize));
  });
}
function renderContent(): void {
  const session = workspace.active;
  const doc = session?.editor.state.doc;
  if (session) {
    pageOverviews.set(session.pageID, describeNote(session.editor.getJSON()));
    setCompletedFold(session.editor, settings.hideCompleted);
    const completed = completedSummary(session.editor.getJSON());
    const toggle = document.querySelector<HTMLButtonElement>('#completed-summary')!;
    toggle.hidden = completed.total === 0;
    toggle.textContent = `${settings.hideCompleted ? '已隐藏' : '已完成'} ${completed.total} 项`;
    document.querySelector('#fold-completed')!.textContent = settings.hideCompleted ? '显示已完成' : '隐藏已完成';
    document.querySelector<HTMLButtonElement>('#clear-completed')!.disabled = completed.removable === 0;
    document.querySelector('#clear-completed')!.textContent = `移除 ${completed.removable} 项已完成待办`;
    if (undoCleanup && (undoCleanup.pageID !== session.pageID || undoCleanup.document !== JSON.stringify(session.editor.getJSON()))) { undoCleanup = undefined; document.querySelector<HTMLElement>('#undo-toast')!.hidden = true; }
  }
  // 无文字的待办、标题或列表仍有可见结构，不能覆盖整页空白提示。
  hint.hidden = !(doc?.childCount === 1 && doc.firstChild?.type.name === 'paragraph' && doc.firstChild.content.size === 0);
  count.textContent = `${Array.from((session?.editor.getText() ?? '').replace(/\s/g, '')).length} 字`;
  renderAppearance();
  document.querySelectorAll<HTMLButtonElement>('[data-format]').forEach(button => {
    const active = !!session && formatActive(session.editor, button.dataset.format as Format);
    button.setAttribute('aria-pressed', String(active)); button.classList.toggle('selected', active);
  });
}
workspace.onChange = renderContent;
function renderSaveStatus(): void {
  const session = workspace.active;
  const state = session?.coordinator.status ?? 'saved';
  const error = session?.coordinator.error;
  if (loadFailed && !session) { setStatus(operationError?.message ?? '正文加载失败，请重新加载', true); retry.textContent = '重新加载'; return; }
  retry.textContent = preferenceError && state !== 'error' ? '重试设置' : operationError && state !== 'error' ? (operationError.retry ? '重试操作' : '查看详情') : '重试保存';
  if (preferenceError && state !== 'error') {
    setStatus(`设置未保存：${preferenceError.message}`, true); return;
  }
  if (operationError && state !== 'error') { setStatus(operationError.message, true); return; }
  setStatus(state === 'saved' ? (workspace.active?.recovered ? '已从备份恢复' : '已保存') : state === 'error' ? `保存失败，请重试或导出备份：${error}` : '正在保存…', state === 'error');
}
workspace.onStatus = renderSaveStatus;
function saveSettings(patch: Partial<AppSettings>): void {
  settings = { ...settings, ...patch }; renderAppearance();
  const next = { ...settings };
  const revision = ++preferenceRevision;
  preferenceQueue = preferenceQueue.then(async () => {
    try {
      await bridge.request('setSettings', next);
      if (revision === preferenceRevision) preferenceError = undefined;
    } catch (error) {
      // 旧设置的失败不能覆盖更新的选择；最新失败保持可见，直到真正重试成功。
      if (revision === preferenceRevision) preferenceError = error instanceof Error ? error : Error('设置保存失败');
    }
    document.querySelector('#preference-message')!.textContent = preferenceError ? `设置未保存：${preferenceError.message}` : '';
    renderSaveStatus();
  });
}
function editingAvailable(): void {
  loadFailed = false; exportButton.disabled = exportInProgress; retry.textContent = '重试保存';
  void bridge.request('editorReady').catch(showError);
}
async function selectPage(pageID: string): Promise<void> {
  if (busy()) return;
  closePanels();
  try {
    await workspace.activate(pageID);
    if (workspace.active?.pageID === pageID) { editingAvailable(); saveSettings({ pageID }); }
  } catch (error) { showError(error); }
}
pages.forEach((page, index) => {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'page-tab'; button.dataset.page = page.id;
  button.disabled = true;
  button.setAttribute('aria-label', `第 ${index + 1} 页 · ${page.name}`);
  const tooltip = document.createElement('span'); tooltip.className = 'page-tip'; tooltip.id = `tip-${page.id}`; tooltip.setAttribute('role','tooltip');
  const title = document.createElement('span'); title.className = 'tip-title';
  const name = document.createElement('span'); name.className = 'tip-name'; name.textContent = page.name;
  const key = document.createElement('kbd'); key.textContent = `⌘${index + 1}`; title.append(name,key);
  const copy = document.createElement('span'); copy.className = 'tip-copy'; tooltip.append(title,copy); button.append(tooltip); button.setAttribute('aria-describedby',tooltip.id);
  button.addEventListener('click', () => { void selectPage(page.id); }); tabs.append(button);
});

setupPageDock(tabs);
const track = document.createElement('span'); track.className = 'page-track'; track.setAttribute('aria-hidden','true'); tabs.append(track);
function closePanels(): void { surfaces.close(false); }
function togglePanel(id: string): void {
  if (busy() || workspace.active?.editor.view.composing) return;
  if (surfaces.current === id) { surfaces.close(); return; }
  surfaces.show(id, id === 'settings' || id === 'backup-panel' ? 'notes' : undefined);
  if (id === 'skins') document.querySelector<HTMLElement>('#skins [aria-pressed=true]')?.scrollIntoView?.({ block:'nearest' });
}
for (const id of ['settings','format','notes','skins']) document.querySelector(`#${id}-button`)!.addEventListener('click', () => togglePanel(id));
document.querySelector('#skins-button')!.addEventListener('keydown', event => {
  const key = event as KeyboardEvent;
  if (!['ArrowUp','ArrowDown'].includes(key.key) || busy()) return;
  key.preventDefault(); if (surfaces.current !== 'skins') togglePanel('skins');
  document.querySelector<HTMLButtonElement>('#skins [aria-pressed=true]')?.focus({ preventScroll:true });
});
document.querySelector('#backup-button')!.addEventListener('click', () => togglePanel('backup-panel'));
document.querySelector('#help-button')!.addEventListener('click', () => { if (!busy()) surfaces.show('help-panel','settings'); });
document.querySelectorAll('[data-back]').forEach(button => button.addEventListener('click', () => { if (!busy()) surfaces.back(); }));
for (const format of formats) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'menu-action';
  const mark = ['bold','italic','strike','code'].includes(format.id);
  const markLabels: Partial<Record<Format,string>> = {bold:'B',italic:'I',strike:'S'};
  button.dataset.format = format.id; button.textContent = markLabels[format.id] ?? format.label;
  if (format.id === 'code') button.innerHTML = '<svg aria-hidden="true"><use href="#i-code"/></svg>';
  button.setAttribute('aria-label',format.label); button.title = `${format.label}${format.shortcut ? ' · '+format.shortcut : ''}`;
  // 鼠标操作保留编辑选区；键盘操作同样使用编辑器保存的逻辑选区。
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', () => {
    if (!busy() && workspace.active && applyFormat(workspace.active.editor,format.id)) {
      if (!mark) closePanels(); renderContent();
    }
  });
  document.querySelector(mark ? '#mark-actions' : format.id === 'clear' ? '#extra-formats' : '#format-actions')!.append(button);
}
// 段落类型按设计稿排列，任务仍使用现有的同一行插入动作。
const blockActions = document.querySelector('#format-actions')!;
const blockIcons: Record<string,string> = { task:'task',bulletList:'list',orderedList:'list',blockquote:'quote',codeBlock:'code' };
for (const id of ['paragraph','heading1','task','bulletList','orderedList','blockquote','heading2','codeBlock']) {
  const button = document.querySelector<HTMLButtonElement>(id === 'task' ? '#insert-task' : `[data-format="${id}"]`)!;
  const icon = blockIcons[id];
  if (icon) button.insertAdjacentHTML('afterbegin', `<svg aria-hidden="true"><use href="#i-${icon}"/></svg>`);
  blockActions.append(button);
}
document.addEventListener('pointerdown', event => {
  if (busy()) return;
  if (!(event.target as Element).closest('.popover,.content-pane,#rename-page,#completed-summary,#format-button,#notes-button,#skins-button') && !document.querySelector<HTMLElement>('.content-pane:not([hidden])')) closePanels();
});
document.querySelectorAll<HTMLButtonElement>('[data-theme]').forEach(button => button.addEventListener('click', () => { if (!busy()) saveSettings({ theme: button.dataset.theme as AppSettings['theme'] }); }));
document.querySelectorAll<HTMLButtonElement>('[data-font]').forEach(button => button.addEventListener('click', () => { if (!busy()) saveSettings({ fontSize: Number(button.dataset.font) as AppSettings['fontSize'] }); }));
function previewAppearance(skin?: Skin): void {
  if (skin && (busy() || surfaces.current !== 'skins')) return;
  if (previewSkin === skin) return;
  previewSkin = skin; renderAppearance();
  // 原生尖角同步临时配色；该消息不修改偏好或正文。
  void bridge.request('previewSkin', { skin: skin ?? null }).catch(showError);
}
setupSkinPicker(previewAppearance, skin => {
  if (busy()) return;
  saveSettings({ skin }); surfaces.close();
});
surfaces.onClose = id => { if (id === 'skins') previewAppearance(); };
window.addEventListener('blur', () => { if (surfaces.current === 'skins') surfaces.close(false); });
document.querySelectorAll<HTMLButtonElement>('button[data-skin]').forEach(button => button.addEventListener('click', () => {
  if (!busy()) saveSettings({ skin: button.dataset.skin as AppSettings['skin'] });
}));
document.querySelector('#font-family')!.addEventListener('change', event => {
  if (busy()) { renderAppearance(); return; }
  saveSettings({ fontFamily: (event.target as HTMLSelectElement).value as AppSettings['fontFamily'] });
});
document.querySelector('#decorations-toggle')!.addEventListener('change', event => {
  if (busy()) { renderAppearance(); return; }
  saveSettings({ decorations: (event.target as HTMLInputElement).checked });
});
document.querySelector('#reset-appearance')!.addEventListener('click', () => {
  if (!busy()) saveSettings({ skin: 'default', fontFamily: 'auto', decorations: true });
});
document.querySelector('#solid-toggle')!.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  if (busy()) { input.checked = settings.reduceTransparency; return; }
  saveSettings({ reduceTransparency: input.checked });
});
pin.addEventListener('click', () => { if (!busy()) saveSettings({ pinned: !settings.pinned }); });
for (const id of ['insert-task','empty-insert-task']) document.getElementById(id)!.addEventListener('click', () => {
  if (busy() || !workspace.active?.editor.isEditable || workspace.active.editor.view.composing) return;
  closePanels(); insertTask(workspace.active.editor);
});
document.querySelector('#history-button')!.addEventListener('click', () => {
  if (busy() || !workspace.active) return;
  closePanels(); historyOpen = true;
  document.querySelector('#history-message')!.textContent = '正在读取历史版本…'; surfaces.show('history-panel','notes');
  void (async () => {
    await workspace.flush();
    const entries = await bridge.request<HistoryEntry[]>('listHistory', { pageID: workspace.active!.pageID });
    showHistory(entries, async backupID => {
      await workspace.restoreActive((pageID, expectedRevision) => bridge.request<NoteSnapshot>('restoreHistory', { pageID, backupID, expectedRevision }));
      void refreshPageOverview().catch(showError);
    }, () => { historyOpen = false; if (!surfaces.current) workspace.active?.editor.commands.focus(undefined, { scrollIntoView: false }); }, surfaces, pageName(settings,workspace.active!.pageID));
  })().catch(error => { historyOpen = false; surfaces.show('notes'); showError(error); });
});
async function exportNote(all = false): Promise<void> {
  if (busy()) return;
  const session = workspace.active;
  if (!session) throw Error('正文尚未加载，无法导出');
  exportInProgress = true; exportButton.disabled = true;
  try {
    session.editor.view.dom.blur(); await new Promise(resolve => setTimeout(resolve, 0));
    if (session.editor.view.composing) throw Error('请先完成当前中文选词，再导出');
    if (all) {
      const overview = await bridge.request<PageOverview[]>('listPages');
      const files = pages.map((page, index) => {
        const stored = overview.find(item => item.pageID === page.id);
        if (!stored || stored.error) throw Error(`${page.name}无法读取，全部导出已取消`);
        const doc = page.id === session.pageID ? session.editor.getJSON() : stored.snapshot?.document;
        return { name: `${String(index + 1).padStart(2, '0')}-${exportName(describeNote(doc).title, pageName(settings, page.id))}`, text: doc ? serializeMarkdown(doc) : '' };
      });
      await bridge.request('exportAll', { files }, null);
    } else {
      const doc = session.editor.getJSON();
      const name = exportName(describeNote(doc).title, pageName(settings, session.pageID));
      await bridge.request('exportMarkdown', { text: serializeMarkdown(doc), name }, null);
    }
  } finally {
    exportInProgress = false; exportButton.disabled = !workspace.active;
    if (workspace.active === session && !session.editor.isDestroyed && !surfaces.current) {
      session.editor.commands.focus(undefined, { scrollIntoView: false });
    }
  }
}
document.querySelector('#export-all')!.addEventListener('click', () => { void exportNote(true).catch(showError); });
document.querySelector<HTMLButtonElement>('#hotkey-button')!.addEventListener('click', event => {
  const button = event.currentTarget as HTMLButtonElement;
  const message = document.querySelector('#hotkey-message')!;
  if (busy() || !workspace.active) return;
  const session = workspace.active;
  if (session.editor.view.composing) { message.textContent = '请先完成中文选词，再录制快捷键'; return; }
  hotKeyRecording = true; session.editor.setEditable(false, false);
  button.disabled = true; message.textContent = '正在准备录制…';
  void (async () => {
    await workspace.flush();
    const key = await bridge.request<HotKeySettings | null>('recordHotKey', undefined, null);
    if (!key) { message.textContent = '已取消，原快捷键保持不变'; return; }
    const saved = await bridge.request<AppSettings>('setHotKey', key);
    settings.hotKey = saved.hotKey; renderAppearance(); message.textContent = '快捷键已生效';
  })().catch(error => { message.textContent = error instanceof Error ? error.message : '快捷键设置失败，原快捷键保持不变'; })
    .finally(() => {
      hotKeyRecording = false; button.disabled = false;
      if (!session.editor.isDestroyed) session.editor.setEditable(true, false);
    });
});
async function saveNow(): Promise<void> {
  if (busy()) return;
  try { await workspace.flush(); await preferenceQueue; renderSaveStatus(); }
  finally { workspace.active?.editor.commands.focus(undefined, { scrollIntoView: false }); }
}
exportButton.addEventListener('click', () => { closePanels(); void exportNote().catch(error => showError(error, () => exportNote())); });
retry.addEventListener('click', () => {
  if (loadFailed) { void loadNote(); return; }
  if (operationError && !preferenceError && workspace.active?.coordinator.status !== 'error') {
    const action = operationError.retry; if (!action) { openErrorDetails(); return; }
    operationError = undefined; void action().then(renderSaveStatus).catch(error => showError(error, action)); return;
  }
  void (async () => {
    if (preferenceError) { saveSettings({}); await preferenceQueue; }
    await workspace.flush(); renderSaveStatus();
    workspace.active?.editor.commands.focus(undefined, { scrollIntoView: false });
  })().catch(showError);
});
document.querySelector('#close')!.addEventListener('click', () => { void bridge.request('hide').catch(showError); });
document.querySelector('#check-updates')!.addEventListener('click', () => { void bridge.request('checkForUpdates').catch(showError); });
document.querySelector('#quit')!.addEventListener('click', () => { void bridge.request('quit').catch(showError); });
document.addEventListener('keydown', event => {
  if (event.defaultPrevented) return;
  if (document.querySelector('dialog[open]') || hotKeyRecording) return;
  if (event.isComposing || event.keyCode === 229 || workspace.active?.editor.view.composing) return;
  if (historyOpen || archiveBusy) { if (event.key === 'Escape' && surfaces.onBack) { event.preventDefault(); surfaces.back(); } return; }
  if (event.metaKey && !event.altKey && !event.shiftKey && !event.ctrlKey && event.key.toLowerCase() === 'f') { event.preventDefault(); openSearch(); return; }
  if (event.key === 'Escape' && search.isOpen) { event.preventDefault(); search.close(); workspace.active?.editor.commands.focus(undefined, { scrollIntoView: false }); return; }
  if (event.metaKey && !event.altKey && !event.shiftKey && !event.ctrlKey && /^[1-7]$/.test(event.key)) { event.preventDefault(); void selectPage(pages[Number(event.key) - 1].id); }
  if (event.metaKey && event.altKey && !event.shiftKey && !event.ctrlKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault(); const current = pages.findIndex(page => page.id === workspace.active?.pageID);
    void selectPage(pages[(current + (event.key === 'ArrowRight' ? 1 : 6)) % 7].id);
  }
  if (event.key === 'Escape') {
    event.preventDefault(); const open = !!surfaces.current;
    if (open) surfaces.back(); else void bridge.request('hide').catch(showError);
  }
});
bridge.onCommand = message => {
  if (message.type === 'requestFlush') {
    if (surfaces.current === 'skins') surfaces.close(false);
    void (async () => {
      try {
        // 初次加载失败且始终只读时，不存在未保存编辑，允许正常退出。
        if (!workspace.active && !loadFailed) throw Error('编辑器尚未完成加载');
        await workspace.flush(); await preferenceQueue;
        if (preferenceError) throw Error(`设置未保存：${preferenceError.message}`);
        bridge.send({ type: 'flushResult', requestID: message.requestID, ok: true });
      } catch (error) {
        showError(error); bridge.send({ type: 'flushResult', requestID: message.requestID, ok: false, error: status.title });
      }
    })();
  } else if (message.type === 'requestAppend') { quickAppend(); }
  else if (message.type === 'requestSearch') { openSearch(); }
  else if (message.type === 'requestSave') void saveNow().catch(showError);
  else if (message.type === 'shortcutInfo') document.querySelector('#append-shortcut')!.textContent = String(message.appendShortcut);
  else if (message.type === 'hotKeyRecording') {
    document.querySelector('#hotkey-message')!.textContent = '按下新组合键（含 ⌘、⌃ 或 ⌥），Esc 取消';
  } else if (message.type === 'nativeSettings') {
    const native = message.settings as AppSettings;
    settings.pinned = native.pinned; settings.windowWidth = native.windowWidth; settings.windowHeight = native.windowHeight; settings.hotKey = native.hotKey; renderAppearance();
  } else if (message.type === 'windowMode') { renderWindowMode(message.floating === true, message.busy === true); }
  else if (message.type === 'requestExport') void exportNote().catch(showError);
  else if (message.type === 'focusEditor') {
    scheduleDragRegion();
    if (!busy() && !surfaces.current && !search.isOpen) workspace.active?.editor.commands.focus(undefined, { scrollIntoView: false });
  }
  else if (message.type === 'selectPage' && typeof message.index === 'number' && pages[message.index]) void selectPage(pages[message.index].id);
  else if (message.type === 'environment') {
    systemDark = message.dark === true; systemSolid = message.reduceTransparency === true; renderAppearance();
  }
};
async function loadNote(): Promise<void> {
  initialLoading = true; loadFailed = false; operationError = undefined; retry.hidden = true;
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true; });
  try {
    const result = await bridge.request<LoadedPage & { settings?: AppSettings; hotKeyError?: string; appendShortcut?: string; floating?: boolean }>('ready');
    settings = { ...defaultSettings, ...result.settings }; renderAppearance(); renderWindowMode(result.floating === true);
    document.querySelector('#hotkey-message')!.textContent = result.hotKeyError ?? '';
    if (result.appendShortcut) document.querySelector('#append-shortcut')!.textContent = result.appendShortcut;
    await workspace.activate(settings.pageID, result);
    editingAvailable();
    void loadLoginStatus();
    void refreshPageOverview().catch(showError);
  } catch (error) { loadFailed = true; hint.hidden = true; showError(error); retry.textContent = '重新加载'; retry.hidden = false; }
  finally { initialLoading = false; tabs.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = false; }); }
}
const search = setupSearch(async all => {
  const active = workspace.active;
  if (!active) return [];
  if (!all) return [{ id: active.pageID, name: pageName(settings, active.pageID), document: active.editor.getJSON() }];
  const stored = await bridge.request<PageOverview[]>('listPages');
  return pages.map(page => {
    const value = stored.find(item => item.pageID === page.id);
    return { id: page.id, name: pageName(settings, page.id), document: page.id === active.pageID ? active.editor.getJSON() : value?.snapshot?.document,
      error: page.id === active.pageID ? undefined : value?.error ?? (!value ? '无法读取' : undefined) };
  });
}, async (pageID, match) => {
  await workspace.activate(pageID);
  const editor = workspace.active!.editor;
  if (match.to > editor.state.doc.content.size || editor.state.doc.textBetween(match.from, match.to, '\n', '\n') !== match.text) throw Error('内容已变化，请使用刷新后的搜索结果');
  editor.commands.setTextSelection({ from: match.from, to: match.to });
  editor.commands.focus(undefined, { scrollIntoView: false }); editor.commands.scrollIntoView();
  saveSettings({ pageID });
}, showError, () => { surfaces.close(false); workspace.active?.editor.commands.focus(undefined, { scrollIntoView: false }); });
function openSearch(): void { if (busy() || workspace.active?.editor.view.composing) return; surfaces.show('search-panel'); search.open(); }
function quickAppend(): void {
  if (busy() || !workspace.active) return;
  closePanels(); search.close();
  if (!insertPlainParagraphAfterBlock(workspace.active.editor)) showError(Error('请先完成中文选词，再新建正文'));
  else workspace.active.editor.commands.focus(undefined, { scrollIntoView: false });
}
document.querySelector('#search-button')!.addEventListener('click', openSearch);
document.querySelector('#append-button')!.addEventListener('click', quickAppend);
document.querySelector('#completed-summary')!.addEventListener('click', () => togglePanel('completed-panel'));
document.querySelector('#fold-completed')!.addEventListener('click', () => {
  if (busy() || workspace.active?.editor.view.composing) return; saveSettings({ hideCompleted: !settings.hideCompleted }); closePanels(); renderContent();
});
document.querySelector('#clear-completed')!.addEventListener('click', () => {
  if (busy() || !workspace.active) return;
  const session = workspace.active; closePanels(); archiveBusy = true;
  void (async () => {
    await workspace.flush();
    if (session.editor.view.composing) throw Error('请先完成中文选词，再移除待办');
    session.editor.setEditable(false, false);
    await bridge.request('checkpoint', { pageID: session.pageID });
    session.editor.setEditable(true, false); const removed = completedSummary(session.editor.getJSON()).removable;
    if (!clearCompleted(session.editor)) throw Error('未能移除待办，正文保持不变');
    undoCleanup = { pageID:session.pageID, document:JSON.stringify(session.editor.getJSON()) };
    document.querySelector('#undo-message')!.textContent = `已移除 ${removed} 项已完成待办`; document.querySelector<HTMLElement>('#undo-toast')!.hidden = false;
    clearTimeout(undoTimer); undoTimer = setTimeout(() => { document.querySelector<HTMLElement>('#undo-toast')!.hidden = true; },6000);
    session.editor.commands.focus(undefined, { scrollIntoView: false });
  })().catch(showError).finally(() => { archiveBusy = false; session.editor.setEditable(true, false); });
});
function openErrorDetails(): void {
  const dialog = document.querySelector<HTMLDialogElement>('#error-dialog')!;
  document.querySelector('#error-description')!.textContent = status.title;
  const saving = workspace.active?.coordinator.status === 'error';
  document.querySelector('#error-guidance')!.textContent = saving ? '当前编辑尚未写入本机。请保留窗口，重试保存或先导出当前页。' : preferenceError ? '正文和设置分别保存。设置尚未保存，可重试；正文状态以保存结果为准。' : '该操作未完成。正文仍保留在便签中，可查看原因后重试。';
  document.querySelector<HTMLButtonElement>('#error-retry')!.disabled = !saving && !preferenceError && !loadFailed && !operationError?.retry;
  if (!dialog.open) dialog.showModal();
}
document.querySelector('#error-details-button')!.addEventListener('click', openErrorDetails);
document.querySelector('#error-close')!.addEventListener('click', () => {
  document.querySelector<HTMLDialogElement>('#error-dialog')!.close(); operationError = undefined; renderSaveStatus();
});
document.querySelector('#error-retry')!.addEventListener('click', () => { document.querySelector<HTMLDialogElement>('#error-dialog')!.close(); retry.click(); });
document.querySelector('#error-export')!.addEventListener('click', () => { document.querySelector<HTMLDialogElement>('#error-dialog')!.close(); void exportNote().catch(showError); });
document.querySelector('#rename-page')!.addEventListener('click', () => {
  if (busy() || !workspace.active || workspace.active.editor.view.composing) return;
  if (surfaces.current === 'rename-dialog') { surfaces.close(); return; }
  document.querySelector<HTMLInputElement>('#page-name-input')!.value = settings.pageNames[workspace.active.pageID] ?? '';
  document.querySelector('#rename-message')!.textContent = '最多 20 字，留空恢复默认名称。';
  surfaces.show('rename-dialog'); document.querySelector<HTMLInputElement>('#page-name-input')!.select();
});
document.querySelector('#rename-cancel')!.addEventListener('click', () => surfaces.close());
document.querySelector('#rename-form')!.addEventListener('submit', event => {
  event.preventDefault(); const name = document.querySelector<HTMLInputElement>('#page-name-input')!.value.trim();
  if (Array.from(name).length > 20 || /[\x00-\x1f\x7f]/.test(name)) { document.querySelector('#rename-message')!.textContent = '名称最多 20 字，请移除控制字符'; return; }
  const pageNames = { ...settings.pageNames }; if (name) pageNames[workspace.active!.pageID] = name; else delete pageNames[workspace.active!.pageID];
  const button = document.querySelector<HTMLButtonElement>('#rename-confirm')!; button.disabled = true; saveSettings({pageNames});
  void preferenceQueue.then(() => { button.disabled = false; if (preferenceError) document.querySelector('#rename-message')!.textContent = `名称未保存：${preferenceError.message}`; else if (surfaces.current === 'rename-dialog') surfaces.close(); });
});
document.querySelector('#undo-clear')!.addEventListener('click', () => {
  if (busy() || !undoCleanup || !workspace.active || workspace.active.editor.view.composing) return;
  const active = workspace.active;
  if (active.pageID === undoCleanup.pageID && JSON.stringify(active.editor.getJSON()) === undoCleanup.document) active.editor.commands.undo();
  undoCleanup = undefined; document.querySelector<HTMLElement>('#undo-toast')!.hidden = true; active.editor.commands.focus(undefined,{scrollIntoView:false});
});
document.querySelector('#banner-export')!.addEventListener('click', () => { void exportNote().catch(showError); });
async function manageArchive(mode: 'export' | 'import' | 'recovery'): Promise<void> {
  if (busy() || !workspace.active) return;
  search.close(); surfaces.show('backup-panel','notes'); archiveBusy = true;
  document.querySelector('#backup-message')!.textContent = mode === 'export' ? '正在准备导出…' : '正在选择并校验备份…';
  try {
    await workspace.flush(); await preferenceQueue;
    if (preferenceError) throw Error('页名或设置尚未保存，请先重试设置');
    if (mode === 'export') await bridge.request('exportArchive', undefined, null);
    else {
      const preview = await bridge.request<ArchivePreview | null>(mode === 'recovery' ? 'chooseRecoveryArchive' : 'chooseArchive', undefined, null);
      if (!preview) { document.querySelector('#backup-message')!.textContent = ''; return; }
      validateArchiveDocuments(preview.archive);
      const current = await bridge.request<PageOverview[]>('listPages');
      await previewArchive(preview, async () => {
        await workspace.replaceAll(async () => {
          const restored = await bridge.request<WorkspaceArchive>('restoreArchive', { token: preview.token }, null);
          settings.pageNames = restored.pageNames; return restored.notes;
        });
        operationError = undefined; renderSaveStatus(); void refreshPageOverview().catch(showError);
      }, surfaces, current, settings.pageNames);
      await bridge.request('discardArchive');
    }
    document.querySelector('#backup-message')!.textContent = '';
  } catch (error) { document.querySelector('#backup-message')!.textContent = error instanceof Error ? error.message : '备份操作失败'; throw error; }
  finally { archiveBusy = false; if (!surfaces.current) workspace.active?.editor.commands.focus(undefined, { scrollIntoView: false }); }
}
for (const [id, mode] of [['backup-export', 'export'], ['backup-import', 'import'], ['backup-undo', 'recovery']] as const) {
  document.querySelector(`#${id}`)!.addEventListener('click', () => { void manageArchive(mode).catch(error => showError(error, () => manageArchive(mode))); });
}
interface LoginStatus { enabled: boolean; qa?: boolean; message: string }
function renderLoginStatus(value: LoginStatus): void {
  const toggle = document.querySelector<HTMLInputElement>('#login-toggle')!;
  toggle.checked = value.enabled; toggle.disabled = value.qa === true;
  document.querySelector('#login-message')!.textContent = value.message;
}
async function loadLoginStatus(): Promise<void> {
  try { const value = await bridge.request<LoginStatus>('loginStatus'); if (value) renderLoginStatus(value); }
  catch (error) { document.querySelector('#login-message')!.textContent = error instanceof Error ? error.message : '无法读取开机启动状态'; }
}
document.querySelector('#login-toggle')!.addEventListener('change', event => {
  const toggle = event.target as HTMLInputElement; const enabled = toggle.checked; toggle.disabled = true;
  void bridge.request<LoginStatus>('setLoginItem', { enabled }).then(renderLoginStatus).catch(error => {
    toggle.checked = !enabled; toggle.disabled = false;
    document.querySelector('#login-message')!.textContent = error instanceof Error ? error.message : '开机启动设置失败';
  });
});
renderAppearance(); void loadNote();

function renderWindowMode(floating: boolean, busy = false): void {
  windowMode.setAttribute('aria-pressed', String(floating)); windowMode.disabled = busy;
  windowMode.title = floating ? '自由移动 · 点击回到菜单栏' : '跟随菜单栏 · 点击切换为自由移动';
  windowMode.setAttribute('aria-label', windowMode.title);
  windowMode.querySelector('use')!.setAttribute('href', floating ? '#i-floating' : '#i-docked');
}
windowMode.addEventListener('click', () => {
  if (busy()) return;
  void preferenceQueue.then(() => bridge.request('toggleWindowMode')).catch(showError);
});

// 网页只报告空白热区的位置；拖动完全由原生窗口处理，避免跨桥逐帧移动。
function scheduleDragRegion(): void {
  if (dragRegionQueued) return;
  dragRegionQueued = true;
  // 隐藏或刚恢复的 WKWebView 可能暂停动画帧；热区同步不能依赖绘制循环。
  queueMicrotask(() => {
    dragRegionQueued = false;
    const region = document.querySelector<HTMLElement>('#window-drag-region')!;
    const rect = region.getBoundingClientRect();
    const visible = !region.hidden && !document.querySelector('.note-window')!.classList.contains('has-pane') && !surfaces.current;
    const controls = Array.from(region.querySelectorAll<HTMLElement>('.toolbar-leading,.page-tabs,.toolbar-actions')).map(element => {
      const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height };
    });
    void bridge.request('windowDragRegion', visible ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, controls } : null).catch(() => {});
  });
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleDragRegion).observe(document.querySelector('.window-toolbar')!);
new MutationObserver(scheduleDragRegion).observe(document.querySelector('.note-window')!, { attributes: true, attributeFilter: ['class'] });
const previousSurfaceClose = surfaces.onClose;
surfaces.onClose = id => { previousSurfaceClose?.(id); scheduleDragRegion(); };
// 弹出菜单不改变窗口几何，也必须及时移除覆盖其上的原生热区。
new MutationObserver(scheduleDragRegion).observe(document.querySelector('.note-window')!, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
