import { t, formatDate } from '@/common/i18n';
import type { SiteAccess } from '@/common/sdk-access';
import { Switch } from '@/components/ui/switch';

export function SiteTrustControls({ origin, access, disabled, onTrustChange }: {
  origin: string; access: SiteAccess; disabled: boolean; onTrustChange: (trusted: boolean) => void;
}) {
  const trusted = access.origin === origin && access.trusted;
  return (<section className="rounded-lg border px-2.5 py-2" aria-label={t('Website control')}>
        <div className="control-row">
          <span className="text-sm font-medium">{t('Trust this site to control rules')}</span>
          <Switch aria-label={t('Trust this site to control rules')} checked={trusted} disabled={disabled} onCheckedChange={trusted => onTrustChange(trusted)} />
        </div>
        <p className="mt-1 break-all text-xs text-muted-foreground">{origin}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t(trusted ? 'Trusted: this site can manage its SDK rules without asking each time. Credential access still requires approval.' : 'Website changes require your approval. Trust is off by default.')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t('Trust persists until revoked. Revoking trust restores approval prompts and leaves saved rules unchanged.')}</p>
        {access.origin === origin && access.lastOperation ? <p className="mt-1 text-xs" role="status">{t('Last website operation')}: {t(access.lastOperation.label)} · {formatDate(access.lastOperation.at)}</p> : null}
      </section>);
}
