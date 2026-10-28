import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { fullyCompleted } from './dailyEditing';
import type { Editor } from '@tiptap/core';
const key = new PluginKey<boolean>('completedFold');
export const CompletedFold = Extension.create({
  name: 'completedFold',
  addProseMirrorPlugins() {
    return [new Plugin<boolean>({
      key, state: { init: () => false, apply: (tr, previous) => tr.getMeta(key) ?? previous },
      props: { decorations: state => {
        if (!key.getState(state)) return null;
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'taskItem' || !fullyCompleted(node.toJSON())) return;
          // 当前正在编辑的完成项继续显示，避免勾选后光标突然消失。
          if (state.selection.from < pos + node.nodeSize && state.selection.to > pos) return;
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'completed-folded' })); return false;
        });
        return DecorationSet.create(state.doc, decorations);
      } },
    })];
  },
});
export function setCompletedFold(editor: Editor, value: boolean): void {
  if (key.getState(editor.state) !== value) editor.view.dispatch(editor.state.tr.setMeta(key, value).setMeta('addToHistory', false));
}
