/** A stopped session must release delayed requests immediately. */
export function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const finish = (completed: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve(completed);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(true), Math.min(Math.max(milliseconds, 0), 30_000));
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Fixed windows, not debounce: sustained traffic still receives regular updates. */
export function batchTabNotifications(send: (tabId: number) => void, interval = 100) {
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  return {
    notify(tabId: number) {
      if (timers.has(tabId)) return;
      timers.set(tabId, setTimeout(() => { timers.delete(tabId); send(tabId); }, interval));
    },
    cancel(tabId: number) {
      clearTimeout(timers.get(tabId));
      timers.delete(tabId);
    },
  };
}
