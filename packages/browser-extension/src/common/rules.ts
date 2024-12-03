import type { IRuleItem } from '@/types';

export function createRule(
  origin: string,
  ruleId: number,
  createdAt: number = Date.now()
): IRuleItem | void {
  try {
    const domain = new URL(origin).hostname;
    return {
      id: ruleId,
      createdAt,
      domain,
      origin,
      updatedAt: createdAt
    };
  } catch (error) {
    console.error('unable to create rule', error);
  }
}
