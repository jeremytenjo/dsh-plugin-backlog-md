import * as React from 'react';

import { sameSession } from '../lib/utils';
import { SEND_TO_CHAT_EVENT, type SendToChatDetail } from './BacklogPanel';
import { BacklogMark } from './badges';

export const TAB_KIND = 'backlog-md';

interface SidebarRightLike {
  isExpanded: () => boolean;
  active: () => { kind?: string } | undefined;
  toggleExpanded: () => void;
  openTab: (kind: string) => void;
}

export function BacklogLauncher({
  sidebarRight,
  sessionId,
  inputActions,
}: {
  sidebarRight: SidebarRightLike;
  sessionId?: string;
  inputActions?: { setDraft?: (text: string) => void } | null;
}) {
  const [active, setActive] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    const check = () => {
      if (!alive) return;
      try {
        setActive(sidebarRight.isExpanded() && sidebarRight.active()?.kind === TAB_KIND);
      } catch {
        setActive(false);
      }
    };
    check();
    const timer = window.setInterval(check, 350);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [sidebarRight]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SendToChatDetail>).detail;
      if (!detail || !sameSession(detail.sessionId, sessionId)) return;
      if (inputActions && typeof inputActions.setDraft === 'function') {
        inputActions.setDraft(detail.text);
      }
    };
    window.addEventListener(SEND_TO_CHAT_EVENT, handler);
    return () => window.removeEventListener(SEND_TO_CHAT_EVENT, handler);
  }, [inputActions, sessionId]);

  const toggle = () => {
    try {
      if (sidebarRight.isExpanded() && sidebarRight.active()?.kind === TAB_KIND) {
        sidebarRight.toggleExpanded();
        return;
      }
      sidebarRight.openTab(TAB_KIND);
    } catch (error) {
      console.error('backlog-md: could not toggle the right sidebar', error);
    }
  };

  return (
    <button
      type="button"
      className="dshbm-trigger"
      onClick={toggle}
      aria-label="Backlog"
      aria-pressed={active}
      title="Backlog"
      data-active={active ? 'true' : 'false'}
    >
      <BacklogMark size={15} />
    </button>
  );
}
