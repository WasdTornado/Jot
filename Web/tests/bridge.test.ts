import { expect, test, vi } from 'vitest';
import { NativeBridge } from '../src/bridge';

test('原生响应只完成对应 requestID，请求错误传播给调用方', async () => {
  const sent: Record<string, unknown>[] = [];
  const bridge = new NativeBridge(message => sent.push(message));
  const pending = bridge.request('save', { pageID: 'page-1' });
  bridge.receive({ type: 'saveResult', requestID: 'other', ok: true, payload: 8 });
  bridge.receive({ type: 'saveResult', requestID: sent[0].requestID, ok: false, error: '磁盘写入失败' });
  await expect(pending).rejects.toThrow('磁盘写入失败');
  bridge.dispose();
});
test('用户停留在导出面板时不按写盘超时处理', async () => {
  vi.useFakeTimers();
  const sent: Record<string, unknown>[] = [];
  const bridge = new NativeBridge(message => sent.push(message));
  let finished = false;
  let failure: unknown;
  const pending = bridge.request('exportMarkdown', {}, null).then(() => { finished = true; }).catch(error => { failure = error; });
  await vi.advanceTimersByTimeAsync(15000); expect(failure).toBeUndefined(); expect(finished).toBe(false);
  bridge.receive({ type: 'exportResult', requestID: sent[0].requestID, ok: true });
  await pending; expect(finished).toBe(true); bridge.dispose(); vi.useRealTimers();
});
