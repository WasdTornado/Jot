// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { parseMarkdown, serializeMarkdown } from '../src/markdown';

test('中文嵌套任务与 Markdown 特殊字符往返保留语义', () => {
  const source = '# 今日\n\n- [x] 整理会议记录\n  - [ ] 跟进接口😀\n\n**加粗** 和 *斜体*、~~删除~~、`代码`\n\n> 引用\n\n1. 顺序\n\n```js\n[] 不转换\n```\n\n字面 \\*星号\\* 与 \\`反引号\\` 和 \\\\ 路径';
  const doc = parseMarkdown(source);
  const exported = serializeMarkdown(doc);
  expect(exported).toContain('- [x] 整理会议记录');
  expect(exported).toContain('- [ ] 跟进接口😀');
  expect(parseMarkdown(exported)).toEqual(doc);
});

test.each(['# 普通正文', '- 普通正文', '+ 普通正文', '1. 普通正文', '1) 普通正文', '---', '- - -', '==='])('普通段落 %s 导出后不变成 Markdown 块', text => {
  const document = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
  expect(parseMarkdown(serializeMarkdown(document))).toEqual(document);
});
