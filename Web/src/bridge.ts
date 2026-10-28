export type BridgeMessage = Record<string, unknown>;
interface PendingRequest {
  resolve: (payload: unknown) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export class NativeBridge {
  onCommand: (message: BridgeMessage) => void = () => {};
  private pending = new Map<string, PendingRequest>();
  private counter = 0;
  private disposed = false;
  constructor(private post: (message: BridgeMessage) => void) {}
  send(message: BridgeMessage): void { if (!this.disposed) this.post(message); }
  request<T>(type: string, payload?: unknown, timeoutMs: number | null = 10000): Promise<T> {
    if (this.disposed) return Promise.reject(Error('原生连接已关闭'));
    const requestID = `web-${++this.counter}`;
    return new Promise<T>((resolve, reject) => {
      const timer = timeoutMs === null ? undefined : setTimeout(() => {
        this.pending.delete(requestID); reject(Error('本地操作响应超时'));
      }, timeoutMs);
      this.pending.set(requestID, { resolve: value => resolve(value as T), reject, timer });
      try { this.post({ type, requestID, payload }); }
      catch (error) { clearTimeout(timer); this.pending.delete(requestID); reject(error); }
    });
  }
  receive(value: unknown): void {
    if (this.disposed || !value || typeof value !== 'object' || Array.isArray(value)) return;
    const message = value as BridgeMessage;
    if (typeof message.type !== 'string') return;
    const request = typeof message.requestID === 'string' ? this.pending.get(message.requestID) : undefined;
    if (request) {
      clearTimeout(request.timer); this.pending.delete(message.requestID as string);
      if (message.ok === true) request.resolve(message.payload);
      else request.reject(Error(typeof message.error === 'string' ? message.error : '本地操作失败'));
    } else this.onCommand(message);
  }
  dispose(): void {
    this.disposed = true;
    this.pending.forEach(request => { clearTimeout(request.timer); request.reject(Error('原生连接已关闭')); });
    this.pending.clear();
  }
}
