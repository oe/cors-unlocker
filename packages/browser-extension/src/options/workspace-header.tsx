import type { ReactNode } from 'react';

/** Shared page context; editor controls can render here without copying form state. */
export function WorkspaceHeader({ children }: { children: ReactNode }) {
  return <header data-workspace-header className="flex min-h-11 shrink-0 items-center border-b bg-muted/20 px-3 py-1.5 lg:px-4">{children}</header>;
}
