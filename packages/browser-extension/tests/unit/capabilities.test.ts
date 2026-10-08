import { describe, expect, it } from 'vitest';
import { capabilitiesFor } from '../../src/common/capabilities';

describe('browser capability contract', () => {
  it('advertises the complete Chrome interception path', () => {
    expect(capabilitiesFor('chrome').interception).toEqual({
      responseMock: 'synthetic',
      preflight: 'synthetic',
      networkFailure: 'reasoned',
      resourceTypes: 'distinct-fetch-xhr',
    });
  });

  it('advertises Firefox WebRequest limitations explicitly', () => {
    expect(capabilitiesFor('firefox').interception).toEqual({
      responseMock: 'body-replacement',
      preflight: 'headers-only',
      networkFailure: 'cancel',
      resourceTypes: 'combined-fetch-xhr',
    });
  });
});
