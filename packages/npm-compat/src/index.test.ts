import { describe, expect, it } from 'vitest';
import compat, { intercept } from './index';

describe('cors-unlocker compatibility package', () => {
  it('re-exports the canonical Forth Intercept SDK', () => {
    expect(compat).toBe(intercept);
    expect(typeof intercept.connect).toBe('function');
  });
});
