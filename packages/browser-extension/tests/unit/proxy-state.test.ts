import { describe, expect, it } from 'vitest';
import {
  getCorsCompatibilityRules,
  isProxyAppState,
  migrateLegacyState,
  withLegacyRules,
  type IProxyRule,
} from '../../src/common/proxy-state';
import type { IRuleItem } from '../../src/types';

const legacyRule: IRuleItem = {
  id: 7,
  createdAt: 100,
  updatedAt: 200,
  domain: 'app.example.com',
  origin: 'https://app.example.com',
  credentials: true,
  extraHeaders: 'X-Tenant, X-Trace',
  disabled: false,
};

describe('proxy state migration', () => {
  it('migrates every v1 rule and setting without changing its behavior', () => {
    const state = migrateLegacyState([legacyRule], {
      dftEnableCredentials: true,
      debugMode: true,
      maxRules: 321,
      autoCleanupDays: 12,
    }, 999);

    expect(state.schemaVersion).toBe(2);
    expect(state.migration).toEqual({ source: 'cors-unlocker-v1', migratedAt: 999 });
    expect(state.settings).toMatchObject({
      dftEnableCredentials: true,
      debugMode: true,
      maxRules: 321,
      autoCleanupDays: 12,
    });
    expect(state.rules[0]).toMatchObject({
      id: 'legacy-cors-7',
      enabled: true,
      legacyRuleId: 7,
      match: { initiatorOrigins: ['https://app.example.com'], urlPattern: '*' },
      actions: [{
        type: 'cors',
        allowCredentials: true,
        allowOrigin: 'initiator',
        allowHeaders: ['X-Tenant', 'X-Trace'],
      }],
    });
    expect(getCorsCompatibilityRules(state)).toEqual([{
      ...legacyRule,
      extraHeaders: 'X-Tenant,X-Trace',
    }]);
  });

  it('updates migrated rules while preserving native v2 rules', () => {
    const state = migrateLegacyState([legacyRule], {}, 999);
    const userRule: IProxyRule = {
      id: 'user-rule',
      name: 'Mock API',
      enabled: true,
      source: 'user',
      match: { initiatorOrigins: ['*'], urlPattern: '*://api.example.com/*' },
      actions: [{ type: 'mockResponse', status: 200, headers: {}, body: '{}' }],
      createdAt: 300,
      updatedAt: 300,
    };
    const updatedLegacy = { ...legacyRule, disabled: true, updatedAt: 400 };
    const next = withLegacyRules({ ...state, rules: [...state.rules, userRule] }, [updatedLegacy]);

    expect(next.rules.find((rule) => rule.id === 'user-rule')).toEqual(userRule);
    expect(next.rules.find((rule) => rule.id === 'legacy-cors-7')).toMatchObject({
      enabled: false,
      updatedAt: 400,
    });
  });

  it('rejects malformed imported actions before they reach DNR or CDP', () => {
    const state = migrateLegacyState([], {}, 999);
    const invalid = {
      ...state,
      rules: [{
        id: 'unsafe-rule',
        name: 'Unsafe redirect',
        enabled: true,
        source: 'user',
        match: { initiatorOrigins: ['*'], urlPattern: '*' },
        actions: [{ type: 'redirect', url: 'javascript:alert(1)' }],
        createdAt: 1,
        updatedAt: 1,
      }],
    };

    expect(isProxyAppState(invalid)).toBe(false);
  });
});
