import { describe, expect, it } from 'vitest';
import { explainRuleMatch } from '@/common/rule-explanation';
import type { IProxyRule } from '@/common/proxy-state';

const rule: IProxyRule = {
  id: 'qa', name: 'QA', enabled: true, source: 'user', createdAt: 0, updatedAt: 0,
  match: { initiatorOrigins: ['https://app.example'], urlPattern: '*://api.example/items?x=*', methods: ['GET'], resourceTypes: ['Fetch'] },
  actions: [{ type: 'delay', milliseconds: 100 }],
};
describe('current rule explanations', () => {
  it('treats punctuation literally and explains independent mismatches', () => {
    expect(explainRuleMatch(rule, 'https://app.example', { url: 'https://api.example/items?x=1', method: 'GET', resourceType: 'Fetch' })).toEqual([]);
    expect(explainRuleMatch({ ...rule, enabled: false }, 'https://other.example', { url: 'https://apiXexample/items?x=1', method: 'POST', resourceType: 'Image' })).toEqual([
      'Rule is disabled', 'Page origin does not match', 'Request URL does not match', 'HTTP method does not match', 'Resource type does not match',
    ]);
  });
  it('accounts for Firefox combining Fetch and XHR', () => {
    const request = { url: 'https://api.example/items?x=1', method: 'GET', resourceType: 'XHR' };
    expect(explainRuleMatch(rule, 'https://app.example', request, true)).toEqual([]);
    expect(explainRuleMatch(rule, 'https://app.example', request, false)).toEqual(['Resource type does not match']);
  });
});
