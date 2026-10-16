// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { intercept } from './index';

function mockBridge(handler: (request: any) => { data?: unknown; error?: unknown }) {
  return vi.spyOn(window, 'postMessage').mockImplementation((message: any) => {
    if (message?.type !== 'wireflip:sdk-request') return;
    const result = handler(message);
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: {
        type: 'wireflip:sdk-response',
        clientId: message.clientId,
        id: message.id,
        ...result,
      },
    })));
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Wireflip SDK', () => {
  it('connects and exposes the origin-scoped v2 capabilities', async () => {
    mockBridge(() => ({
      data: {
        origin: 'https://app.example.com',
        capabilities: {
          protocolVersion: 2,
          product: 'Wireflip',
          browser: 'chrome',
          cors: true,
          draftRules: true,
          workspace: true,
          advancedMode: 'user-initiated',
          interception: {
            responseMock: 'synthetic',
            preflight: 'synthetic',
            networkFailure: 'reasoned',
            resourceTypes: 'distinct-fetch-xhr',
          },
        },
      },
    }));

    const session = await intercept.connect();
    expect(session.origin).toBe('https://app.example.com');
    expect(session.capabilities.advancedMode).toBe('user-initiated');
    expect(session.capabilities.interception.responseMock).toBe('synthetic');
  });

  it('uses the session bridge for CORS and safe rule drafts', async () => {
    const methods: string[] = [];
    mockBridge((request) => {
      methods.push(request.method);
      if (request.method === 'connect') return { data: {
        origin: 'https://app.example.com',
        capabilities: {
          protocolVersion: 2,
          product: 'Wireflip',
          browser: 'chrome',
          cors: true,
          draftRules: true,
          workspace: true,
          advancedMode: 'user-initiated',
          interception: {
            responseMock: 'synthetic',
            preflight: 'synthetic',
            networkFailure: 'reasoned',
            resourceTypes: 'distinct-fetch-xhr',
          },
        },
      } };
      if (request.method === 'requestCors') return { data: {
        origin: 'https://app.example.com',
        cors: { enabled: true, credentials: false },
        advancedMode: 'disabled',
      } };
      return { data: { id: 'draft-1', enabled: false, workspaceOpened: false } };
    });

    const session = await intercept.connect();
    expect((await session.requestCors({ reason: 'Preview API' })).cors.enabled).toBe(true);
    expect(await session.createRuleDraft({
      name: 'Slow API',
      urlPattern: 'https://api.example.com/*',
      actions: [{ type: 'delay', milliseconds: 800 }],
    }, { openWorkspace: false })).toMatchObject({ id: 'draft-1', enabled: false });
    expect(methods).toEqual(['connect', 'requestCors', 'createRuleDraft']);
  });

  it('maps bridge failures to typed errors', async () => {
    mockBridge(() => ({ error: { type: 'user-cancel', message: 'Declined' } }));
    await expect(intercept.connect()).rejects.toMatchObject({
      name: 'InterceptError',
      type: 'user-cancel',
      message: 'Declined',
    });
  });
});

it('requires activation support and preserves typed approval cancellation', async () => {
  const bridge = mockBridge(request => request.method === 'connect' ? { data: { origin: 'https://app.example', capabilities: { ruleActivation: true } } } : { error: { type: 'user-cancel', message: 'Declined' } });
  const session = await intercept.connect();
  await expect(session.requestRule({ name: 'Mock', urlPattern: '*', actions: [{ type: 'block' }] })).rejects.toMatchObject({ type: 'user-cancel' });
  expect(bridge.mock.calls.some(([request]) => (request as any).method === 'requestRule')).toBe(true);
});
it('does not ask an older extension to activate a rule', async () => {
  const bridge = mockBridge(() => ({ data: { origin: 'https://app.example', capabilities: { protocolVersion: 2 } } }));
  const session = await intercept.connect();
  await expect(session.requestRule({ name: 'Block', urlPattern: '*', actions: [{ type: 'block' }] })).rejects.toThrow('Update Wireflip');
  expect(bridge.mock.calls).toHaveLength(1);
});
