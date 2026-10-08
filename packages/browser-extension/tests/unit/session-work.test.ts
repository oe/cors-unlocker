import { afterEach, expect, it, vi } from 'vitest';
import { batchTabNotifications, waitForDelay } from '../../src/background/session-work';
afterEach(() => vi.useRealTimers());
it('bounds notifications during bursts without starving sustained traffic', async () => {
  vi.useFakeTimers();
  const send = vi.fn();
  const batch = batchTabNotifications(send);
  for (let i = 0; i < 1000; i++) batch.notify(1);
  batch.notify(2);
  await vi.advanceTimersByTimeAsync(100);
  expect(send.mock.calls).toEqual([[1], [2]]);
  for (let i = 0; i < 1000; i++) batch.notify(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(send).toHaveBeenCalledTimes(3);
  batch.notify(1); batch.cancel(1);
  await vi.advanceTimersByTimeAsync(100);
  expect(send).toHaveBeenCalledTimes(3);
});
it('cancels a long delay without advancing time or retaining its timer', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const pending = waitForDelay(30000, controller.signal);
  controller.abort();
  expect(await pending).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it('finishes an uncancelled delay at its deadline', async () => {
  vi.useFakeTimers();
  const pending = waitForDelay(500, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(500);
  expect(await pending).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
