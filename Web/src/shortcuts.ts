import type { HotKeySettings } from './pages';
export const shortcutActions = [
  { id: 'search', label: '查找便签', key: { keyCode: 3, modifiers: 256, label: '⌘F' } },
  { id: 'previous', label: '上一页', key: { keyCode: 123, modifiers: 2304, label: '⌥⌘←' } },
  { id: 'next', label: '下一页', key: { keyCode: 124, modifiers: 2304, label: '⌥⌘→' } },
  { id: 'export', label: '导出当前页', key: { keyCode: 14, modifiers: 768, label: '⇧⌘E' } },
] as const;
export type ShortcutAction = typeof shortcutActions[number]['id'];
export const defaultShortcuts = Object.fromEntries(shortcutActions.map(action => [action.id, action.key])) as Record<ShortcutAction, HotKeySettings>;
const letters: Record<number, string> = {0:'A',1:'S',2:'D',3:'F',4:'H',5:'G',6:'Z',7:'X',8:'C',9:'V',11:'B',12:'Q',13:'W',14:'E',15:'R',16:'Y',17:'T',31:'O',32:'U',34:'I',35:'P',37:'L',38:'J',40:'K',45:'N',46:'M'};
export function matchesShortcut(event: KeyboardEvent, key: HotKeySettings): boolean {
  const modifiers = (event.metaKey ? 256 : 0) | (event.shiftKey ? 512 : 0) | (event.altKey ? 2048 : 0) | (event.ctrlKey ? 4096 : 0);
  const code = letters[key.keyCode] ? `Key${letters[key.keyCode]}` : key.keyCode === 123 ? 'ArrowLeft' : 'ArrowRight';
  return modifiers === key.modifiers && (event.code ? event.code === code : event.key.toUpperCase() === (letters[key.keyCode] ?? code.toUpperCase()));
}
