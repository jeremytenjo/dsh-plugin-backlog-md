import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { BacklogLauncher, TAB_KIND } from '../../src/client/components/BacklogLauncher';
import { SEND_TO_CHAT_EVENT } from '../../src/client/components/BacklogPanel';

function sidebar(
  overrides: Partial<{
    isExpanded: () => boolean;
    active: () => { kind?: string } | undefined;
    toggleExpanded: () => void;
    openTab: (kind: string) => void;
  }> = {},
) {
  return {
    isExpanded: () => false,
    active: () => undefined,
    toggleExpanded: vi.fn(),
    openTab: vi.fn(),
    ...overrides,
  };
}

describe('BacklogLauncher', () => {
  it('opens the Backlog tab and follows the native toggle when active', async () => {
    const closed = sidebar();
    const { rerender } = render(<BacklogLauncher sidebarRight={closed} sessionId="session-abc" />);
    await userEvent.click(screen.getByRole('button', { name: 'Backlog' }));
    expect(closed.openTab).toHaveBeenCalledWith(TAB_KIND);

    const active = sidebar({
      isExpanded: () => true,
      active: () => ({ kind: TAB_KIND }),
    });
    rerender(<BacklogLauncher sidebarRight={active} sessionId="session-abc" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Backlog' }).getAttribute('data-active')).toBe(
        'true',
      ),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Backlog' }));
    expect(active.toggleExpanded).toHaveBeenCalled();
  });

  it('populates the composer through the official input action without submitting', async () => {
    const setDraft = vi.fn();
    render(
      <BacklogLauncher
        sidebarRight={sidebar()}
        sessionId="session-abc"
        inputActions={{ setDraft }}
      />,
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SEND_TO_CHAT_EVENT, {
          detail: { sessionId: 'session-abc', text: 'Implement TASK-1' },
        }),
      );
    });
    expect(setDraft).toHaveBeenCalledWith('Implement TASK-1');

    setDraft.mockClear();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SEND_TO_CHAT_EVENT, {
          detail: { sessionId: 'session-other', text: 'Wrong session' },
        }),
      );
    });
    expect(setDraft).not.toHaveBeenCalled();
  });

  it('matches session ids with or without the session- prefix', async () => {
    const setDraft = vi.fn();
    render(
      <BacklogLauncher
        sidebarRight={sidebar()}
        sessionId="session-abc"
        inputActions={{ setDraft }}
      />,
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SEND_TO_CHAT_EVENT, {
          detail: { sessionId: 'abc', text: 'Prefixed form' },
        }),
      );
    });
    expect(setDraft).toHaveBeenCalledWith('Prefixed form');
  });
});
