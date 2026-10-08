import { t } from '@/common/i18n';
import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, Trash2 } from 'lucide-react';
import { RuleEditorForm, type RuleEditorParts } from '@/components/rule-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function EditorShell({ parts, onCopy, onDelete }: {
  parts: RuleEditorParts; onCopy?: () => void; onDelete?: () => void;
}) {
  const [section, setSection] = useState('match');
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
  return <section aria-label={t("Rule editor")} className="flex h-full min-h-0 min-w-0 flex-col">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 max-sm:basis-full">
        <Button size="icon-sm" variant="ghost" aria-label={t("Back to rules")} onClick={parts.close}><ArrowLeft /></Button>
        <h2 className="truncate text-base font-semibold" title={parts.name}>{parts.name || t("Untitled rule")}</h2>
        {parts.dirty ? <Badge variant="outline">{t("Unsaved")}</Badge> : null}
      </div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Switch aria-label={t("Rule enabled")} checked={parts.enabled} disabled={parts.pending} onCheckedChange={parts.setEnabled} />
        <span className="text-xs text-muted-foreground">{parts.enabled ? t("Enabled") : t("Disabled")}</span>
        {onCopy ? <Button variant="ghost" size="icon-sm" aria-label={t("Duplicate rule")} disabled={parts.pending} onClick={onCopy}><Copy /></Button> : null}
        {onDelete ? <Button variant="ghost" size="icon-sm" aria-label={t("Delete selected rule")} disabled={parts.pending} onClick={onDelete}><Trash2 /></Button> : null}
        <Button size="sm" disabled={parts.pending} onClick={parts.save} title={t("Save rule (⌘/Ctrl+S)")}>{parts.pending ? t("Saving…") : t("Save rule")}</Button>
      </div>
    </header>
    <Tabs value={section} onValueChange={setSection} className="min-h-0 flex-1 gap-0">
      <div className="shrink-0 border-b px-4 py-2 lg:px-6"><TabsList variant="line" aria-label={t("Rule sections")} className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto [&_[role=tab]]:min-h-8 [&_[role=tab]]:flex-none">
        <TabsTrigger value="match">{t("Match")}</TabsTrigger><TabsTrigger value="actions">{t("Actions")}</TabsTrigger><TabsTrigger value="test">{t("Test matching")}</TabsTrigger>
      </TabsList></div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl p-4 lg:p-6">
          {parts.errorMessage}
          <TabsContent value="match">{parts.matchFields}</TabsContent>
          <TabsContent value="actions">{parts.actionFields}</TabsContent>
          <TabsContent value="test">{parts.testFields}</TabsContent>
        </div>
      </div>
    </Tabs>
    <footer className="shrink-0 border-t px-4 py-2 text-xs text-muted-foreground lg:px-6">
      {parts.requiresAdvanced ? t("Requires a connected tab in Site controls. Enabled does not mean attached.") : t("Basic actions use browser rules. Verify actual effects in Site controls.")}
    </footer>
  </section>;
}

export function WorkspaceRuleEditor({ onCopy, onDelete, ...props }: Omit<React.ComponentProps<typeof RuleEditorForm>, 'renderWorkspace'> & {
  onCopy?: () => void; onDelete?: () => void;
}) {
  return <RuleEditorForm {...props} renderWorkspace={(parts) => <EditorShell parts={parts} onCopy={onCopy} onDelete={onDelete} />} />;
}
