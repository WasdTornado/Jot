import { defaultSettings, pages, type AppSettings } from '../Web/src/pages';
import type { NoteSnapshot } from '../Web/src/types';
import { parseMarkdown } from '../Web/src/markdown';

const samples = [
 '# 把一闪而过的念头留下\n\n一本关于日常小事的书。\n\n> 有些想法，写下来才会长大。',
 '# 今天，专注这几件事\n\n- [x] 整理会议里的三个决定\n- [ ] 把新想法写进方案\n- [ ] 下班前收好今天的尾巴',
 '# 今天，慢慢来。\n\n- [x] 给窗边的绿植浇水\n- [ ] 读完书里的一个章节\n- [ ] 下班路上，买一束花\n\n> 也记得给自己留一点空白。',
 '# 读到这里，想记一句\n\n> 生活的细节，值得慢慢读。\n\n下次去书店，挑一本没读过的散文。',
 '# 还没写完，也没关系\n\n嗨，好久不见。\n\n突然想起上次一起散步的那个傍晚……',
 '# 不急着整理的想法\n\n窗外的光，刚好落在书页上。\n\n> 留一页，给没有名字的念头。',
 '# 把周末留给自己\n\n- [ ] 去附近的新咖啡店\n- [ ] 找条没走过的散步路线\n- [ ] 给家里打个电话',
];
// 网页沿用应用的编辑与保存协议，数据只存内存，不访问本机便签。
export function createDemoStore(skin: AppSettings['skin'] = 'default') {
 let settings: AppSettings = structuredClone({ ...defaultSettings, theme: 'light', skin });
 const notes = new Map(pages.map((page, index) => [page.id, {
  schemaVersion:1, pageID:page.id, revision:0, updatedAt:new Date().toISOString(),
  document:parseMarkdown(samples[index]), selection:{anchor:1,head:1,scrollTop:0},
 } as NoteSnapshot]));
 const history = new Map<string, NoteSnapshot[]>();
 return {
  get settings() { return structuredClone(settings); },
  configure(value: AppSettings) { settings = structuredClone(value); return this.settings; },
  load(id: string) { if (!notes.has(id)) throw Error('无效演示页'); return {snapshot:structuredClone(notes.get(id)!),recovered:false}; },
  list() { return pages.map(page => ({pageID:page.id,...this.load(page.id)})); },
  save(snapshot: NoteSnapshot) {
   const previous = this.load(snapshot.pageID).snapshot;
   if (snapshot.revision < previous.revision) return {pageID:snapshot.pageID,revision:previous.revision,ignored:true};
   if (JSON.stringify(previous.document) !== JSON.stringify(snapshot.document)) {
    history.set(snapshot.pageID,[previous,...(history.get(snapshot.pageID) ?? [])].slice(0,10));
   }
   notes.set(snapshot.pageID,structuredClone(snapshot));
   return {pageID:snapshot.pageID,revision:snapshot.revision,ignored:false};
  },
  history(id: string) { return structuredClone((history.get(id) ?? []).map((snapshot,index) => ({id:String(index),snapshot}))); },
  restore(id: string, backupID: string, revision: number) {
   const snapshot = this.history(id).find(entry => entry.id === backupID)?.snapshot;
   if (!snapshot) throw Error('演示历史已失效');
   snapshot.revision = revision+1; snapshot.updatedAt = new Date().toISOString();
   this.save(snapshot); return snapshot;
  },
 };
}
