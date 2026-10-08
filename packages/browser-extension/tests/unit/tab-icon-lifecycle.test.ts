import { expect, it, vi } from 'vitest';
import type browser from 'webextension-polyfill';

const mocks = vi.hoisted(() => ({
  getRules: vi.fn(),
  setCurrentTabRule: vi.fn(),
  toggleRule: vi.fn(),
  setIcon: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({ default: { action: { setIcon: mocks.setIcon } } }));
vi.mock('@/common/storage', () => ({
  dataStorage: { getRules: mocks.getRules },
  setCurrentTabRule: mocks.setCurrentTabRule,
}));
vi.mock('../../src/background/declarative-rules', () => ({ toggleRule: mocks.toggleRule }));

import { onTabActiveChange } from '../../src/background/on-tab-change';

it('does not update a removed tab icon after an asynchronous rule lookup', async () => {
  let finishLookup!: (rules: never[]) => void;
  mocks.getRules.mockReturnValue(new Promise<never[]>((resolve) => { finishLookup = resolve; }));
  const pending = onTabActiveChange({ id: 123, windowId: 1, url: 'https://example.com/' } as browser.Tabs.Tab);
  // The tab closes while storage is pending. Any subsequent icon update would fail.
  mocks.setIcon.mockImplementation(() => { throw new Error('No tab with id: 123.'); });
  finishLookup([]);
  await expect(pending).resolves.toBeUndefined();
  expect(mocks.setIcon).not.toHaveBeenCalled();
  expect(mocks.setCurrentTabRule).toHaveBeenCalledWith(1, null);
});
