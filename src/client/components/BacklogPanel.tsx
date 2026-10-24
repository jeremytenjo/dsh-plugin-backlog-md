import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import * as React from 'react';
import { useBacklogStatus, useRestartBacklogServer } from '../hooks/useBacklog';
import { sendToChatPrompt } from '../lib/utils';
import type { BacklogStatus, BacklogTask } from '../types';
import { BacklogSetup } from './BacklogSetup';
import { BacklogWorkspace } from './BacklogWorkspace';
import { BacklogMark, InlineSpinner } from './badges';
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
  const sendTasksToChat = React.useCallback(
    (tasks: BacklogTask[]) =>
      sendToComposer(sessionId, tasks.map(sendToChatPrompt).join('\n\n'), inputActions),
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
        <PanelMessage
          title="Open a session"
          description="Backlog.md works inside a Harness session. Open or create one, then return to this panel."
        />
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
        <PanelMessage
          title="Could not reach Backlog.md"
          description={
            statusQuery.error instanceof Error
              ? statusQuery.error.message
              : 'The Backlog.md server did not answer.'
          }
          action={
            <>
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                <RefreshCw size={12} />
                Retry
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => void restartServer()}>
                Restart server
              </Button>
            </>
          }
        />
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
        sendTasksToChat={sendTasksToChat}
        tabVisible={tabVisible}
      />
    </PanelShell>
  );
}

function PanelMessage({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="dshbm-flex dshbm-min-h-0 dshbm-flex-1 dshbm-flex-col">
      <header className="dshbm-header">
        <div className="dshbm-headerIdentity">
          <BacklogMark size={16} />
          <div className="dshbm-headerText">
            <h1 className="dshbm-title">Backlog</h1>
            <div className="dshbm-subtitle">Task management</div>
          </div>
        </div>
      </header>
      <div className="dshbm-emptyWrap">
        <div className="dshbm-empty">
          <div className="dshbm-emptyText">
            <p className="dshbm-emptyTitle">{title}</p>
            <p className="dshbm-emptyBody">{description}</p>
          </div>
          {action ? <div className="dshbm-emptyAction">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="dshbm-flex dshbm-min-h-0 dshbm-flex-1 dshbm-flex-col">
      <header className="dshbm-header">
        <div className="dshbm-headerIdentity">
          <BacklogMark size={16} />
          <div className="dshbm-headerText">
            <h1 className="dshbm-title">Backlog</h1>
            <div className="dshbm-subtitle">
              <InlineSpinner />
              <span>Starting the Backlog.md server</span>
            </div>
          </div>
        </div>
      </header>
      <div className="dshbm-flex dshbm-flex-col dshbm-px-3 dshbm-pt-2">
        {Array.from({ length: 10 }).map((_, index) => (
          <span key={index} className="dshbm-skeleton" style={{ height: 38, marginBottom: 1 }} />
        ))}
      </div>
    </div>
  );
}
