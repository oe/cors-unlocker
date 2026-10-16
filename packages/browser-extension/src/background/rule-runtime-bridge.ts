// Keep execution ownership independent of request recording and temporary controls.
type Hooks = {
  ensure: (tabId: number) => Promise<unknown>;
  pause: (tabId: number, origin?: string) => void;
  resume: (tabId: number) => void;
  pausedOrigin: (tabId: number) => string | undefined;
};
let hooks: Hooks | undefined;
export function setRuleRuntimeHooks(value: Hooks) { hooks = value; }
export function ensureSavedRuleRuntime(tabId: number): Promise<unknown> {
  return hooks?.ensure(tabId) || Promise.resolve();
}
export function scheduleSavedRuleRuntime(tabId: number) {
  void ensureSavedRuleRuntime(tabId).catch(() => undefined);
}
export function pauseSavedRuleRuntime(tabId: number, origin?: string) { hooks?.pause(tabId, origin); }
export function resumeSavedRuleRuntime(tabId: number) { hooks?.resume(tabId); }

export function pausedRuleOrigin(tabId: number) { return hooks?.pausedOrigin(tabId); }
