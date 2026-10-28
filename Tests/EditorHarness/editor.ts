import { selectAllNoteText } from '../../Web/src/editorInput';
import { createNoteEditor } from '../../Web/src/editor';
const editor = createNoteEditor(document.querySelector('#editor')!, report);
const fixture = '<hr><p>首行正文</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>待办文字</p></li></ul><blockquote><p>引用内容</p></blockquote><p>末行正文</p><hr>';
function report() {
  const { from, to } = editor.state.selection;
  const value = { from, to, size: editor.state.doc.content.size, document: editor.getJSON(), text: editor.getText() };
  document.querySelector('#result')!.textContent = JSON.stringify(value);
  (window as any).webkit?.messageHandlers.qa.postMessage(value);
}
editor.on('selectionUpdate', report);
document.querySelector('#mixed')!.addEventListener('click', () => { editor.commands.setContent(fixture); editor.commands.focus(1); report(); });
document.querySelector('#inline')!.addEventListener('click', () => { editor.commands.setContent('<p><code>hello</code></p>'); editor.commands.focus(6); report(); });
editor.commands.setContent(fixture); editor.commands.focus(1); report();

(window as any).totNotes = { selectAll: () => selectAllNoteText(editor) };
