import { expect, it } from 'vitest';
import { legacyBridgeError } from '../../src/common/legacy-bridge-error';
it('preserves cancellation from Firefox native Error and Chrome polyfill rejections', () => {
  const error = { type: 'user-cancel', message: 'The user declined the request.' };
  for (const input of [new Error(JSON.stringify(error)), { __mozWebExtensionPolyfillReject__: true, message: JSON.stringify(error) }, JSON.stringify(error), error])
    expect(legacyBridgeError(input)).toEqual(error);
});
it('retains browser diagnostics without treating malformed JSON as typed SDK errors', () => {
  expect(legacyBridgeError(new Error('Connection closed'))).toEqual({ type: 'communication-error', message: 'Connection closed' });
  expect(legacyBridgeError('{"type":3,"message":"invalid"}').type).toBe('communication-error');
  expect(legacyBridgeError(null).type).toBe('communication-error');
});
