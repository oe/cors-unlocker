import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { t, initializeLocale, useLocale } from '@/common/i18n';
import { initializeTheme } from '@/common/theme';
import { AppearanceSettings } from '@/components/appearance-settings';
import { BrandMark } from '@/components/brand-mark';
import { UpgradeNotice } from '@/components/upgrade-notice';
import { Button } from '@/components/ui/button';
import '@/common/tailwind.css';

function App() {
  useLocale();
  const openWorkspace = () => { void browser.runtime.openOptionsPage(); };
  return <main className="min-h-dvh bg-background px-4 py-6 text-foreground sm:px-6 sm:py-12">
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><BrandMark /><h1 className="text-xl font-semibold">Wireflip <span className="text-muted-foreground">2.0</span></h1></div>
        <div className="w-10 shrink-0"><AppearanceSettings /></div>
      </header>
      <UpgradeNotice expanded onViewRules={openWorkspace} onViewRecovery={openWorkspace} onAcknowledged={async () => {
        await browser.runtime.openOptionsPage();
        window.close();
      }} />
      <Button variant="outline" onClick={openWorkspace}>{t('Open workspace')}</Button>
    </div>
  </main>;
}

void Promise.all([initializeLocale(), initializeTheme()]).then(() => createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>));
