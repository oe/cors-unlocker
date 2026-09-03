import { describe, expect, it } from 'vitest';
import { compileProxyRules } from '../../src/background/proxy-dnr';
import type { IProxyRule } from '../../src/common/proxy-state';

function rule(overrides: Partial<IProxyRule> = {}): IProxyRule {
  return {
    id: 'rule-1',
    name: 'Headers',
    enabled: true,
    source: 'user',
    match: {
      initiatorOrigins: ['https://app.example.com'],
      urlPattern: '*://api.example.com/*',
      methods: ['GET'],
      resourceTypes: ['XHR', 'Fetch'],
    },
    actions: [{ type: 'setResponseHeaders', headers: { 'X-Debug': 'yes' } }],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('proxy DNR compiler', () => {
  it('compiles header actions with page, URL, method, and resource matching', () => {
    const [compiled] = compileProxyRules([rule()]);
    expect(compiled.condition).toMatchObject({
      urlFilter: '*://api.example.com/*',
      initiatorDomains: ['app.example.com'],
      requestMethods: ['get'],
      resourceTypes: ['xmlhttprequest'],
    });
    expect(compiled.action).toMatchObject({
      type: 'modifyHeaders',
      responseHeaders: [{ header: 'X-Debug', operation: 'set', value: 'yes' }],
    });
  });

  it('uses terminal DNR actions and leaves CDP-only actions out', () => {
    expect(compileProxyRules([rule({ actions: [{ type: 'block' }] })])[0].action.type).toBe('block');
    expect(compileProxyRules([rule({ actions: [{ type: 'redirect', url: 'https://example.com/' }] })])[0].action.type).toBe('redirect');
    expect(compileProxyRules([rule({ actions: [{ type: 'delay', milliseconds: 100 }] })])).toEqual([]);
    expect(compileProxyRules([rule({ actions: [{ type: 'mockResponse', status: 200, headers: {}, body: '{}' }] })])).toEqual([]);
  });

  it('does not recompile migrated CORS rules', () => {
    expect(compileProxyRules([rule({ source: 'legacy-cors', legacyRuleId: 1 })])).toEqual([]);
  });
});
