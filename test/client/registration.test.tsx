import { describe, expect, it, vi } from 'vitest';

import { apply, inject } from '../../src/client';

describe('Harness client registration', () => {
  it('declares the native sidebar and composer seams', () => {
    expect(inject).toEqual(['slots', 'locale', 'sidebarRightTabs', 'sidebarRight']);
  });

  it('registers the Backlog tab type, panel body, title, and launcher', () => {
    const tabDefinitions: any[] = [];
    const registrations: Array<{ spec: any; component: any }> = [];
    const injections: string[] = [];
    const localeRegistrations: any[] = [];
    const ctx = {
      effect: (fn: () => unknown) => {
        fn();
        return () => {};
      },
      locale: {
        register: (...args: any[]) => localeRegistrations.push(args),
        bind: () => (key: string) => key,
      },
      slots: {
        inject: (name: string, cb: () => void) => {
          injections.push(name);
          cb();
          return () => {};
        },
        register: (spec: any, component: any) => {
          registrations.push({ spec, component });
          return () => {};
        },
      },
      sidebarRightTabs: {
        register: (definition: any) => {
          tabDefinitions.push(definition);
          return () => {};
        },
      },
      sidebarRight: {
        isExpanded: () => false,
        active: () => undefined,
        toggleExpanded: vi.fn(),
        openTab: vi.fn(),
      },
    };

    apply(ctx as any);

    expect(tabDefinitions).toHaveLength(1);
    expect(tabDefinitions[0]).toMatchObject({
      id: 'dsh-plugin-backlog-md',
      kind: 'backlog-md',
      keepMounted: true,
    });
    expect(injections).toEqual(
      expect.arrayContaining([
        'sidebar.right.pane.tab',
        'sidebar.right.pane.tab.title',
        'conversation.input.right',
      ]),
    );
    const panel = registrations.find((entry) => entry.spec.name === 'sidebar.right.pane.tab');
    expect(panel?.spec.key).toBe('dsh-plugin-backlog-md');
    const title = registrations.find((entry) => entry.spec.name === 'sidebar.right.pane.tab.title');
    expect(title?.spec.key).toBe('dsh-plugin-backlog-md');
    const launcher = registrations.find((entry) => entry.spec.name === 'conversation.input.right');
    expect(launcher?.spec).toMatchObject({
      id: 'backlog-md-trigger',
      order: 11,
    });
    expect(localeRegistrations.map((entry) => entry[1])).toEqual(
      expect.arrayContaining(['en', 'zh']),
    );
  });
});
