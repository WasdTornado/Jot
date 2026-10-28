import { expect, test } from 'vitest';
import { describeNote, exportName } from '../src/notePresentation';

test('空白页、空待办与首行摘要分别表示', () => {
  expect(describeNote({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual({ title: '', hasContent: false });
  expect(describeNote({ type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', content: [{ type: 'paragraph' }] }] }] }).hasContent).toBe(true);
  expect(describeNote({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: '会议记录\n第二行' }] }] }).title).toBe('会议记录');
});
test('导出名称保留中文、去掉路径与控制字符，空页使用页名', () => {
  expect(exportName('../项目/会议:记录\n', '工作')).toBe('项目-会议-记录.md');
  expect(exportName('', '工作')).toBe('工作.md');
});
