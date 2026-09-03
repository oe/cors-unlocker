import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, ArrowUpRight, Network, Settings } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useViewModel } from './view-model';
import '@/common/tailwind.css';
import './style.scss';

function App() {
  const {
    rule,
    ruleEnabled,
    toggleRule,
    isSupported,
    error,
    errorType,
    advancedProxy,
    advancedProxyPending,
    toggleAdvancedProxy,
    openInspector,
    gotoOptionsPage,
    gotoEditRule,
    clearError,
  } = useViewModel();
  const advancedEnabled = advancedProxy?.phase === 'connected';

  return (
    <main className="flex min-h-full flex-col gap-3 bg-background p-3 text-foreground">
      <header className="flex items-center justify-between px-1 py-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Network aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold">Forth Intercept</h1>
              <Badge variant="secondary">v2.0</Badge>
            </div>
            <p className="truncate text-xs text-muted-foreground">Local request controls</p>
          </div>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Open settings" onClick={gotoOptionsPage}>
          <Settings />
        </Button>
      </header>

      {error ? (
        <Alert variant={errorType === 'fatal' ? 'destructive' : 'default'}>
          <AlertCircle />
          <AlertTitle>{errorType === 'fatal' ? 'This tab is unavailable' : 'Action failed'}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          {errorType !== 'fatal' ? (
            <Button size="xs" variant="ghost" onClick={clearError}>Dismiss</Button>
          ) : null}
        </Alert>
      ) : null}

      <Card size="sm" aria-disabled={!isSupported}>
        <CardHeader>
          <CardTitle>CORS compatibility</CardTitle>
          <CardDescription>Fast header rules without a debugging banner.</CardDescription>
          <CardAction>
            <Switch
              aria-label="Enable CORS compatibility for this site"
              checked={ruleEnabled}
              disabled={!isSupported}
              onCheckedChange={(checked) => toggleRule({ disabled: !checked })}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Separator />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Send credentials</p>
              <p className="text-xs text-muted-foreground">Cookies and authorization headers</p>
            </div>
            <Switch
              aria-label="Allow credentials"
              size="sm"
              checked={!!rule?.credentials}
              disabled={!isSupported || !ruleEnabled}
              onCheckedChange={(credentials) => toggleRule({ credentials })}
            />
          </div>
        </CardContent>
      </Card>

      <Card size="sm" aria-disabled={!isSupported}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Advanced proxy</CardTitle>
            {advancedEnabled ? <Badge>Connected</Badge> : null}
          </div>
          <CardDescription>Repairs failed preflights and response headers on this tab.</CardDescription>
          <CardAction>
            <Switch
              aria-label="Enable advanced proxy for this tab"
              checked={advancedEnabled}
              disabled={!isSupported || advancedProxyPending}
              onCheckedChange={toggleAdvancedProxy}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Chrome shows a debugging banner while this mode is connected.
          </p>
        </CardContent>
      </Card>

      <footer className="flex items-center justify-between gap-2 px-1">
        <Button size="sm" variant="outline" onClick={openInspector}>Inspect traffic</Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!rule?.id}
          onClick={() => rule?.id && gotoEditRule(rule.id)}
        >
          Manage rules
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
