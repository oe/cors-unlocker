import type { IRuleItem } from '@/types';

export function isSupportedProtocol(protocol: string) {
  return /^https?:$/i.test(protocol);
}

export function isSameRule(a: IRuleItem, b: Partial<IRuleItem>) {
  return a.id === b.id;
}
