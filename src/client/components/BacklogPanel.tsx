import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListTodo, RefreshCw } from 'lucide-react';
import * as React from 'react';
import { useBacklogStatus, useRestartBacklogServer } from '../hooks/useBacklog';
import { sendToChatPrompt } from '../lib/utils';
import type { BacklogStatus, BacklogTask } from '../types';
import { BacklogSetup } from './BacklogSetup';
import { BacklogWorkspace } from './BacklogWorkspace';
import { InlineSpinner } from './badges';
import { Button } from './ui/button';
import { TooltipProvider } from './ui/tooltip';

export const SEND_TO_CHAT_EVENT = 'dsh-backlog-md:send-to-chat';

export interface BacklogPanelProps {
  sessionId?: string;
  inputActions?: { setDraft?: (text: string) => void } | null;
  tabVisible?: boolean;
}

export interface SendToChatDetail {
  sessionId?: string;
  text: string;
}

function sendToComposer(
  sessionId: string | undefined,
  text: string,
  inputActions: BacklogPanelProps['inputActions'],
): boolean {
  if (inputActions && typeof inputActions.setDraft === 'function') {
    inputActions.setDraft(text);
    return true;
  }
  window.dispatchEvent(
    new CustomEvent<SendToChatDetail>(SEND_TO_CHAT_EVENT, {
      detail: { sessionId, text },
    }),
  );
  return true;
}

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dshbm-ui dshbm-panel" data-backlog-panel="">
      {children}
    </div>
  );
}

export function BacklogPanel(props: BacklogPanelProps) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <BacklogPanelBody {...props} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function BacklogPanelBody({ sessionId, inputActions, tabVisible = true }: BacklogPanelProps) {
  const statusQuery = useBacklogStatus(sessionId ?? '', Boolean(sessionId));
  const restart = useRestartBacklogServer(sessionId ?? '');
  const [restarting, setRestarting] = React.useState(false);

  const sendToChat = React.useCallback(
    (task: BacklogTask) => sendToComposer(sessionId, sendToChatPrompt(task), inputActions),
    [inputActions, sessionId],
  );

  const retry = React.useCallback(() => {
    void statusQuery.refetch();
  }, [statusQuery]);

  const restartServer = React.useCallback(async () => {
    setRestarting(true);
    try {
      await restart.mutateAsync();
    } catch {
      // The refreshed status carries the actionable error.
    } finally {
      await statusQuery.refetch();
      setRestarting(false);
    }
  }, [restart, statusQuery]);

  if (!sessionId) {
    return (
      <PanelShell>
        <div className="dshbm-flex dshbm-flex-1 dshbm-flex-col dshbm-items-center dshbm-justify-center dshbm-gap-2 dshbm-p-6 dshbm-text-center">
          <ListTodo size={22} className="dshbm-text-muted-foreground" />
          <p className="dshbm-m-0 dshbm-text-xs dshbm-text-muted-foreground">
            Open a Harness session to use Backlog.md.
          </p>
        </div>
      </PanelShell>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <PanelShell>
        <PanelLoading />
      </PanelShell>
    );
  }

  if (statusQuery.error) {
    return (
      <PanelShell>
        <div className="dshbm-flex dshbm-flex-1 dshbm-flex-col dshbm-items-center dshbm-justify-center dshbm-gap-2 dshbm-p-6 dshbm-text-center">
          <p className="dshbm-m-0 dshbm-text-xs dshbm-text-muted-foreground">
            {statusQuery.error instanceof Error
              ? statusQuery.error.message
              : 'Could not connect to Backlog.md.'}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            <RefreshCw size={12} />
            Retry
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void restartServer()}>
            <RefreshCw size={12} />
            Restart server
          </Button>
        </div>
      </PanelShell>
    );
  }

  const status = statusQuery.data as BacklogStatus | undefined;
  if (!status) {
    return (
      <PanelShell>
        <PanelLoading />
      </PanelShell>
    );
  }

  if (status.state !== 'ready') {
    return (
      <PanelShell>
        <BacklogSetup
          status={status}
          onRetry={retry}
          onRestart={() => void restartServer()}
          retrying={statusQuery.isFetching || restarting}
        />
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <BacklogWorkspace
        key={status.workspace.key}
        status={status}
        sessionId={sessionId}
        sendToChat={sendToChat}
        tabVisible={tabVisible}
      />
    </PanelShell>
  );
}

function PanelLoading() {
  return (
    <div className="dshbm-flex dshbm-min-h-0 dshbm-flex-1 dshbm-flex-col">
      <div className="dshbm-flex dshbm-items-center dshbm-gap-2 dshbm-border-b dshbm-border-border dshbm-px-3 dshbm-py-2">
        <ListTodo size={15} className="dshbm-text-brand-primary" />
        <span className="dshbm-text-xs dshbm-font-semibold">Backlog</span>
        <InlineSpinner />
        <span className="dshbm-text-2xs dshbm-text-muted-foreground">
          Starting the Backlog.md server…
        </span>
      </div>
      <div className="dshbm-flex dshbm-flex-col dshbm-gap-1 dshbm-p-3">
        {Array.from({ length: 10 }).map((_, index) => (
          <span
            key={index}
            className="dshbm-skeleton"
            style={{ height: 30, opacity: 1 - index * 0.06 }}
          />
        ))}
      </div>
      <p className="dshbm-mt-auto dshbm-m-0 dshbm-px-3 dshbm-py-2 dshbm-text-2xs dshbm-text-muted-foreground">
        The Harness UI is not blocked while the local server starts.
      </p>
    </div>
  );
}
