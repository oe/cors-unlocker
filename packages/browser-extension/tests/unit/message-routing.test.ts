import { describe, expect, it, vi } from 'vitest';
import { createFirefoxMessageRouter } from '../../src/background/message-routing';

describe('Firefox SDK message routing', () => {
  it('routes the packaged top-level SDK bridge to the SDK handler on arbitrary sites', async () => {
    const internal = vi.fn(async () => ({ origin: 'https://app.example' }));
    const external = vi.fn();
    const route = createFirefoxMessageRouter(internal, external, 'moz-extension://self/');
    const sender = { tab: { id: 9, url: 'https://app.example/' }, url: 'https://app.example/', frameId: 0 } as any;
    const message = { type: 'sdkRequest', payload: { method: 'connect' } };
    expect(await route(message, sender)).toEqual({ origin: 'https://app.example' });
    expect(internal).toHaveBeenCalledWith(message, sender);
    expect(external).not.toHaveBeenCalled();
  });
  it('keeps legacy hosted-site messages in their origin-validated handler', async () => {
    const internal = vi.fn(); const external = vi.fn();
    const route = createFirefoxMessageRouter(internal, external, 'moz-extension://self/');
    await route({ method: 'enable', payload: { origin: 'https://app.example' } }, { tab: { id: 1 }, url: 'https://cors.forth.ink/' } as any);
    expect(external).toHaveBeenCalledOnce(); expect(internal).not.toHaveBeenCalled();
  });
  it('does not forward privileged state operations from a web content script', async () => {
    const internal = vi.fn(); const external = vi.fn();
    const route = createFirefoxMessageRouter(internal, external, 'moz-extension://self/');
    await route({ type: 'proxyStateOperation', payload: { kind: 'remove', id: 'rule' } }, { tab: { id: 1 }, url: 'https://app.example/' } as any);
    expect(internal).not.toHaveBeenCalled(); expect(external).not.toHaveBeenCalled();
    await route({ type: 'getProxyState' }, { url: 'moz-extension://self/options.html' });
    expect(internal).toHaveBeenCalledOnce();
  });
});
