// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { validateArchiveDocuments, type WorkspaceArchive } from '../src/archiveUI';
import type { JSONContent } from '@tiptap/core';
const archive = (document: JSONContent): WorkspaceArchive => ({ format: 'tot-notes-backup', version: 1, createdAt: new Date().toISOString(), pageNames: {}, notes: [
  { schemaVersion: 1, pageID: 'page-1', revision: 1, updatedAt: new Date().toISOString(), document, selection: { anchor: 1, head: 1 } },
] });
test('恢复前用编辑器结构校验内容，拒绝内部损坏的备份', () => {
  expect(() => validateArchiveDocuments(archive({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '可恢复' }] }] }))).not.toThrow();
  expect(() => validateArchiveDocuments(archive({ type: 'doc', content: [{ type: 'taskList', content: [{ type: 'paragraph' }] }] }))).toThrow('当前便签保持不变');
});
