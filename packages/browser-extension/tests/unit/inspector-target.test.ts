import { describe, expect, it } from 'vitest';
import { inspectorPathForTab, parseInspectorTabId } from '../../src/common/inspector-target';

describe('inspector tab targeting', () => {
  it('does not turn a missing tab ID into tab zero', () => {
    expect(parseInspectorTabId('')).toBeNull();
    expect(parseInspectorTabId('?tabId=')).toBeNull();
  });

  it('accepts only non-negative integer tab IDs', () => {
    expect(parseInspectorTabId('?tabId=42')).toBe(42);
    expect(parseInspectorTabId('?tabId=-1')).toBeNull();
    expect(parseInspectorTabId('?tabId=2.5')).toBeNull();
    expect(parseInspectorTabId('?tabId=not-a-tab')).toBeNull();
  });

  it('round-trips the tab-specific side panel path', () => {
    const path = inspectorPathForTab(91);
    expect(path).toBe('src/sidepanel/index.html?tabId=91');
    expect(parseInspectorTabId(new URL(path, 'https://extension.invalid/').search)).toBe(91);
  });
});
