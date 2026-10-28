import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SaveCoordinator } from '../src/saveCoordinator';
import type { NoteSnapshot, SaveReceipt } from '../src/types';

let revision: number;
const snapshot = (): NoteSnapshot => ({ schemaVersion: 1, pageID: 'page-1', revision,
  updatedAt: '2026-10-19T00:00:00.000Z', document: { type: 'doc', content: [{ type: 'paragraph' }] }, selection: { anchor: 1, head: 1 } });
const receipt = (r: number): SaveReceipt => ({ pageID: 'page-1', revision: r, ignored: false });
let coordinator: SaveCoordinator;
beforeEach(() => { vi.useFakeTimers(); revision = 0; });
afterEach(() => { coordinator?.dispose(); vi.useRealTimers(); });

test('停顿 300ms 自动保存，未改动不写盘', async () => {
  const writes: number[] = [];
  coordinator = new SaveCoordinator(snapshot, async s => { writes.push(s.revision); return receipt(s.revision); });
  await coordinator.flush(); expect(writes).toEqual([]);
  revision++; coordinator.changed();
  await vi.advanceTimersByTimeAsync(299); expect(writes).toEqual([]);
  await vi.advanceTimersByTimeAsync(1); expect(writes).toEqual([1]); expect(coordinator.status).toBe('saved');
});
test('持续编辑最多一秒发起保存', async () => {
  const writes: number[] = [];
  coordinator = new SaveCoordinator(snapshot, async s => { writes.push(s.revision); return receipt(s.revision); });
  for (let i = 0; i < 5; i++) { revision++; coordinator.changed(); await vi.advanceTimersByTimeAsync(200); }
  expect(writes).toEqual([5]);
});
test('写盘失败保持未保存且允许重试', async () => {
  let failing = true;
  coordinator = new SaveCoordinator(snapshot, async s => { if (failing) throw Error('只读目录'); return receipt(s.revision); });
  revision++; coordinator.changed();
  await expect(coordinator.flush()).rejects.toThrow('只读目录'); expect(coordinator.status).toBe('error');
  failing = false; await coordinator.flush(); expect(coordinator.status).toBe('saved');
});
test('反序确认和旧失败不覆盖新版本保存状态', async () => {
  const pending = new Map<number, { resolve: (s: SaveReceipt) => void; reject: (e: Error) => void }>();
  coordinator = new SaveCoordinator(snapshot, s => new Promise((resolve, reject) => pending.set(s.revision, { resolve, reject })));
  revision++; coordinator.changed(); await vi.advanceTimersByTimeAsync(300);
  revision++; coordinator.changed(); await vi.advanceTimersByTimeAsync(300);
  pending.get(2)!.resolve(receipt(2)); await vi.advanceTimersByTimeAsync(0);
  expect(coordinator.status).toBe('saved');
  pending.get(1)!.reject(Error('晚到的旧失败')); await vi.advanceTimersByTimeAsync(0);
  expect(coordinator.status).toBe('saved');
});
test('旧成功确认不会清除最新版本保存失败，仍可重试', async () => {
  const pending = new Map<number, { resolve: (s: SaveReceipt) => void; reject: (e: Error) => void }>();
  coordinator = new SaveCoordinator(snapshot, s => new Promise((resolve, reject) => pending.set(s.revision, { resolve, reject })));
  revision++; coordinator.changed(); await vi.advanceTimersByTimeAsync(300);
  revision++; coordinator.changed(); await vi.advanceTimersByTimeAsync(300);
  pending.get(2)!.reject(Error('最新写入失败')); await vi.advanceTimersByTimeAsync(0);
  expect(coordinator.status).toBe('error');
  pending.get(1)!.resolve(receipt(1)); await vi.advanceTimersByTimeAsync(0);
  expect(coordinator.status).toBe('error'); expect(coordinator.error).toBe('最新写入失败');
  const retry = coordinator.flush(); await vi.advanceTimersByTimeAsync(0);
  pending.get(2)!.resolve(receipt(2)); await retry; expect(coordinator.status).toBe('saved');
});
test('flush 不因旧确认提前完成', async () => {
  const pending = new Map<number, (s: SaveReceipt) => void>();
  coordinator = new SaveCoordinator(snapshot, s => new Promise(resolve => pending.set(s.revision, resolve)));
  revision++; coordinator.changed(); await vi.advanceTimersByTimeAsync(300);
  revision++; coordinator.changed();
  let finished = false; const flush = coordinator.flush().then(() => { finished = true; });
  await vi.advanceTimersByTimeAsync(0);
  pending.get(1)!(receipt(1)); await vi.advanceTimersByTimeAsync(0); expect(finished).toBe(false);
  pending.get(2)!(receipt(2)); await flush; expect(finished).toBe(true);
});
test('组合输入期间等待最终中文提交再刷新', async () => {
  const writes: number[] = [];
  coordinator = new SaveCoordinator(snapshot, async s => { writes.push(s.revision); return receipt(s.revision); });
  coordinator.compositionStarted(); revision++; coordinator.changed();
  await vi.advanceTimersByTimeAsync(1200); expect(writes).toEqual([]);
  const flush = coordinator.flush();
  revision++; coordinator.compositionEnded(); await flush;
  expect(writes).toEqual([2]);
});
test('拒绝不同页确认且释放后不发送写盘', async () => {
  let writes = 0;
  coordinator = new SaveCoordinator(snapshot, async s => { writes++; return { ...receipt(s.revision), pageID: 'wrong' }; });
  revision++; coordinator.changed(); await expect(coordinator.flush()).rejects.toThrow();
  coordinator.dispose(); revision++; coordinator.changed();
  await vi.advanceTimersByTimeAsync(2000); expect(writes).toBe(1);
});
