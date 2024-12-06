import type { IRuleItem, } from '@/types';
import { useState, useEffect, useRef } from 'react';
import { dataStorage } from '@/common/storage';
import { createRule } from '@/common/rules';

export function getOrigin(url: string) {
  try {
    const origin = new URL(url).origin;
    if (!/^https?:\/\//i.test(origin)) {
      throw new Error('only support http / https protocol');
    }
    return origin;
  } catch (error: any) {
    if (error instanceof TypeError) {
      throw new Error('invalid url');
    }
    throw error;
  }
}

export function useViewModel() {
  const [rules, setRules] = useState<IRuleItem[]>([]);
  const maxId = useRef(0)

  useEffect(() => {
    dataStorage.getRules().then(r => {
      if (!r) return;
      maxId.current = Math.max(...r.map(rule => rule.id));
      setRules(r);
    });
  }, []);

  /**
   * validate rule url, return origin if valid, or an error will be thrown
   * @param url rule url
   * @param id rule id, if provided and the existing rule id is the same, it will be ignored
   */
  const validateRule = (url: string, id?: number) => {
    const origin = getOrigin(url);
    if (!origin) {
      throw new Error('invalid url');
    }
    const rule = rules.find((rule) => rule.origin === origin);
    if (rule && rule.id !== id) {
      throw new Error(`origin "${origin}" already exists`);
    }
    return origin;
  };
  
  const addRule = async (v: {origin: string, comment: string}) => {
    const origin = validateRule(v.origin);
    const ruleId = ++maxId.current;
    const rule = createRule({ origin, comment: v.comment, id: ruleId });
    if (!rule) {
      throw new Error('unable to create rule');
    }

    setRules((prevRules) => {
      const updatedRules = [...prevRules, rule];
      dataStorage.saveRules(updatedRules);
      return updatedRules;
    })
  };

  const removeRule = async (ruleId: number) => {
    setRules((prevRules) => {
      const updatedRules = prevRules.filter(rule => rule.id !== ruleId);
      dataStorage.saveRules(updatedRules);
      return updatedRules;
    });
  };

  const toggleRule = async (rule: IRuleItem) => {
    setRules((prevRules) => {
      const updatedRules = prevRules.map((r) => {
        return r.id === rule.id ? Object.assign({}, r, { disabled: !r.disabled }) : r;
      });
      dataStorage.saveRules(updatedRules);
      return updatedRules;
    });
  };

  const updateRule = async (rule: Partial<IRuleItem>) => {
    setRules((prevRules) => {
      const updatedRules = prevRules.map((r) => {
        return r.id === rule.id ? Object.assign({}, r, rule) : r;
      });
      dataStorage.saveRules(updatedRules);
      return updatedRules;
    });
  };

  return { rules, addRule, removeRule, updateRule, validateRule, toggleRule };
}

