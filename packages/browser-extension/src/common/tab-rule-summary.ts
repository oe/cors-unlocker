import type { IProxyAppState } from './proxy-state';
import { ruleAppliesToOrigin } from './rule-explanation';
import { needsProxy } from './quick-controls';

export interface TabRuleSummary {
  pausedGroups: string[];
  pausedRules: number;
  sessionRules: number;
  enabledRules?: number;
}

/** Saved configuration for this origin, not evidence that a request was modified. */
export function summarizeTabRules(state: Pick<IProxyAppState, 'rules' | 'profiles'>, origin: string): TabRuleSummary {
  const rules = origin ? state.rules.filter((rule) => ruleAppliesToOrigin(rule, origin)) : [];
  const ids = new Set(rules.map((rule) => rule.id));
  const groups = state.profiles.filter((profile) => !profile.enabled && profile.ruleIds.some((id) => ids.has(id)));
  const paused = new Set(groups.flatMap((profile) => profile.ruleIds));
  return {
    enabledRules: rules.filter((rule) => rule.enabled && !paused.has(rule.id)).length,
    pausedGroups: groups.map((profile) => profile.name),
    pausedRules: rules.filter((rule) => rule.enabled && paused.has(rule.id)).length,
    sessionRules: rules.filter((rule) => rule.enabled && !paused.has(rule.id) && needsProxy(rule)).length,
  };
}
