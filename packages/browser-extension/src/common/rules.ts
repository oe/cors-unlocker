import type { IRuleItem } from '@/types';
import { genRuleId } from './storage';
import { logger } from './logger';

export type ICreateRuleOptions = Omit<IRuleItem, 'id' | 'updatedAt' | 'domain' | 'createdAt' | 'comment'> & {
  comment?: string;
  createdAt?: number;
};

export function createRule(options: ICreateRuleOptions): IRuleItem | void {
  try {
    const domain = new URL(options.origin).hostname;
    const createdAt = options.createdAt || Date.now();
    return {
      ...options,
      id: genRuleId(),
      createdAt,
      domain,
      updatedAt: createdAt
    };
  } catch (error) {
    logger.error('unable to create rule', error);
  }
}
