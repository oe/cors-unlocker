export const INSPECTOR_PATH = 'src/sidepanel/index.html';

export function inspectorPathForTab(tabId: number): string {
  return `${INSPECTOR_PATH}?tabId=${tabId}`;
}

export function parseInspectorTabId(search: string): number | null {
  const raw = new URLSearchParams(search).get('tabId');
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}
