import { describe, expect, it } from 'vitest';
import { parseImport, previewImport } from '../../src/common/import-preview';
import { migrateLegacyState } from '../../src/common/proxy-state';

const legacy = (id: number) => ({ id, origin: `https://site${id}.example`, domain: 'example', createdAt: 1, updatedAt: 1 });
describe('import preview', () => {
  it('converts v1 without mutating the backup', () => {
    const input = { rules: [legacy(1)] };
    const state = parseImport(JSON.stringify(input));
    expect(state.rules[0].id).toBe('legacy-cors-1');
    expect(state.schemaVersion).toBe(2);
    expect(input.rules[0]).toEqual(legacy(1));
  });
  it('counts overwrite, merge and removal by rule ID', () => {
    const current = migrateLegacyState([legacy(1), legacy(2)], {});
    const incoming = migrateLegacyState([legacy(2), legacy(3)], {});
    expect(previewImport(current, incoming, true)).toEqual({ added: 1, replaced: 1, removed: 0, total: 3 });
    expect(previewImport(current, incoming, false)).toEqual({ added: 1, replaced: 1, removed: 1, total: 2 });
    expect(current.rules).toHaveLength(2);
  });
  it('rejects malformed data and duplicate IDs', () => {
    for (const value of [null, { rules: [null] }, { rules: [{}] }, { rules: [legacy(1), legacy(1)] }, { version: '2.0', state: {} }]) {
      expect(() => parseImport(JSON.stringify(value))).toThrow();
    }
  });
});
