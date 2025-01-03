import { useState, useEffect, useCallback } from 'react';
import type { IRuleItem, } from '@/types';
import { dataStorage } from '@/common/storage';

export function getOrigin(url: string) {
  try {
    const origin = new URL(url).origin;
    if (!/^https?:\/\//i.test(origin)) {
      throw new Error('only support http / https protocol');
    }
    return origin;
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      throw new Error('invalid url');
    }
    throw error;
  }
}

export function useViewModel() {
  const [rules, setRules] = useState<IRuleItem[]>([]);

  useEffect(() => {
    dataStorage.getRules().then(r => {
      if (!r) return;
      setRules(r);
    });
    dataStorage.onRulesChange((newRules) => {
      setRules(newRules || []);
    })
  }, []);

  /**
   * validate rule url, return origin if valid, or an error will be thrown
   * @param url rule url
   * @param id rule id, if provided and the existing rule id is the same, it will be ignored
   */
  const validateRule = useCallback((url: string, id?: number) => {
    const origin = getOrigin(url);
    if (!origin) {
      throw new Error('invalid url');
    }
    const rule = rules.find((rule) => rule.origin === origin);
    if (rule && rule.id !== id) {
      throw new Error(`origin "${origin}" already exists`);
    }
    return origin;
  }, [rules]);
  
  const addRule = async (v: {origin: string, comment: string}) => {
    const origin = validateRule(v.origin);
    const isSuccess = dataStorage.addRule({
      origin,
      comment: v.comment,
    })
    if (!isSuccess) {
      throw new Error('unable to create rule');
    }
  };

  const removeRule = (ruleId: number) => {
    dataStorage.removeRule(ruleId)
  };

  const toggleRule = async (rule: IRuleItem) => {
    dataStorage.updateRule({
      ...rule,
      disabled: !rule.disabled,
    })
  };

  const updateRule = async (rule: Partial<IRuleItem>) => {
    dataStorage.updateRule(rule);
  };

  return { rules, addRule, removeRule, updateRule, validateRule, toggleRule };
}

