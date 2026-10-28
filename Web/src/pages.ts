export const pages = [
  { id: 'page-2', name: '灵感', color: '#b58d29', dark: '#dfbd67', rgb: '181,141,41' },
  { id: 'page-3', name: '工作', color: '#bd7647', dark: '#e5a779', rgb: '189,118,71' },
  { id: 'page-1', name: '日常', color: '#b74760', dark: '#e69ab1', rgb: '183,71,96' },
  { id: 'page-4', name: '阅读', color: '#9a78ac', dark: '#bba6d0', rgb: '154,120,172' },
  { id: 'page-5', name: '草稿', color: '#87838c', dark: '#b9b4c1', rgb: '135,131,140' },
  { id: 'page-6', name: '随想', color: '#438b98', dark: '#8ac1c9', rgb: '67,139,152' },
  { id: 'page-7', name: '生活', color: '#758d5d', dark: '#b3c59a', rgb: '117,141,93' },
];
export interface HotKeySettings { keyCode: number; modifiers: number; label: string }
// fontSize 保留旧版存储档位 15 / 16 / 18；紧凑排版按档位映射为 13 / 14 / 16 pt。
export interface AppSettings { pageNames: Record<string, string>; hideCompleted: boolean; pageID: string; theme: 'system' | 'light' | 'dark'; fontSize: 15 | 16 | 18; pinned: boolean; reduceTransparency: boolean; hotKey: HotKeySettings; windowWidth: number; windowHeight: number }
export const defaultSettings: AppSettings = { pageNames: {}, hideCompleted: false, pageID: 'page-1', theme: 'system', fontSize: 16, pinned: false, reduceTransparency: false, hotKey: { keyCode: 49, modifiers: 6144, label: '⌃⌥空格' }, windowWidth: 480, windowHeight: 478 };

export function pageName(settings: AppSettings, id: string): string { return settings.pageNames[id] || pages.find(page => page.id === id)?.name || id; }
