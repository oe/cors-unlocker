import browser from 'webextension-polyfill';
import { getSiteAccess, updateSiteAccess } from '@/common/sdk-access';
import type { IProxyAction } from '@/common/proxy-state';

export interface SdkApprovalInfo {
  origin: string;
  title: string;
  button: string;
  name: string;
  pattern?: string;
  actions: IProxyAction[];
  reason?: string;
}
type Pending = {
  id: string; tabId: number; requesterOrigin: string; info: SdkApprovalInfo;
  windowId?: number; committing?: boolean; timer: ReturnType<typeof setTimeout>;
  execute: () => Promise<unknown>; finish: (result: unknown) => void;
};
const pending = new Map<string, Pending>();
const completedLabels: Record<string, string> = {
  'Enable CORS?': 'CORS enabled', 'Disable CORS?': 'CORS disabled',
  'Create this rule draft?': 'Rule draft created', 'Enable this rule?': 'Rule enabled',
  'Disable this rule?': 'Rule disabled', 'Delete this rule?': 'Rule deleted',
};
export function sdkApprovalInfo(id: string) {
  const request = pending.get(id);
  if (!request) throw new Error('This approval request has expired.');
  return request.info;
}
function finish(request: Pending, result: unknown) {
  if (!pending.delete(request.id)) return;
  clearTimeout(request.timer);
  request.finish(result);
  if (request.windowId !== undefined) void browser.windows.remove(request.windowId).catch(() => undefined);
}
async function checkPage(tabId: number, origin: string) {
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || new URL(tab.url).origin !== origin) throw new Error('The requesting page has changed. Try again from that page.');
}
export async function approveSdkOperation(options: {
  tabId: number; requesterOrigin: string; info: SdkApprovalInfo;
  userActivated: boolean; sensitive?: boolean; forceConfirmation?: boolean;
}, execute: () => Promise<unknown>): Promise<unknown> {
  const { tabId, requesterOrigin, info } = options;
  const run = async () => {
    await checkPage(tabId, requesterOrigin);
    const result = await execute();
    // An audit write must not turn a completed mutation into an apparent failure.
    await updateSiteAccess(info.origin, { lastOperation: { label: completedLabels[info.title] || info.title, at: Date.now() } }).catch(() => undefined);
    return result;
  };
  const access = await getSiteAccess(info.origin);
  if (access.trusted && !options.sensitive && !options.forceConfirmation) return run();
  if (!options.userActivated) return { error: { type: 'invalid-request', message: 'Request a change from a click or keyboard action on this page.' } };
  if ([...pending.values()].some(request => request.tabId === tabId)) throw new Error('An approval is already open for this tab.');
  const id = crypto.randomUUID();
  return new Promise(resolve => {
    const request: Pending = { id, tabId, requesterOrigin, info, execute: run, finish: resolve,
      timer: setTimeout(() => finish(request, { error: { type: 'user-cancel', message: 'Approval expired.' } }), 120_000) };
    pending.set(id, request);
    void browser.windows.create({ url: browser.runtime.getURL('src/approve/index.html') + '?id=' + encodeURIComponent(id),
      type: 'popup', width: 520, height: 660 }).then(window => {
      if (!pending.has(id)) { if (window.id !== undefined) void browser.windows.remove(window.id); return; }
      request.windowId = window.id;
    }).catch(error => finish(request, { error: { type: 'communication-failed', message: String(error) } }));
  });
}
export async function resolveSdkApproval(id: string, accepted: boolean) {
  const request = pending.get(id);
  if (!request) throw new Error('This approval request has expired.');
  if (request.committing) throw new Error('This operation is already being applied.');
  if (!accepted) { finish(request, { error: { type: 'user-cancel', message: 'The user declined the request.' } }); return; }
  request.committing = true;
  clearTimeout(request.timer);
  try { finish(request, await request.execute()); }
  catch (error) { finish(request, { error: { type: 'invalid-request', message: error instanceof Error ? error.message : String(error) } }); }
}
browser.windows.onRemoved.addListener(windowId => {
  for (const request of pending.values()) if (request.windowId === windowId && !request.committing)
    finish(request, { error: { type: 'user-cancel', message: 'The approval window was closed.' } });
});
browser.tabs.onRemoved.addListener(tabId => {
  for (const request of pending.values()) if (request.tabId === tabId && !request.committing)
    finish(request, { error: { type: 'user-cancel', message: 'The requesting tab was closed.' } });
});
