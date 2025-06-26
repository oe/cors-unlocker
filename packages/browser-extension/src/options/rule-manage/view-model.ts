import { useState, useEffect, useCallback, useMemo } from 'react';
import type { IRuleItem, } from '@/types';
import { dataStorage } from '@/common/storage';
import { extConfig } from '@/common/ext-config';

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

export function useViewModel(editRuleId?: number | null) {
  const [rules, setRules] = useState<IRuleItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [maxRules, setMaxRules] = useState(100);
  
  const pageSize = 20; // 每页显示20条规则

  useEffect(() => {
    dataStorage.getRules().then(r => {
      if (!r) return;
      setRules(r);
    });
    dataStorage.onRulesChange((newRules) => {
      setRules(newRules || []);
    });

    // 获取最大规则数限制
    const config = extConfig.get();
    setMaxRules(config.maxRules);
  }, []);

  // 过滤规则
  const filteredRules = useMemo(() => {
    if (!searchTerm.trim()) return rules;
    
    const term = searchTerm.toLowerCase();
    return rules.filter(rule => 
      rule.origin.toLowerCase().includes(term)
    );
  }, [rules, searchTerm]);

  // 计算分页
  const totalPages = Math.ceil(filteredRules.length / pageSize);
  
  // 获取当前页的规则
  const paginatedRules = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredRules.slice(startIndex, endIndex);
  }, [filteredRules, currentPage, pageSize]);

  // 当搜索条件改变时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // 当总页数变化且当前页超出范围时，回到最后一页
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // 自动跳转到包含目标规则的页面
  useEffect(() => {
    if (editRuleId && rules.length > 0) {
      const ruleIndex = filteredRules.findIndex(rule => rule.id === editRuleId);
      if (ruleIndex !== -1) {
        const targetPage = Math.floor(ruleIndex / pageSize) + 1;
        if (targetPage !== currentPage) {
          setCurrentPage(targetPage);
        }
      }
    }
  }, [editRuleId, rules, filteredRules, currentPage, pageSize]);

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
  
  const addRule = async (v: {origin: string, extraHeaders?: string, credentials: boolean}) => {
    const origin = validateRule(v.origin);
    const config = extConfig.get();
    
    if (rules.length >= config.maxRules) {
      throw new Error(`Maximum limit of ${config.maxRules} rules reached`);
    }
    
    const isSuccess = await dataStorage.addRule({
      origin,
      extraHeaders: v.extraHeaders,
      credentials: v.credentials,
    });
    
    if (!isSuccess) {
      throw new Error('Unable to create rule');
    }
    
    return true;
  };

  const saveRule = async (v: {origin: string, extraHeaders?: string, id?: number, credentials: boolean}) => {
    if (v.id) {
      // Update existing rule
      const success = await dataStorage.updateRule({
        id: v.id,
        origin: v.origin,
        extraHeaders: v.extraHeaders,
        credentials: v.credentials,
      });
      if (!success) {
        throw new Error('Unable to update rule');
      }
    } else {
      // Add new rule
      await addRule(v);
    }
    return true;
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
    const success = await dataStorage.updateRule(rule);
    if (!success) {
      throw new Error('Unable to update rule');
    }
    return true;
  };

  return { 
    rules, 
    addRule, 
    saveRule,
    removeRule, 
    updateRule, 
    validateRule, 
    toggleRule,
    // 搜索和分页相关
    filteredRules,
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    totalPages,
    pageSize,
    maxRules,
    paginatedRules
  };
}

