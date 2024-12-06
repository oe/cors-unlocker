import type { IRuleItem } from '@/types';

export type ICreateRuleOptions = Omit<IRuleItem, 'updatedAt' | 'domain' | 'createdAt' | 'comment'> & {
  comment?: string;
  createdAt?: number;
};

export function createRule(options: ICreateRuleOptions): IRuleItem | void {
  try {
    const domain = new URL(options.origin).hostname;
    const createdAt = options.createdAt || Date.now();
    return {
      ...options,
      createdAt,
      domain,
      updatedAt: createdAt
    };
  } catch (error) {
    console.error('unable to create rule', error);
  }
}
