import { describe, expect, it } from 'vitest';
import { normalizeResourceType, toDnrResourceTypes } from '../../src/common/request-match';

describe('request match normalization', () => {
  it('normalizes Chrome and Firefox resource names into portable values', () => {
    expect(normalizeResourceType('main_frame')).toBe('Document');
    expect(normalizeResourceType('xmlhttprequest')).toBe('XHR');
    expect(normalizeResourceType('web_manifest')).toBe('Manifest');
    expect(normalizeResourceType('CSPViolationReport')).toBe('CSPReport');
  });

  it('maps portable values to supported DNR resource types without broadening to all traffic', () => {
    expect(toDnrResourceTypes(['Document'])).toEqual(['main_frame', 'sub_frame']);
    expect(toDnrResourceTypes(['XHR', 'Fetch'])).toEqual(['xmlhttprequest']);
    expect(toDnrResourceTypes(['CSPReport'])).toEqual(['csp_report']);
    expect(toDnrResourceTypes(['Preflight'])).toEqual([]);
  });
});
