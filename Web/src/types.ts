import type { JSONContent } from '@tiptap/core';

export interface EditorSelection { anchor: number; head: number; scrollTop?: number }
export interface NoteSnapshot {
  schemaVersion: 1; pageID: string; revision: number; updatedAt: string;
  document: JSONContent; selection: EditorSelection;
}
export interface SaveReceipt { pageID: string; revision: number; ignored: boolean }
