import { ArrowUpRight, Check, ClipboardCopy, RefreshCw, Server, Terminal } from 'lucide-react';
import * as React from 'react';

import type { BacklogSetupStatus } from '../types';
import { BacklogMark, InlineSpinner } from './badges';
import { Button } from './ui/button';

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="dshbm-flex dshbm-items-center dshbm-gap-2 dshbm-rounded-md dshbm-border dshbm-border-[var(--dsw-alias-border-l1)] dshbm-bg-[var(--dsw-alias-bg-module-platform)] dshbm-px-2.5 dshbm-py-2">
      <Terminal size={12} className="dshbm-flex-none dshbm-text-muted-foreground" />
      <code className="dshbm-min-w-0 dshbm-flex-1 dshbm-overflow-x-auto dshbm-whitespace-nowrap dshbm-font-mono dshbm-text-[11.5px] dshbm-text-foreground">
        {command}
      </code>
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        onClick={() => void copy()}
        title="Copy command"
        aria-label={`Copy ${command}`}
      >
        {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
      </Button>
    </div>
  );
}

export function BacklogSetup({
  status,
  onRetry,
  onRestart,
  retrying,
}: {
  status: BacklogSetupStatus;
  onRetry: () => void;
  onRestart: () => void;
  retrying: boolean;
}) {
  const canRestart =
    status.state === 'error' ||
    status.code === 'server-crashed' ||
    status.code === 'server-start-failed' ||
    status.code === 'server-unreachable';

  const title =
    status.state === 'not-installed'
      ? 'Backlog.md is not installed'
      : status.state === 'not-initialized'
        ? 'Initialize Backlog.md'
        : status.state === 'incompatible'
          ? 'Backlog.md needs an update'
          : 'Backlog.md is unavailable';

  const description =
    status.state === 'not-installed'
      ? `Add Backlog.md to ${status.workspace.name} or install it on your PATH. The plugin detects it automatically.`
      : status.state === 'not-initialized'
        ? 'This workspace has Backlog.md installed, but no project yet. Initialize it once, then retry.'
        : status.state === 'incompatible'
          ? `Detected Backlog.md ${status.detectedVersion ?? 'with an unsupported version'}. This plugin supports 1.x from ${status.compatibility.minimum}.`
          : (status.error ?? status.hint ?? 'The Backlog.md server could not be reached.');

  return (
    <div className="dshbm-flex dshbm-min-h-0 dshbm-flex-1 dshbm-flex-col">
      <header className="dshbm-header">
        <div className="dshbm-headerIdentity">
          <BacklogMark size={16} />
          <div className="dshbm-headerText">
            <h1 className="dshbm-title">Backlog</h1>
            <div className="dshbm-subtitle">
              <span className="dshbm-truncate" title={status.workspace.name}>
                {status.workspace.name}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="dshbm-scroll dshbm-flex-1">
        <div className="dshbm-flex dshbm-max-w-[640px] dshbm-flex-col dshbm-gap-3 dshbm-p-4">
          <div>
            <h2 className="dshbm-m-0 dshbm-text-[15px] dshbm-font-semibold dshbm-leading-6 dshbm-text-foreground">
              {title}
            </h2>
            <p className="dshbm-mt-1 dshbm-m-0 dshbm-text-[12.5px] dshbm-leading-relaxed dshbm-text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="dshbm-metaRow">
            <span className="dshbm-inline-flex dshbm-items-center dshbm-gap-1">
              <Server size={11} /> {status.workspace.name}
            </span>
            {status.backlogVersion ? <span>Backlog.md {status.backlogVersion}</span> : null}
            <span>Supported {status.compatibility.minimum}+</span>
            {status.detectedVersion ? <span>Detected {status.detectedVersion}</span> : null}
          </div>

          {status.state === 'not-installed' && status.installCommands ? (
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1.5">
              <span className="dshbm-text-[11.5px] dshbm-text-muted-foreground">Install</span>
              {status.installCommands.map((command) => (
                <CopyCommand key={command} command={command} />
              ))}
              <p className="dshbm-m-0 dshbm-text-[11.5px] dshbm-text-muted-foreground">
                A project-local install is preferred. Restart the Backlog panel after installing.
              </p>
            </div>
          ) : null}

          {status.state === 'not-initialized' && status.initCommands ? (
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1.5">
              <span className="dshbm-text-[11.5px] dshbm-text-muted-foreground">Initialize</span>
              {status.initCommands.map((command) => (
                <CopyCommand key={command} command={command} />
              ))}
              <p className="dshbm-m-0 dshbm-text-[11.5px] dshbm-text-muted-foreground">
                Run this in the workspace folder. Backlog.md keeps its Markdown files under{' '}
                <code className="dshbm-font-mono">backlog/</code>.
              </p>
            </div>
          ) : null}

          {status.state === 'incompatible' && status.installCommands ? (
            <div className="dshbm-flex dshbm-flex-col dshbm-gap-1.5">
              <span className="dshbm-text-[11.5px] dshbm-text-muted-foreground">Update</span>
              {status.installCommands.slice(0, 2).map((command) => (
                <CopyCommand key={command} command={command} />
              ))}
            </div>
          ) : null}

          {status.hint && status.state !== 'error' ? (
            <p className="dshbm-m-0 dshbm-text-[12px] dshbm-leading-relaxed dshbm-text-muted-foreground">
              {status.hint}
            </p>
          ) : null}

          <div className="dshbm-flex dshbm-flex-wrap dshbm-items-center dshbm-gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? <InlineSpinner /> : <RefreshCw size={12} />}
              Retry
            </Button>
            {canRestart ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRestart}
                disabled={retrying}
              >
                <Server size={12} />
                Restart server
              </Button>
            ) : null}
            <Button asChild variant="ghost" size="sm" className="dshbm-ml-auto">
              <a
                href="https://github.com/MrLesk/Backlog.md"
                target="_blank"
                rel="noreferrer noopener"
              >
                Backlog.md
                <ArrowUpRight size={11} />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
