import { ListTodo } from 'lucide-react';
import * as React from 'react';

import { BacklogLauncher, TAB_KIND } from './client/components/BacklogLauncher';
import { BacklogPanel } from './client/components/BacklogPanel';
import { ensureTailwindStyles, removeTailwindStyles } from './client/lib/styles';

const NS = 'dshBacklogMd';
const TAB_ID = 'dsh-plugin-backlog-md';
const KIND = TAB_KIND;
const h = React.createElement;

const EN = {
  title: 'Backlog',
  showPanel: 'Toggle Backlog panel',
};

const ZH = {
  title: 'Backlog.md',
  showPanel: '切换 Backlog 面板',
};

function translate(ctx: { locale: { bind: (ns: string) => (key: string) => string } }) {
  const bound = ctx.locale.bind(NS);
  return (key: string) => {
    try {
      const value = bound(key);
      if (typeof value === 'string' && value !== key) return value;
    } catch {
      // Fall back to the English copy.
    }
    return (EN as Record<string, string>)[key] ?? key;
  };
}

function TitleIcon() {
  return h(ListTodo, {
    size: 15,
    strokeWidth: 1.5,
    'aria-hidden': true,
    focusable: false,
  });
}

export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight'];

export function apply(ctx: any) {
  ctx.effect(() => {
    ensureTailwindStyles();
    return () => removeTailwindStyles();
  }, 'backlog-md: scoped styles');

  const t = translate(ctx);
  ctx.effect(() => ctx.locale.register(NS, 'en', EN), 'backlog-md: en locale');
  ctx.effect(() => ctx.locale.register(NS, 'zh', ZH), 'backlog-md: zh locale');

  const Dock = (props: {
    useTabInfo: () => { tab?: { visible?: boolean } } | null;
    [key: string]: unknown;
  }) => {
    const tabInfo = props.useTabInfo();
    return h(BacklogPanel, {
      ...props,
      tabVisible: tabInfo?.tab?.visible ?? true,
    });
  };
  const Title = () =>
    h('span', { className: 'dshbm-tabTitle' }, h(TitleIcon), h('span', null, t('title')));
  const Trigger = (props: {
    sessionId?: string;
    inputActions?: { setDraft?: (text: string) => void };
  }) =>
    h(BacklogLauncher, {
      sidebarRight: ctx.sidebarRight,
      sessionId: props.sessionId,
      inputActions: props.inputActions,
    });

  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: TAB_ID,
        kind: KIND,
        keepMounted: true,
        title: () => t('title'),
      }),
    'backlog-md: sidebar tab type',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab', () =>
        ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, Dock),
      ),
    'backlog-md: sidebar tab body',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.right.pane.tab.title', () =>
        ctx.slots.register(
          { name: 'sidebar.right.pane.tab.title', key: TAB_ID, locale: NS },
          Title,
        ),
      ),
    'backlog-md: sidebar tab title',
  );

  ctx.effect(
    () =>
      ctx.slots.inject('conversation.input.right', () =>
        ctx.slots.register(
          {
            name: 'conversation.input.right',
            id: 'backlog-md-trigger',
            order: 11,
            label: () => t('title'),
          },
          Trigger,
        ),
      ),
    'backlog-md: composer trigger',
  );
}
