import { t } from '@/common/i18n';
import type { IProxyProfile, IProxyRule } from '@/common/proxy-state';
import { Switch } from '@/components/ui/switch';

/** Only groups relevant to this page; a switch changes saved rules, never starts a session. */
export function RuleGroupControls({ profiles, rules, busy, toggle }: {
  profiles: IProxyProfile[]; rules: IProxyRule[]; busy: boolean;
  toggle: (profile: IProxyProfile, enabled: boolean) => void;
}) {
  const groups = profiles.filter((profile) => rules.some((rule) => profile.ruleIds.includes(rule.id)));
  if (!groups.length) return null;
  return <section aria-label={t('Rule groups')} className="space-y-2 border-t pt-2">
    <h2 className="text-xs font-semibold">{t('Rule groups')}</h2>
    {groups.map((profile) => <div key={profile.id} className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={profile.name}>{profile.name}</p>
        <p className="text-xs text-muted-foreground">{profile.enabled ? t('{count} rules on', { count: rules.filter((rule) => profile.ruleIds.includes(rule.id) && rule.enabled).length }) : t('Group paused')}</p>
      </div>
      <Switch aria-label={t('Enable group {name}', { name: profile.name })} checked={profile.enabled} disabled={busy} onCheckedChange={(enabled) => toggle(profile, enabled)} />
    </div>)}
    <p className="text-xs text-muted-foreground">{t('Affects saved rules across tabs. Does not start a tab session.')}</p>
  </section>;
}
