import type { IRuleItem } from '@/types';
import { genRuleId } from './storage';
import { logger } from './logger';

export type ICreateRuleOptions = Omit<IRuleItem, 'id' | 'updatedAt' | 'domain' | 'createdAt' | 'comment'> & {
  comment?: string;
  createdAt?: number;
};

export function createRule(options: ICreateRuleOptions): IRuleItem {
  try {
    if (!options.origin) {
      throw new Error('Origin is required');
    }
    
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
    if (error instanceof Error) {
      throw new Error(`Invalid rule options: ${error.message}`);
    }
    throw new Error('Invalid rule options: unable to parse origin URL');
  }
}
