import type { IProxyRule } from './proxy-state';
import { normalizeResourceType } from './request-match';

export function ruleAppliesToOrigin(rule: IProxyRule, origin: string): boolean {
  return rule.match.initiatorOrigins.some((value) => value === '*' || value === origin);
}

/** A check against current configuration, never evidence that an action executed. */
export function explainRuleMatch(rule: IProxyRule, origin: string, request: { url: string; method: string; resourceType: string }, firefox = false): string[] {
  const reasons: string[] = [];
  if (!rule.enabled) reasons.push('Rule is disabled');
  if (!ruleAppliesToOrigin(rule, origin)) reasons.push('Page origin does not match');
  const pattern = rule.match.urlPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  if (!new RegExp(`^${pattern}$`, 'i').test(request.url)) reasons.push('Request URL does not match');
  if (rule.match.methods?.length && !rule.match.methods.includes(request.method.toUpperCase())) reasons.push('HTTP method does not match');
  const normalize = (value: string) => {
    const type = normalizeResourceType(value);
    return firefox && type === 'Fetch' ? 'XHR' : type;
  };
  if (rule.match.resourceTypes?.length && !rule.match.resourceTypes.some((type) => normalize(type) === normalize(request.resourceType))) reasons.push('Resource type does not match');
  return reasons;
}
