/** Bound a native operation without replacing its executor. Always remove listeners/timers. */
export function waitForDelegation<T>(operation: Promise<T>, options: {
  signal: AbortSignal;
  cancel: () => void;
  progress?: () => unknown;
  idleMs?: number;
  maxMs?: number;
  pollMs?: number;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const started = Date.now();
    let lastProgress = started;
    const readProgress = () => { try { return options.progress?.(); } catch { return undefined; } };
    let marker = readProgress();
    const finish = (error: unknown, value?: T) => {
      if (finished) return;
      finished = true; clearInterval(timer); options.signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value as T);
    };
    const stop = (code: string, message: string) => {
      try { options.cancel(); } catch { /* The boundary still reports the original failure. */ }
      finish(Object.assign(new Error(message), { code }));
    };
    const abort = () => stop('experts/delegation-cancelled', '成员任务已取消。');
    const timer = setInterval(() => {
      const now = Date.now();
      const current = readProgress();
      if (current !== marker) { marker = current; lastProgress = now; }
      if (now - started >= (options.maxMs ?? 30 * 60_000)) stop('experts/delegation-timeout', '成员任务超过最长等待时间，已停止；已有文件保留。');
      else if (now - lastProgress >= (options.idleMs ?? 5 * 60_000)) stop('experts/delegation-stalled', '成员任务超过无进展等待时间，已停止；已有文件保留。');
    }, options.pollMs ?? 1000);
    options.signal.addEventListener('abort', abort, { once: true });
    operation.then(value => finish(undefined, value), error => finish(error));
    if (options.signal.aborted) abort();
  });
}
