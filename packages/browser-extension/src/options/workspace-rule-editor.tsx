import { t } from '@/common/i18n';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu } from '@base-ui/react/menu';
import { ArrowLeft, ChevronRight, Copy, Trash2, MoreHorizontal } from 'lucide-react';
import { RuleEditorForm, type RuleEditorParts } from '@/components/rule-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WorkspaceHeader } from './workspace-header';

function EditorShell({ parts, onCopy, onDelete, headerTarget }: {
  parts: RuleEditorParts; onCopy?: () => void; onDelete?: () => void; headerTarget?: HTMLElement | null;
}) {
  const [section, setSection] = useState('match');
  useEffect(() => {
    if (parts.actionJsonReveal) setSection('actions');
  }, [parts.actionJsonReveal]);
  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!parts.pending && !document.querySelector('[role="dialog"]')) parts.save();
      }
    };
    window.addEventListener('keydown', save);
    return () => window.removeEventListener('keydown', save);
  }, [parts]);
  const header = <>
      <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full">
        <Button size="icon-sm" variant="ghost" aria-label={t("Back to rules")} title={t("Back to rules")} onClick={parts.close}><ArrowLeft /></Button>
        <span className="shrink-0 text-sm text-muted-foreground">{t('Rules')}</span><ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 truncate text-sm font-semibold" title={parts.name}>{parts.name || t("Untitled rule")}</h2>
      </div>
      {parts.groupPaused || parts.dirty ? <div className="flex flex-wrap items-center gap-1">
        {parts.groupPaused ? <Badge variant="outline">{t('Group paused')}</Badge> : null}
        {parts.dirty ? <Badge variant="outline">{t("Unsaved")}</Badge> : null}
      </div> : null}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Switch aria-label={t("Rule enabled")} checked={parts.enabled} disabled={parts.pending} onCheckedChange={parts.setEnabled} />
        <span className="text-xs text-muted-foreground">{parts.enabled ? t("Enabled") : t("Disabled")}</span>
        {onCopy || onDelete ? <Menu.Root>
          <Menu.Trigger render={<Button variant="ghost" size="icon-sm" aria-label={t('More actions')} title={t('More actions')} disabled={parts.pending} />}><MoreHorizontal /></Menu.Trigger>
          <Menu.Portal><Menu.Positioner sideOffset={6} align="end" className="z-50">
            <Menu.Popup className="min-w-44 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md outline-none">
              {onCopy ? <Menu.Item disabled={parts.pending} className="flex cursor-default items-center gap-2 rounded px-3 py-2 outline-none data-disabled:opacity-50 data-highlighted:bg-accent" onClick={onCopy}><Copy className="size-4" />{t('Duplicate rule')}</Menu.Item> : null}
              {onDelete ? <Menu.Item disabled={parts.pending} className="flex cursor-default items-center gap-2 rounded px-3 py-2 text-destructive outline-none data-disabled:opacity-50 data-highlighted:bg-accent" onClick={onDelete}><Trash2 className="size-4" />{t('Delete selected rule')}</Menu.Item> : null}
            </Menu.Popup>
          </Menu.Positioner></Menu.Portal>
        </Menu.Root> : null}
        <Button size="sm" disabled={parts.pending} onClick={parts.save} title={t("Save rule (⌘/Ctrl+S)")}>{parts.pending ? t("Saving…") : t("Save rule")}</Button>
      </div>
    </>;
  return <section aria-label={t("Rule editor")} className="flex h-full min-h-0 min-w-0 flex-col">
    {headerTarget ? createPortal(header, headerTarget) : <WorkspaceHeader><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{header}</div></WorkspaceHeader>}
    <Tabs value={section} onValueChange={setSection} className="min-h-0 flex-1 gap-0">
      <div className="shrink-0 border-b px-3 py-1 lg:px-4"><TabsList variant="line" aria-label={t("Rule sections")} className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto [&_[role=tab]]:min-h-8 [&_[role=tab]]:flex-none">
        <TabsTrigger value="match">{t("Match")}</TabsTrigger><TabsTrigger value="actions">{t("Actions")}</TabsTrigger><TabsTrigger value="test">{t("Test matching")}</TabsTrigger>
      </TabsList></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl p-3 lg:p-4">
          {parts.errorMessage}
          <TabsContent value="match">{parts.matchFields}</TabsContent>
          <TabsContent value="actions">{parts.actionFields}</TabsContent>
          <TabsContent value="test">{parts.testFields}</TabsContent>
        </div>
      </div>
    </Tabs>
    <footer className="shrink-0 border-t px-3 py-2 text-xs text-muted-foreground lg:px-4">
      {parts.groupPaused ? t('Group paused. This rule will not apply until the group is enabled.') : parts.requiresAdvanced ? t("Requires a connected tab in Site controls. Enabled does not mean attached.") : t("Basic actions use browser rules. Verify actual effects in Site controls.")}
    </footer>
  </section>;
}

export function WorkspaceRuleEditor({ onCopy, onDelete, headerTarget, ...props }: Omit<React.ComponentProps<typeof RuleEditorForm>, 'renderWorkspace'> & {
  onCopy?: () => void; onDelete?: () => void; headerTarget?: HTMLElement | null;
}) {
  return <RuleEditorForm {...props} renderWorkspace={(parts) => <EditorShell parts={parts} onCopy={onCopy} onDelete={onDelete} headerTarget={headerTarget} />} />;
}
